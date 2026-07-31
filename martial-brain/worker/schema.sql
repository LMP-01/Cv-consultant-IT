-- D1 schema — the server side of sync.
--
-- Deliberately a near-mirror of the client's tables (src/db/migrations.ts) so
-- the merge rules on both sides read the same. The server stores no search
-- index and no derived columns: it is a meeting point for rows, not a second
-- application. Every client rebuilds its own FTS index on arrival.

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Monotonic change counter. Allocated in blocks with
-- `UPDATE ... SET value = value + ?  RETURNING value`, which is atomic within
-- the statement, so two Workers pushing at once cannot hand out the same seq.
INSERT OR IGNORE INTO meta (key, value) VALUES ('seq', 0);

CREATE TABLE IF NOT EXISTS entities (
  id         TEXT PRIMARY KEY,
  type       TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  data       TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  server_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entities_seq ON entities(server_seq);

CREATE TABLE IF NOT EXISTS links (
  id         TEXT PRIMARY KEY,
  from_id    TEXT    NOT NULL,
  to_id      TEXT    NOT NULL,
  kind       TEXT    NOT NULL DEFAULT 'rel',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  server_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS links_seq ON links(server_seq);

-- Pairing attempts, for rate limiting. Workers hold no memory between
-- invocations, so the counter has to live somewhere durable.
CREATE TABLE IF NOT EXISTS pair_attempts (
  ip TEXT    NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pair_attempts_ip ON pair_attempts(ip, at);
