/**
 * The relation engine (§2.3).
 *
 * An edge is stored ONCE, in canonical order (`from_id < to_id`), and every
 * lookup asks `from_id = ?1 OR to_id = ?1`. Bidirectionality is therefore a
 * property of the storage rather than a rule someone has to remember: there is
 * no way to write an edge that exists in only one direction, and no reverse row
 * to fall out of sync.
 *
 * Direction is not lost — it is recoverable from the endpoints' types, which is
 * all the UI needs ("used in" vs "uses" is decided by which side you are
 * standing on).
 */
import { getEntities, type EntityRecord } from '../db/queries';
import type { Db } from '../db/sqlite';

/** Sort a pair so the same two ids always produce the same row. */
export function canonical(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * An edge's id is derived from its endpoints, not generated.
 *
 * This is what makes sync trivial for links. If two devices, both offline,
 * decide that K001 relates to A001, a random uuid on each would produce two
 * rows for one relation and a unique-index violation the moment they meet.
 * A derived id means both devices independently compute the SAME id, so the
 * merge is an ordinary last-write-wins on one row and convergence is free.
 *
 * Concatenation rather than a hash: a hash collision would silently fuse two
 * unrelated relations, and there is no size pressure that would justify the
 * risk in a personal database.
 */
export function linkId(a: string, b: string, kind = 'rel'): string {
  const [from, to] = canonical(a, b);
  return `${from}~${to}~${kind}`;
}

export interface LinkRow {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
}

/**
 * Create (or revive) an edge. Idempotent.
 *
 * Re-linking something previously unlinked flips the tombstone back rather than
 * inserting a second row — the unique index on (from_id, to_id, kind) is what
 * guarantees a pair can only ever have one edge of a given kind.
 */
export function link(db: Db, a: string, b: string, kind = 'rel'): void {
  if (a === b) return; // a fiche linked to itself is noise, not a relation
  const [from, to] = canonical(a, b);
  const ts = Date.now();
  db.run(
    `INSERT INTO links (id, from_id, to_id, kind, created_at, updated_at, deleted, dirty)
     VALUES ($id, $from, $to, $kind, $ts, $ts, 0, 1)
     ON CONFLICT(from_id, to_id, kind)
     DO UPDATE SET deleted = 0, dirty = 1, updated_at = $ts`,
    { $id: linkId(a, b, kind), $from: from, $to: to, $kind: kind, $ts: ts },
  );
}

/** Tombstone an edge. */
export function unlink(db: Db, a: string, b: string, kind = 'rel'): void {
  const [from, to] = canonical(a, b);
  db.run(
    `UPDATE links SET deleted = 1, dirty = 1, updated_at = $ts
      WHERE from_id = $from AND to_id = $to AND kind = $kind`,
    { $from: from, $to: to, $kind: kind, $ts: Date.now() },
  );
}

export function areLinked(db: Db, a: string, b: string, kind = 'rel'): boolean {
  const [from, to] = canonical(a, b);
  return (
    (db.one<{ n: number }>(
      `SELECT count(*) AS n FROM links
        WHERE from_id = $from AND to_id = $to AND kind = $kind AND deleted = 0`,
      { $from: from, $to: to, $kind: kind },
    )?.n ?? 0) > 0
  );
}

/** Ids of everything connected to `id`, regardless of which side it sits on. */
export function neighbourIds(db: Db, id: string): string[] {
  return db
    .all<{ other: string }>(
      `SELECT CASE WHEN from_id = $id THEN to_id ELSE from_id END AS other
         FROM links
        WHERE (from_id = $id OR to_id = $id) AND deleted = 0`,
      { $id: id },
    )
    .map((r) => r.other);
}

/**
 * The full neighbourhood of a fiche, grouped by module.
 *
 * This is what §2.3 asks a detail view to show: everything referencing this
 * record and everything it references, without distinguishing the two.
 */
export function neighboursByType(
  db: Db,
  id: string,
): Map<EntityRecord['type'], EntityRecord[]> {
  const records = getEntities(db, neighbourIds(db, id));
  const grouped = new Map<EntityRecord['type'], EntityRecord[]>();
  for (const record of records) {
    const bucket = grouped.get(record.type);
    if (bucket) bucket.push(record);
    else grouped.set(record.type, [record]);
  }
  for (const bucket of grouped.values()) bucket.sort((x, y) => x.code.localeCompare(y.code));
  return grouped;
}

/** Replace a fiche's links to one module in a single transaction. */
export function setLinksOfType(
  db: Db,
  id: string,
  targetIds: readonly string[],
  currentIds: readonly string[],
): void {
  const wanted = new Set(targetIds);
  const current = new Set(currentIds);
  db.tx(() => {
    for (const target of wanted) if (!current.has(target)) link(db, id, target);
    for (const target of current) if (!wanted.has(target)) unlink(db, id, target);
  });
}

/** Every live edge — the graph view's input. */
export function allLinks(db: Db): LinkRow[] {
  return db
    .all<{ id: string; from_id: string; to_id: string; kind: string }>(
      `SELECT id, from_id, to_id, kind FROM links WHERE deleted = 0`,
    )
    .map((r) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, kind: r.kind }));
}

/**
 * Breadth-first neighbourhood up to `depth` hops — the graph's focus mode.
 * Returns the reached ids including the origin.
 */
export function egoNetwork(db: Db, id: string, depth: number): Set<string> {
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const other of neighbourIds(db, node)) {
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return seen;
}

/** How many live edges each entity has — drives node size in the graph. */
export function degreeMap(db: Db): Map<string, number> {
  const rows = db.all<{ id: string; n: number }>(
    `SELECT id, count(*) AS n FROM (
        SELECT from_id AS id FROM links WHERE deleted = 0
        UNION ALL
        SELECT to_id   AS id FROM links WHERE deleted = 0
     ) GROUP BY id`,
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}
