/**
 * SQLite WASM bootstrap.
 *
 * The database lives in WASM memory and its full image is written back to
 * IndexedDB after every transaction. A personal knowledge base is a few
 * megabytes, so re-serialising costs milliseconds — and in exchange every read
 * in the app stays synchronous, which is why no screen has a loading state and
 * no query needs caching.
 *
 * Why not OPFS, which would give incremental writes: both OPFS VFSes need
 * `FileSystemFileHandle.createSyncAccessHandle()`, and that API is exposed
 * ONLY inside a Worker — the classic VFS additionally wants Atomics.wait and
 * therefore COOP/COEP headers. Measured here, on the main thread:
 *   createSyncAccessHandle: false
 * Moving SQLite into a Worker would make every read asynchronous and ripple a
 * message-passing layer through every component, to speed up writes that are
 * already imperceptible. If the database ever outgrows this, the Worker
 * backend is the upgrade — the `Db` interface is what it would implement.
 *
 * The build is verified to carry FTS5, math functions and json1; see
 * tests/sqlite.test.ts, which asserts those rather than trusting the vendor.
 */
import { loadSqliteModule } from '#sqlite-loader';

export type SqlValue = string | number | null | Uint8Array;
export type Params = Record<string, SqlValue> | SqlValue[];
export type Row = Record<string, SqlValue>;

export type Backend = 'indexeddb' | 'memory';

export interface Db {
  readonly backend: Backend;
  /** Run a query and return every row as an object. */
  all<T = Row>(sql: string, params?: Params): T[];
  /** Run a query and return the first row, or undefined. */
  one<T = Row>(sql: string, params?: Params): T | undefined;
  /** Run a single statement for effect. */
  run(sql: string, params?: Params): void;
  /** Run one or more statements with no bindings (migrations, pragmas). */
  exec(sql: string): void;
  /** Run `fn` inside a transaction, rolling back if it throws. */
  tx<T>(fn: () => T): T;
  /** Flush to durable storage. No-op unless the backend needs it. */
  persist(): Promise<void>;
  /**
   * True when writes have happened that persist() has not yet stored.
   * Tracked on every backend so the durability rules stay testable in memory.
   */
  readonly hasUnsavedChanges: boolean;
  /** The database as a .sqlite file image, for the export feature. */
  exportBytes(): Uint8Array;
  /**
   * Replace the stored database with an image, for the import feature.
   * The caller must reload the page afterwards: every open handle, cached
   * query and React tree still refers to the old database.
   */
  importImage(bytes: Uint8Array): Promise<void>;
  close(): void;
}

const IDB_STORE = 'kv';
const IDB_KEY = 'sqlite-image';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sqlite3 = any;

let modulePromise: Promise<Sqlite3> | null = null;

function loadSqlite(): Promise<Sqlite3> {
  modulePromise ??= loadSqliteModule().then((init: (opts: unknown) => Promise<Sqlite3>) =>
    init({
      print: () => {},
      printErr: (msg: string) => {
        // The OPFS probe failing is expected on browsers without it; don't shout.
        if (!/OPFS/i.test(String(msg))) console.warn('[sqlite]', msg);
      },
    }),
  );
  return modulePromise;
}

class SqliteDb implements Db {
  #raw: any;
  #sqlite3: Sqlite3;
  #pending: Promise<void> | null = null;
  #dirty = false;
  /** Transaction nesting depth; only depth 0 → 1 issues a real BEGIN. */
  #depth = 0;

  constructor(
    sqlite3: Sqlite3,
    raw: any,
    readonly backend: Backend,
  ) {
    this.#sqlite3 = sqlite3;
    this.#raw = raw;
  }

  all<T = Row>(sql: string, params?: Params): T[] {
    return this.#raw.exec({
      sql,
      ...(params === undefined ? {} : { bind: params }),
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as T[];
  }

  one<T = Row>(sql: string, params?: Params): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params?: Params): void {
    this.#raw.exec({ sql, ...(params === undefined ? {} : { bind: params }) });
    this.#schedulePersist();
  }

  exec(sql: string): void {
    this.#raw.exec(sql);
    this.#schedulePersist();
  }

  /**
   * Re-entrant transaction.
   *
   * Composed operations nest naturally — saving a fiche wraps createEntity and
   * setLinksOfType, and setLinksOfType is itself transactional when called on
   * its own. SQLite rejects a nested BEGIN outright, so only the outermost call
   * opens and commits; inner calls just run inside it and let a throw propagate
   * to the one rollback that matters. Anything else would make callers keep
   * track of whether they are already inside a transaction.
   */
  tx<T>(fn: () => T): T {
    if (this.#depth > 0) {
      this.#depth += 1;
      try {
        return fn();
      } finally {
        this.#depth -= 1;
      }
    }

    this.#raw.exec('BEGIN');
    this.#depth = 1;
    try {
      const out = fn();
      this.#raw.exec('COMMIT');
      // Depth must drop BEFORE scheduling: #schedulePersist skips while a
      // transaction is open, so clearing it in a `finally` instead would make
      // every transactional write silently non-durable.
      this.#depth = 0;
      this.#schedulePersist();
      return out;
    } catch (err) {
      this.#depth = 0;
      try {
        this.#raw.exec('ROLLBACK');
      } catch {
        /* rollback of an already-aborted tx is not interesting */
      }
      throw err;
    }
  }

  exportBytes(): Uint8Array {
    return this.#sqlite3.capi.sqlite3_js_db_export(this.#raw);
  }

  /**
   * Start writing the image out now — no debounce.
   *
   * A debounce here loses data: reloading the page a few hundred milliseconds
   * after saving a fiche would drop it, and `pagehide` cannot rescue it because
   * an IndexedDB write is asynchronous and the page is already going away.
   * Writes in this app are explicit saves, not keystrokes, so there is no burst
   * to smooth out — and statements inside a transaction are skipped, so a
   * transaction serialises once at commit rather than per statement.
   */
  #schedulePersist(): void {
    if (this.#depth > 0) return; // mid-transaction: wait for the commit
    this.#dirty = true;
    if (this.backend === 'indexeddb') void this.persist();
  }

  get hasUnsavedChanges(): boolean {
    return this.#dirty;
  }

  async persist(): Promise<void> {
    if (!this.#dirty) return;
    if (this.backend !== 'indexeddb') {
      this.#dirty = false; // nowhere to write; nothing is pending either
      return;
    }

    // One writer at a time; anything that arrives while a write is in flight
    // is picked up by the loop below rather than racing it.
    if (this.#pending) {
      await this.#pending;
      return this.persist();
    }

    this.#dirty = false;
    const { idbSet } = await import('./idb');
    // Copy out of the WASM heap: it can move while the write is in flight.
    const image = new Uint8Array(this.exportBytes());
    this.#pending = idbSet(IDB_STORE, IDB_KEY, image).finally(() => {
      this.#pending = null;
    });

    try {
      await this.#pending;
    } catch (err) {
      this.#dirty = true; // failed write must not look like a successful one
      throw err;
    }

    if (this.#dirty) await this.persist();
  }

  async importImage(bytes: Uint8Array): Promise<void> {
    assertSqliteImage(bytes);
    // Park the image where the next boot looks for it, and make sure a pending
    // write of the OLD database cannot land on top of it afterwards.
    this.#dirty = false;
    if (this.#pending) await this.#pending.catch(() => undefined);
    const { idbSet } = await import('./idb');
    await idbSet(IDB_STORE, IDB_KEY, bytes);
  }

  close(): void {
    this.#raw.close();
  }
}

/**
 * Reject anything that is not a SQLite file before it replaces someone's
 * knowledge base. The header is the first 16 bytes of every SQLite image.
 */
export function assertSqliteImage(bytes: Uint8Array): void {
  const header = 'SQLite format 3\0';
  if (bytes.byteLength < header.length) {
    throw new Error('Fichier trop petit pour être une base Combat OS.');
  }
  if (new TextDecoder().decode(bytes.slice(0, header.length)) !== header) {
    throw new Error('Ce fichier n’est pas une base SQLite (.sqlite3).');
  }
}

/** Open the application database. */
export async function openDatabase(): Promise<Db> {
  const sqlite3 = await loadSqlite();

  // In-memory, mirrored into IndexedDB after every transaction.
  if (typeof indexedDB !== 'undefined') {
    const { idbGet } = await import('./idb');
    const saved = await idbGet<Uint8Array | ArrayBuffer>(IDB_STORE, IDB_KEY).catch(
      () => undefined,
    );
    const db = new sqlite3.oo1.DB(':memory:');
    if (saved) {
      const bytes = saved instanceof Uint8Array ? saved : new Uint8Array(saved);
      if (bytes.byteLength > 0) {
        const p = sqlite3.wasm.allocFromTypedArray(bytes);
        sqlite3.capi.sqlite3_deserialize(
          db.pointer,
          'main',
          p,
          bytes.byteLength,
          bytes.byteLength,
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
            sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
        );
      }
    }
    return new SqliteDb(sqlite3, db, 'indexeddb');
  }

  // No IndexedDB at all: private windows with storage disabled, and the tests.
  return new SqliteDb(sqlite3, new sqlite3.oo1.DB(':memory:'), 'memory');
}

/** Open a throwaway in-memory database. Used by the test-suite. */
export async function openMemoryDatabase(): Promise<Db> {
  const sqlite3 = await loadSqlite();
  return new SqliteDb(sqlite3, new sqlite3.oo1.DB(':memory:'), 'memory');
}
