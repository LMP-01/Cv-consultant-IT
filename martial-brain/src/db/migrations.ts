/**
 * Schema — a property graph on SQLite.
 *
 * `entities` holds every module's records (§4 of the cahier des charges) and
 * `links` holds the edges between them (§2.3). One table each rather than 15,
 * because all modules share the same shape and the per-module differences live
 * in the descriptors of src/domain/schema.ts. Adding a future module
 * (nutrition, blessures — §6) is then a descriptor, not a migration.
 *
 * Bidirectionality is structural, not a rule to be maintained: an edge is
 * stored once with `from_id < to_id` (canonical order) and every lookup asks
 * `from_id = ?1 OR to_id = ?1`. It is not expressible to have an edge that
 * exists in only one direction.
 *
 * Typed fields live in `data` as JSON and stay queryable through
 * json_extract(), which the analytics aggregates rely on.
 */
import type { Db } from './sqlite';

export const SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: /* sql */ `
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entities (
        id          TEXT PRIMARY KEY,          -- uuid, stable across devices
        type        TEXT NOT NULL,             -- descriptor key: 'technique', 'combo', …
        code        TEXT NOT NULL,             -- human handle: K001, A003, PR001
        title       TEXT NOT NULL,
        data        TEXT NOT NULL DEFAULT '{}',-- descriptor-driven fields, JSON
        search_text TEXT NOT NULL DEFAULT '',  -- flattened searchable fields
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,          -- ms; drives last-write-wins on sync
        deleted     INTEGER NOT NULL DEFAULT 0,-- tombstone, never a hard DELETE
        dirty       INTEGER NOT NULL DEFAULT 1,-- awaiting push to the server
        server_seq  INTEGER                    -- server-assigned sequence, null until pushed
      );

      CREATE INDEX IF NOT EXISTS entities_type  ON entities(type, deleted);
      CREATE INDEX IF NOT EXISTS entities_code  ON entities(code);
      CREATE INDEX IF NOT EXISTS entities_dirty ON entities(dirty) WHERE dirty = 1;
      CREATE INDEX IF NOT EXISTS entities_seq   ON entities(server_seq);

      -- Codes are NOT unique-indexed on purpose: two offline devices can both
      -- mint K042, and a UNIQUE index would turn that into a failed sync pull
      -- instead of something reconcilable. Duplicates are renumbered after
      -- merge (see src/sync/engine.ts). Identity is the uuid, never the code.

      CREATE TABLE IF NOT EXISTS links (
        id         TEXT PRIMARY KEY,
        from_id    TEXT NOT NULL,              -- canonical: from_id < to_id
        to_id      TEXT NOT NULL,
        kind       TEXT NOT NULL DEFAULT 'rel',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted    INTEGER NOT NULL DEFAULT 0,
        dirty      INTEGER NOT NULL DEFAULT 1,
        server_seq INTEGER
      );

      CREATE UNIQUE INDEX IF NOT EXISTS links_pair  ON links(from_id, to_id, kind);
      CREATE INDEX IF NOT EXISTS links_from  ON links(from_id, deleted);
      CREATE INDEX IF NOT EXISTS links_to    ON links(to_id, deleted);
      CREATE INDEX IF NOT EXISTS links_dirty ON links(dirty) WHERE dirty = 1;
      CREATE INDEX IF NOT EXISTS links_seq   ON links(server_seq);

      -- Media metadata only; the blobs live in IndexedDB (videos do not belong
      -- inside an image that gets re-serialised on every write).
      CREATE TABLE IF NOT EXISTS media (
        id         TEXT PRIMARY KEY,
        entity_id  TEXT NOT NULL,
        kind       TEXT NOT NULL,              -- 'image' | 'video'
        name       TEXT NOT NULL DEFAULT '',
        mime       TEXT NOT NULL DEFAULT '',
        size       INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS media_entity ON media(entity_id);

      -- remove_diacritics 2 makes "desequilibre" find "déséquilibre" and
      -- "muay thai" find "Muay Thaï" — non-negotiable for French + romaji.
      CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
        code,
        title,
        body,
        tokenize = "unicode61 remove_diacritics 2"
      );

      CREATE TRIGGER IF NOT EXISTS entities_fts_ai AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(rowid, code, title, body)
        VALUES (new.rowid, new.code, new.title, new.search_text);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_fts_ad AFTER DELETE ON entities BEGIN
        DELETE FROM entities_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS entities_fts_au AFTER UPDATE ON entities BEGIN
        DELETE FROM entities_fts WHERE rowid = old.rowid;
        INSERT INTO entities_fts(rowid, code, title, body)
        VALUES (new.rowid, new.code, new.title, new.search_text);
      END;
    `,
  },
];

/** Bring the database up to SCHEMA_VERSION. Safe to call on every boot. */
export function migrate(db: Db): void {
  db.exec('PRAGMA foreign_keys = ON;');

  const current = readVersion(db);

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.tx(() => {
      db.exec(m.sql);
      db.run(
        `INSERT INTO meta(key, value) VALUES ('schema_version', $v)
           ON CONFLICT(key) DO UPDATE SET value = $v`,
        { $v: String(m.version) },
      );
    });
  }
}

function readVersion(db: Db): number {
  const hasMeta = db.one<{ n: number }>(
    `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'meta'`,
  );
  if (!hasMeta?.n) return 0;
  const row = db.one<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'schema_version'`,
  );
  return row ? Number(row.value) : 0;
}

/** Read a value from the meta table. */
export function getMeta(db: Db, key: string): string | undefined {
  return db.one<{ value: string }>(`SELECT value FROM meta WHERE key = $k`, { $k: key })
    ?.value;
}

/** Write a value to the meta table. */
export function setMeta(db: Db, key: string, value: string): void {
  db.run(
    `INSERT INTO meta(key, value) VALUES ($k, $v)
       ON CONFLICT(key) DO UPDATE SET value = $v`,
    { $k: key, $v: value },
  );
}
