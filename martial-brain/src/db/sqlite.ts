/**
 * SQLite WASM bootstrap.
 *
 * Backend selection, best first:
 *   1. `opfs-sahpool` — real file persistence, incremental writes, and (unlike
 *      the classic OPFS VFS) it runs on the main thread: no Atomics.wait, so no
 *      COOP/COEP headers and no worker plumbing.
 *   2. `indexeddb`   — in-memory database whose full image is written back to
 *      IndexedDB after each mutation, debounced. Personal knowledge bases stay
 *      in the low megabytes, so re-serialising is cheap.
 *   3. `memory`      — no persistence. Used by the unit tests.
 *
 * The build is verified to carry FTS5, math functions and json1; see
 * tests/sqlite.test.ts, which asserts those rather than trusting the vendor.
 */
import { loadSqliteModule } from '#sqlite-loader';

export type SqlValue = string | number | null | Uint8Array;
export type Params = Record<string, SqlValue> | SqlValue[];
export type Row = Record<string, SqlValue>;

export type Backend = 'opfs-sahpool' | 'indexeddb' | 'memory';

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
const PERSIST_DEBOUNCE_MS = 400;

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
  #pool: any;
  #filename: string;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pending: Promise<void> | null = null;

  constructor(
    sqlite3: Sqlite3,
    raw: any,
    readonly backend: Backend,
    opts: { pool?: any; filename?: string } = {},
  ) {
    this.#sqlite3 = sqlite3;
    this.#raw = raw;
    this.#pool = opts.pool;
    this.#filename = opts.filename ?? 'waza.sqlite3';
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

  tx<T>(fn: () => T): T {
    this.#raw.exec('BEGIN');
    try {
      const out = fn();
      this.#raw.exec('COMMIT');
      this.#schedulePersist();
      return out;
    } catch (err) {
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

  #schedulePersist(): void {
    if (this.backend !== 'indexeddb') return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.persist(), PERSIST_DEBOUNCE_MS);
  }

  async persist(): Promise<void> {
    if (this.backend !== 'indexeddb') return;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    // Collapse concurrent calls: one write at a time, latest image wins.
    if (this.#pending) return this.#pending;
    const { idbSet } = await import('./idb');
    this.#pending = idbSet(IDB_STORE, IDB_KEY, this.exportBytes()).finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  async importImage(bytes: Uint8Array): Promise<void> {
    assertSqliteImage(bytes);

    if (this.backend === 'opfs-sahpool' && this.#pool) {
      // Write straight into the VFS; the next boot opens the new file.
      this.#raw.close();
      await this.#pool.importDb(`/${this.#filename}`, bytes);
      return;
    }

    // In-memory backend: park the image where the next boot looks for it.
    const { idbSet } = await import('./idb');
    await idbSet(IDB_STORE, IDB_KEY, bytes);
  }

  close(): void {
    if (this.#timer) clearTimeout(this.#timer);
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
    throw new Error('Fichier trop petit pour être une base Waza.');
  }
  if (new TextDecoder().decode(bytes.slice(0, header.length)) !== header) {
    throw new Error('Ce fichier n’est pas une base SQLite (.sqlite3).');
  }
}

/** Open the application database, choosing the best backend available. */
export async function openDatabase(filename = 'waza.sqlite3'): Promise<Db> {
  const sqlite3 = await loadSqlite();

  // 1. OPFS SAH pool — persistent and main-thread safe.
  if (typeof navigator !== 'undefined' && 'storage' in navigator) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'waza-opfs' });
      const db = new pool.OpfsSAHPoolDb(`/${filename}`);
      return new SqliteDb(sqlite3, db, 'opfs-sahpool', { pool, filename });
    } catch {
      // Safari < 17, Firefox private windows, locked pool… fall through.
    }
  }

  // 2. In-memory, mirrored into IndexedDB.
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

  // 3. Nothing persistent available (unit tests).
  return new SqliteDb(sqlite3, new sqlite3.oo1.DB(':memory:'), 'memory');
}

/** Open a throwaway in-memory database. Used by the test-suite. */
export async function openMemoryDatabase(): Promise<Db> {
  const sqlite3 = await loadSqlite();
  return new SqliteDb(sqlite3, new sqlite3.oo1.DB(':memory:'), 'memory');
}
