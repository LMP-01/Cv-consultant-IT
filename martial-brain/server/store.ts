/**
 * Sync storage on Deno KV.
 *
 * The server is a meeting point for rows, not a second application: it holds no
 * search index and runs no business logic beyond deciding which of two versions
 * of a row is newer. That rule is written to match src/sync/merge.ts exactly —
 * newer `updated_at` wins, exact ties break on id — so the two sides can never
 * disagree about who won.
 *
 * Key layout:
 *   ["seq"]              monotonic change counter
 *   ["entity" | "link", id]   the row itself, carrying its current server_seq
 *   ["by_seq", seq]      → { kind, id }, so a pull is an ordered range scan
 *
 * The by_seq index is what makes "give me everything after cursor N" cheap.
 * When a row is updated its old by_seq entry is deleted, so the index holds
 * exactly one entry per row and a pull never returns a stale duplicate.
 */

export interface EntityRow {
  id: string;
  type: string;
  code: string;
  title: string;
  data: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

export interface LinkRow {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

export type Row = EntityRow | LinkRow;
export type Kind = 'entity' | 'link';

interface Stored {
  row: Row;
  seq: number;
  kind: Kind;
}

export const PAGE_SIZE = 500;

/** Deno KV reads at most 10 keys per getMany call. */
const GET_MANY_MAX = 10;

/**
 * getMany without the 10-key ceiling.
 *
 * A first sync pushes the whole graph — a hundred rows is normal — so every
 * read here has to be chunked or the request dies with "Too many ranges".
 * Chunks are fetched in parallel; ordering is preserved so callers can zip the
 * results back against their input.
 */
async function getAll(kv: Deno.Kv, keys: Deno.KvKey[]): Promise<(Stored | null)[]> {
  const chunks: Deno.KvKey[][] = [];
  for (let i = 0; i < keys.length; i += GET_MANY_MAX) {
    chunks.push(keys.slice(i, i + GET_MANY_MAX));
  }
  const results = await Promise.all(
    chunks.map((chunk) => kv.getMany<Stored[]>(chunk)),
  );
  return results.flat().map((entry) => (entry.value as Stored | null) ?? null);
}

/** Allocate `count` consecutive sequence numbers atomically. */
async function allocate(kv: Deno.Kv, count: number): Promise<number> {
  // Compare-and-set rather than a blind increment: two devices pushing at the
  // same moment must not be handed the same numbers, or one device's changes
  // would be invisible to the other's cursor.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await kv.get<number>(['seq']);
    const base = current.value ?? 0;
    const next = base + count;
    const res = await kv
      .atomic()
      .check(current)
      .set(['seq'], next)
      .commit();
    if (res.ok) return next;
  }
  throw new Error('Impossible d’allouer un numéro de séquence (trop de conflits).');
}

export async function head(kv: Deno.Kv): Promise<number> {
  return (await kv.get<number>(['seq'])).value ?? 0;
}

export interface PushOutcome {
  applied: Record<string, number>;
  rejected: string[];
  cursor: number;
}

export async function push(
  kv: Deno.Kv,
  entities: EntityRow[],
  links: LinkRow[],
): Promise<PushOutcome> {
  const incoming: { kind: Kind; row: Row }[] = [
    ...entities.slice(0, PAGE_SIZE).map((row) => ({ kind: 'entity' as const, row })),
    ...links.slice(0, PAGE_SIZE).map((row) => ({ kind: 'link' as const, row })),
  ];

  const applied: Record<string, number> = {};
  const rejected: string[] = [];
  if (incoming.length === 0) return { applied, rejected, cursor: await head(kv) };

  // Read current state first so the decision is made before anything is written.
  const held = await getAll(kv, incoming.map(({ kind, row }) => [kind, row.id]));

  const winners: { kind: Kind; row: Row; previousSeq?: number }[] = [];
  incoming.forEach(({ kind, row }, i) => {
    const mine = held[i];
    const wins =
      !mine ||
      row.updated_at > mine.row.updated_at ||
      (row.updated_at === mine.row.updated_at && row.id > mine.row.id);

    if (!wins) {
      rejected.push(row.id);
      return;
    }
    winners.push(mine ? { kind, row, previousSeq: mine.seq } : { kind, row });
  });

  if (winners.length === 0) return { applied, rejected, cursor: await head(kv) };

  const top = await allocate(kv, winners.length);
  let next = top - winners.length + 1;

  // KV atomic operations are capped, so commit in batches. Each row and its
  // index entry stay in the same batch, so the index can never point at a row
  // that was not written.
  const BATCH = 20;
  let batch = kv.atomic();
  let inBatch = 0;

  for (const { kind, row, previousSeq } of winners) {
    const seq = next;
    next += 1;
    applied[row.id] = seq;

    batch = batch
      .set([kind, row.id], { row, seq, kind } satisfies Stored)
      .set(['by_seq', seq], { kind, id: row.id });
    if (previousSeq !== undefined) batch = batch.delete(['by_seq', previousSeq]);

    inBatch += 1;
    if (inBatch >= BATCH) {
      await batch.commit();
      batch = kv.atomic();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();

  return { applied, rejected, cursor: top };
}

export interface PullPage {
  entities: EntityRow[];
  links: LinkRow[];
  seq: Record<string, number>;
  cursor: number;
  more: boolean;
}

export async function pull(kv: Deno.Kv, since: number): Promise<PullPage> {
  const refs: { kind: Kind; id: string; seq: number }[] = [];

  const iter = kv.list<{ kind: Kind; id: string }>(
    { start: ['by_seq', since + 1], end: ['by_seq', Number.MAX_SAFE_INTEGER] },
    { limit: PAGE_SIZE },
  );
  for await (const entry of iter) {
    const seq = entry.key[1];
    if (typeof seq !== 'number') continue;
    refs.push({ kind: entry.value.kind, id: entry.value.id, seq });
  }

  const entities: EntityRow[] = [];
  const links: LinkRow[] = [];
  const seq: Record<string, number> = {};

  if (refs.length > 0) {
    const rows = await getAll(kv, refs.map((r) => [r.kind, r.id]));
    rows.forEach((stored, i) => {
      const ref = refs[i];
      if (!stored || !ref) return;
      seq[stored.row.id] = ref.seq;
      if (ref.kind === 'entity') entities.push(stored.row as EntityRow);
      else links.push(stored.row as LinkRow);
    });
  }

  const more = refs.length === PAGE_SIZE;
  // Only advance to the last row actually sent. Jumping to the head while a
  // page was truncated would skip everything in between — the one sync bug
  // nobody notices until data is missing.
  const cursor = more ? (refs[refs.length - 1]?.seq ?? since) : await head(kv);

  return { entities, links, seq, cursor, more };
}

export async function stats(kv: Deno.Kv): Promise<{ entities: number; links: number; cursor: number }> {
  let entities = 0;
  let links = 0;
  for await (const entry of kv.list<Stored>({ prefix: ['entity'] })) {
    if (!entry.value.row.deleted) entities += 1;
  }
  for await (const entry of kv.list<Stored>({ prefix: ['link'] })) {
    if (!entry.value.row.deleted) links += 1;
  }
  return { entities, links, cursor: await head(kv) };
}
