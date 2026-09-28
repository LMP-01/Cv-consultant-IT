/**
 * Sync orchestration: pull everything new, merge, then push what is still ours.
 *
 * Pull-before-push on purpose. Pushing first would hand the server rows that
 * are about to lose a merge anyway, and would make the "local is older" case
 * look like a successful write.
 */
import { getMeta, setMeta } from '../db/migrations';
import type { Db } from '../db/sqlite';
import { reconcileDuplicateCodes } from '../domain/ids';
import { mergeEntities, mergeLinks, type MergeStats } from './merge';
import { PAGE_SIZE, type Changeset, type EntityRow, type LinkRow, type PullResponse, type PushResponse } from './protocol';

const CURSOR_KEY = 'sync_cursor';

export interface SyncTransport {
  pull(since: number): Promise<PullResponse>;
  push(body: Changeset & { since: number }): Promise<PushResponse>;
}

export interface SyncReport {
  pulled: MergeStats;
  pushed: number;
  rejected: number;
  renamedCodes: number;
  cursor: number;
}

export function getCursor(db: Db): number {
  return Number(getMeta(db, CURSOR_KEY) ?? 0);
}

export function setCursor(db: Db, cursor: number): void {
  setMeta(db, CURSOR_KEY, String(cursor));
}

/** Rows edited on this device since the last successful push. */
export function collectDirty(db: Db, limit = PAGE_SIZE): Changeset {
  const entities = db.all<EntityRow>(
    `SELECT id, type, code, title, data, created_at, updated_at, deleted
       FROM entities WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ${Number(limit)}`,
  );
  const links = db.all<LinkRow>(
    `SELECT id, from_id, to_id, kind, created_at, updated_at, deleted
       FROM links WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ${Number(limit)}`,
  );
  return { entities, links };
}

export function countDirty(db: Db): number {
  const e = db.one<{ n: number }>(`SELECT count(*) AS n FROM entities WHERE dirty = 1`)?.n ?? 0;
  const l = db.one<{ n: number }>(`SELECT count(*) AS n FROM links WHERE dirty = 1`)?.n ?? 0;
  return e + l;
}

/** Clear the dirty flag only for rows the server actually took. */
export function markPushed(db: Db, applied: Readonly<Record<string, number>>): number {
  const ids = Object.keys(applied);
  if (ids.length === 0) return 0;

  db.tx(() => {
    for (const id of ids) {
      const seq = applied[id] ?? null;
      db.run(`UPDATE entities SET dirty = 0, server_seq = $seq WHERE id = $id`, {
        $seq: seq,
        $id: id,
      });
      db.run(`UPDATE links SET dirty = 0, server_seq = $seq WHERE id = $id`, {
        $seq: seq,
        $id: id,
      });
    }
  });
  return ids.length;
}

/** One full cycle. Safe to call repeatedly; does nothing useful when offline. */
export async function sync(db: Db, transport: SyncTransport): Promise<SyncReport> {
  const totals: MergeStats = { inserted: 0, overwritten: 0, keptLocal: 0 };
  let cursor = getCursor(db);

  // 1. Pull, paging until the server says there is no more.
  for (let page = 0; page < 200; page += 1) {
    const res = await transport.pull(cursor);
    db.tx(() => {
      const e = mergeEntities(db, res.entities, res.seq);
      const l = mergeLinks(db, res.links, res.seq);
      totals.inserted += e.inserted + l.inserted;
      totals.overwritten += e.overwritten + l.overwritten;
      totals.keptLocal += e.keptLocal + l.keptLocal;
      cursor = Math.max(cursor, res.cursor);
      setCursor(db, cursor);
    });
    if (!res.more) break;
  }

  // 2. Two devices offline can both mint K042. Identity is the uuid so nothing
  //    is broken, but duplicate handles are confusing — renumber deterministically.
  const renamed = db.tx(() => reconcileDuplicateCodes(db));

  // 3. Push what is ours, paging until nothing is dirty.
  let pushed = 0;
  let rejected = 0;
  for (let page = 0; page < 200; page += 1) {
    const batch = collectDirty(db);
    if (batch.entities.length === 0 && batch.links.length === 0) break;

    const res = await transport.push({ ...batch, since: cursor });
    const took = markPushed(db, res.applied);
    pushed += took;
    rejected += res.rejected.length;
    cursor = Math.max(cursor, res.cursor);
    setCursor(db, cursor);

    // Nothing accepted and nothing rejected means we would loop forever.
    if (took === 0 && res.rejected.length === 0) break;
    // Rejected rows are stale locally; the next pull brings the winner.
    if (res.rejected.length > 0) {
      db.tx(() => {
        for (const id of res.rejected) {
          db.run(`UPDATE entities SET dirty = 0 WHERE id = $id`, { $id: id });
          db.run(`UPDATE links SET dirty = 0 WHERE id = $id`, { $id: id });
        }
      });
    }
  }

  await db.persist();

  return { pulled: totals, pushed, rejected, renamedCodes: renamed.length, cursor };
}
