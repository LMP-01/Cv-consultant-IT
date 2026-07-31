/**
 * When to sync, without anyone pressing a button.
 *
 * The triggers are chosen from how a martial-arts notebook actually gets used:
 * you type into it at the dojo on a phone, then open it that evening on a
 * laptop and expect the session to be there.
 *
 *   · on open        — the laptop catches up before you look at it
 *   · on refocus     — switching back to the tab picks up the phone's work
 *   · on reconnect   — the queue drains the moment the network returns
 *   · after a write  — debounced, so a burst of edits is one round trip
 *   · periodically   — while the app stays open on both devices
 *
 * Honest limit: a PWA cannot sync in the background. The Background Sync API is
 * Chromium-only and iOS has nothing equivalent, so nothing happens while the
 * app is closed. Everything below runs only while a tab is alive.
 *
 * Failures are deliberately quiet. Losing the network mid-session is normal in
 * a gym basement; dirty rows simply stay queued and the next trigger retries.
 * The UI shows the last outcome rather than interrupting.
 */
import type { Db } from '../db/sqlite';
import { countDirty, sync, type SyncReport, type SyncTransport } from './engine';

/** Debounce after a write: long enough to batch, short enough to feel live. */
const AFTER_WRITE_MS = 2_500;
/** Heartbeat while the app stays open. */
const PERIODIC_MS = 5 * 60_000;
/** Never start a second cycle within this window of the last one. */
const MIN_GAP_MS = 3_000;

export type SyncState =
  | { phase: 'idle'; last?: SyncReport; at?: number }
  | { phase: 'syncing' }
  | { phase: 'error'; message: string; at: number };

export interface AutoSyncOptions {
  db: Db;
  transport: () => SyncTransport | undefined;
  onState: (state: SyncState) => void;
  /** Called after a cycle that changed local data, so the UI can re-render. */
  onChanged: () => void;
}

export class AutoSync {
  #opts: AutoSyncOptions;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #interval: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #lastRun = 0;
  #stopped = false;
  #listeners: (() => void)[] = [];

  constructor(opts: AutoSyncOptions) {
    this.#opts = opts;
  }

  start(): void {
    this.#stopped = false;

    const onFocus = (): void => {
      if (document.visibilityState === 'visible') void this.run('refocus');
    };
    const onOnline = (): void => void this.run('reconnexion');

    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onOnline);
    this.#listeners = [
      () => document.removeEventListener('visibilitychange', onFocus),
      () => window.removeEventListener('online', onOnline),
    ];

    this.#interval = setInterval(() => void this.run('périodique'), PERIODIC_MS);
    void this.run('ouverture');
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#interval) clearInterval(this.#interval);
    for (const off of this.#listeners) off();
    this.#listeners = [];
  }

  /** Call after a local write; coalesces a burst of edits into one cycle. */
  nudge(): void {
    if (this.#stopped) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.run('après modification'), AFTER_WRITE_MS);
  }

  /** Run a cycle now. Safe to call from anywhere; overlapping calls collapse. */
  async run(reason: string): Promise<void> {
    if (this.#stopped || this.#running) return;

    const transport = this.#opts.transport();
    if (!transport) return; // not paired: nothing to do, and that is fine

    // Skip a periodic tick that has nothing to say.
    const idle = Date.now() - this.#lastRun < MIN_GAP_MS;
    if (idle && countDirty(this.#opts.db) === 0) return;

    if (!navigator.onLine) return;

    this.#running = true;
    this.#opts.onState({ phase: 'syncing' });

    try {
      const report = await sync(this.#opts.db, transport);
      this.#lastRun = Date.now();
      this.#opts.onState({ phase: 'idle', last: report, at: this.#lastRun });
      const changed =
        report.pulled.inserted + report.pulled.overwritten + report.renamedCodes > 0;
      if (changed) this.#opts.onChanged();
    } catch (err) {
      this.#lastRun = Date.now();
      this.#opts.onState({
        phase: 'error',
        message: `${reason} — ${err instanceof Error ? err.message : String(err)}`,
        at: this.#lastRun,
      });
    } finally {
      this.#running = false;
    }
  }
}
