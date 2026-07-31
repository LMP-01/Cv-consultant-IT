/**
 * Last-write-wins merge, kept pure so it can be tested without a server.
 *
 * Why LWW and not a CRDT: this is a single-person knowledge base. The realistic
 * conflict is "I edited K003 on my phone at the dojo and on my laptop that
 * evening", not two people typing into one field at once. LWW on whole records
 * resolves that correctly and costs a fraction of the complexity. What LWW must
 * not do is lose data silently, which is what the rules below are about.
 *
 * Rules, in order:
 *   1. Unknown row            → insert.
 *   2. Incoming strictly newer → overwrite, clear the dirty flag.
 *   3. Local strictly newer    → keep local AND keep it dirty, so the next push
 *                                carries it up. The server's copy is stale.
 *   4. Exact tie              → break on id, so every device lands on the same
 *                                answer without another round trip.
 *
 * Tombstones (deleted = 1) are ordinary rows here: a delete competes on
 * updated_at like any other edit, so "deleted on phone, edited on laptop
 * afterwards" correctly resurrects the record.
 */
import { buildSearchText } from '../db/queries';
import type { Db } from '../db/sqlite';
import { entityDef, isEntityKey } from '../domain/schema';
import type { EntityRow, LinkRow } from './protocol';

export type Decision = 'insert' | 'overwrite' | 'keep-local' | 'identical';

export interface Local {
  updated_at: number;
  id: string;
}

/** The whole conflict policy, in one testable function. */
export function decide(incoming: { id: string; updated_at: number }, local?: Local): Decision {
  if (!local) return 'insert';
  if (incoming.updated_at > local.updated_at) return 'overwrite';
  if (incoming.updated_at < local.updated_at) return 'keep-local';
  // Same millisecond: pick deterministically rather than by arrival order.
  if (incoming.id === local.id) return 'identical';
  return incoming.id > local.id ? 'overwrite' : 'keep-local';
}

export interface MergeStats {
  inserted: number;
  overwritten: number;
  keptLocal: number;
}

export function mergeEntities(
  db: Db,
  rows: readonly EntityRow[],
  seq: Readonly<Record<string, number>>,
): MergeStats {
  const stats: MergeStats = { inserted: 0, overwritten: 0, keptLocal: 0 };

  for (const row of rows) {
    if (!isEntityKey(row.type)) continue; // a module this build does not know

    const local = db.one<Local>(
      `SELECT id, updated_at FROM entities WHERE id = $id`,
      { $id: row.id },
    );
    const decision = decide(row, local);
    const serverSeq = seq[row.id] ?? null;

    if (decision === 'keep-local') {
      // Remember how far we have read, but leave the row dirty to push.
      stats.keptLocal += 1;
      continue;
    }
    if (decision === 'identical') {
      db.run(`UPDATE entities SET dirty = 0, server_seq = $seq WHERE id = $id`, {
        $seq: serverSeq,
        $id: row.id,
      });
      continue;
    }

    // Recompute rather than transport: the search index then always matches
    // THIS build's descriptors, even if the sending device ran an older one.
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      data = {};
    }
    const search = buildSearchText(entityDef(row.type), row.title, data);

    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text,
                             created_at, updated_at, deleted, dirty, server_seq)
       VALUES ($id, $type, $code, $title, $data, $search,
               $created, $updated, $deleted, 0, $seq)
       ON CONFLICT(id) DO UPDATE SET
         type = $type, code = $code, title = $title, data = $data,
         search_text = $search, created_at = $created, updated_at = $updated,
         deleted = $deleted, dirty = 0, server_seq = $seq`,
      {
        $id: row.id,
        $type: row.type,
        $code: row.code,
        $title: row.title,
        $data: row.data,
        $search: search,
        $created: row.created_at,
        $updated: row.updated_at,
        $deleted: row.deleted ? 1 : 0,
        $seq: serverSeq,
      },
    );

    if (decision === 'insert') stats.inserted += 1;
    else stats.overwritten += 1;
  }

  return stats;
}

export function mergeLinks(
  db: Db,
  rows: readonly LinkRow[],
  seq: Readonly<Record<string, number>>,
): MergeStats {
  const stats: MergeStats = { inserted: 0, overwritten: 0, keptLocal: 0 };

  for (const row of rows) {
    const local = db.one<Local>(`SELECT id, updated_at FROM links WHERE id = $id`, {
      $id: row.id,
    });
    const decision = decide(row, local);
    const serverSeq = seq[row.id] ?? null;

    if (decision === 'keep-local') {
      stats.keptLocal += 1;
      continue;
    }
    if (decision === 'identical') {
      db.run(`UPDATE links SET dirty = 0, server_seq = $seq WHERE id = $id`, {
        $seq: serverSeq,
        $id: row.id,
      });
      continue;
    }

    db.run(
      `INSERT INTO links (id, from_id, to_id, kind, created_at, updated_at,
                          deleted, dirty, server_seq)
       VALUES ($id, $from, $to, $kind, $created, $updated, $deleted, 0, $seq)
       ON CONFLICT(id) DO UPDATE SET
         from_id = $from, to_id = $to, kind = $kind, created_at = $created,
         updated_at = $updated, deleted = $deleted, dirty = 0, server_seq = $seq`,
      {
        $id: row.id,
        $from: row.from_id,
        $to: row.to_id,
        $kind: row.kind,
        $created: row.created_at,
        $updated: row.updated_at,
        $deleted: row.deleted ? 1 : 0,
        $seq: serverSeq,
      },
    );

    if (decision === 'insert') stats.inserted += 1;
    else stats.overwritten += 1;
  }

  return stats;
}

/**
 * Drop edges whose endpoints this device does not have.
 *
 * A pull page can carry an edge before the fiche it points at. The edge is not
 * wrong — it just cannot be displayed yet — so it stays in the table and simply
 * does not resolve; every read joins through `entities` anyway. This function
 * exists for the opposite case: an endpoint that was hard-removed, leaving an
 * edge that can never resolve.
 */
export function pruneDanglingLinks(db: Db): number {
  const before = db.one<{ n: number }>(`SELECT count(*) AS n FROM links WHERE deleted = 0`)?.n ?? 0;
  db.run(
    `UPDATE links SET deleted = 1, dirty = 1, updated_at = $ts
      WHERE deleted = 0
        AND (from_id NOT IN (SELECT id FROM entities)
          OR to_id   NOT IN (SELECT id FROM entities))`,
    { $ts: Date.now() },
  );
  const after = db.one<{ n: number }>(`SELECT count(*) AS n FROM links WHERE deleted = 0`)?.n ?? 0;
  return before - after;
}
