/**
 * Generic entity CRUD. One code path serves all 15 modules; the differences
 * come from the descriptor passed in.
 */
import { entityDef, isEntityKey, prefixFor, type EntityDef, type EntityKey } from '../domain/schema';
import { nextCode, uuid } from '../domain/ids';
import type { Db, Row } from './sqlite';

export interface EntityRecord {
  id: string;
  type: EntityKey;
  code: string;
  title: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface EntityInput {
  title: string;
  data?: Record<string, unknown>;
  /** Override the generated code — used when importing. */
  code?: string;
  id?: string;
}

const now = (): number => Date.now();

/* ── Search text ──────────────────────────────────────────────────────────── */

/** Field types that carry words worth indexing. */
const TEXTUAL = new Set(['text', 'longtext', 'select', 'multiselect', 'tags', 'sequence']);

/**
 * Flatten a record into the text FTS should see.
 *
 * Driven by the descriptor rather than by dumping the whole JSON blob, so keys
 * and numbers never pollute results: searching "100" should not surface every
 * fiche whose progression happens to be 100.
 */
export function buildSearchText(
  def: EntityDef,
  title: string,
  data: Record<string, unknown>,
): string {
  const parts: string[] = [title];
  for (const field of def.fields) {
    const indexed = field.searchable ?? TEXTUAL.has(field.type);
    if (!indexed) continue;
    const value = data[field.name];
    if (value == null) continue;
    if (Array.isArray(value)) parts.push(value.map(String).join(' '));
    else parts.push(String(value));
  }
  return parts.filter(Boolean).join(' \n');
}

/* ── Mapping ──────────────────────────────────────────────────────────────── */

function toRecord(row: Row): EntityRecord {
  const type = String(row.type);
  if (!isEntityKey(type)) throw new Error(`row ${String(row.id)} has unknown type ${type}`);
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(String(row.data ?? '{}')) as Record<string, unknown>;
  } catch {
    // A record whose JSON got corrupted is still worth showing by title.
    data = {};
  }
  return {
    id: String(row.id),
    type,
    code: String(row.code),
    title: String(row.title),
    data,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const SELECT = `SELECT id, type, code, title, data, created_at, updated_at FROM entities`;

/* ── Reads ────────────────────────────────────────────────────────────────── */

export function getEntity(db: Db, id: string): EntityRecord | undefined {
  const row = db.one(`${SELECT} WHERE id = $id AND deleted = 0`, { $id: id });
  return row ? toRecord(row) : undefined;
}

export function getEntityByCode(db: Db, code: string): EntityRecord | undefined {
  const row = db.one(`${SELECT} WHERE code = $code AND deleted = 0`, {
    $code: code.trim().toUpperCase(),
  });
  return row ? toRecord(row) : undefined;
}

export function getEntities(db: Db, ids: readonly string[]): EntityRecord[] {
  if (ids.length === 0) return [];
  const holes = ids.map((_, i) => `$i${i}`).join(', ');
  const bind = Object.fromEntries(ids.map((id, i) => [`$i${i}`, id]));
  return db
    .all(`${SELECT} WHERE id IN (${holes}) AND deleted = 0`, bind)
    .map(toRecord);
}

export interface ListOptions {
  orderBy?: 'code' | 'title' | 'updated' | 'created';
  limit?: number;
}

export function listEntities(
  db: Db,
  type: EntityKey,
  opts: ListOptions = {},
): EntityRecord[] {
  const order = {
    code: 'code ASC',
    title: 'title COLLATE NOCASE ASC',
    updated: 'updated_at DESC',
    created: 'created_at DESC',
  }[opts.orderBy ?? 'code'];

  return db
    .all(
      `${SELECT} WHERE type = $type AND deleted = 0 ORDER BY ${order}` +
        (opts.limit ? ` LIMIT ${Number(opts.limit)}` : ''),
      { $type: type },
    )
    .map(toRecord);
}

export function countEntities(db: Db, type: EntityKey): number {
  return (
    db.one<{ n: number }>(
      `SELECT count(*) AS n FROM entities WHERE type = $type AND deleted = 0`,
      { $type: type },
    )?.n ?? 0
  );
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

export function createEntity(
  db: Db,
  type: EntityKey,
  input: EntityInput,
): EntityRecord {
  const def = entityDef(type);
  const data = input.data ?? {};
  const ts = now();
  const record: EntityRecord = {
    id: input.id ?? uuid(),
    type,
    code: input.code ?? nextCode(db, prefixFor(def, data)),
    title: input.title.trim(),
    data,
    createdAt: ts,
    updatedAt: ts,
  };

  db.run(
    `INSERT INTO entities (id, type, code, title, data, search_text,
                           created_at, updated_at, deleted, dirty)
     VALUES ($id, $type, $code, $title, $data, $search, $created, $updated, 0, 1)`,
    {
      $id: record.id,
      $type: record.type,
      $code: record.code,
      $title: record.title,
      $data: JSON.stringify(record.data),
      $search: buildSearchText(def, record.title, record.data),
      $created: record.createdAt,
      $updated: record.updatedAt,
    },
  );
  return record;
}

export interface EntityPatch {
  title?: string;
  data?: Record<string, unknown>;
}

export function updateEntity(db: Db, id: string, patch: EntityPatch): EntityRecord {
  const current = getEntity(db, id);
  if (!current) throw new Error(`entity not found: ${id}`);

  const def = entityDef(current.type);
  const title = (patch.title ?? current.title).trim();
  const data = patch.data ? { ...current.data, ...patch.data } : current.data;

  // The library module's prefix follows its `kind`; changing the kind should
  // renumber the code so AR004 does not stay AR004 after becoming a podcast.
  const wantedPrefix = prefixFor(def, data);
  const code = current.code.startsWith(wantedPrefix)
    ? current.code
    : nextCode(db, wantedPrefix);

  const ts = now();
  db.run(
    `UPDATE entities
        SET title = $title, data = $data, search_text = $search,
            code = $code, updated_at = $updated, dirty = 1
      WHERE id = $id`,
    {
      $title: title,
      $data: JSON.stringify(data),
      $search: buildSearchText(def, title, data),
      $code: code,
      $updated: ts,
      $id: id,
    },
  );

  return { ...current, title, data, code, updatedAt: ts };
}

/**
 * Tombstone a record and every edge touching it.
 *
 * Never a hard DELETE: the row has to survive to tell other devices it is gone.
 */
export function deleteEntity(db: Db, id: string): void {
  const ts = now();
  db.tx(() => {
    db.run(
      `UPDATE entities SET deleted = 1, dirty = 1, updated_at = $ts WHERE id = $id`,
      { $ts: ts, $id: id },
    );
    db.run(
      `UPDATE links SET deleted = 1, dirty = 1, updated_at = $ts
        WHERE (from_id = $id OR to_id = $id) AND deleted = 0`,
      { $ts: ts, $id: id },
    );
  });
}

/* ── Search ───────────────────────────────────────────────────────────────── */

export interface SearchFilters {
  types?: readonly EntityKey[];
  /** Field equality, e.g. { discipline: ['Kyokushin'], distance: ['Courte'] }. */
  fields?: Readonly<Record<string, readonly string[]>>;
  tags?: readonly string[];
  /** Restrict to records linked to this entity. */
  linkedTo?: string;
  limit?: number;
  /** See toMatchExpression. 'or' is for matching a whole sentence. */
  match?: 'and' | 'or';
}

/**
 * Turn user input into an FTS5 MATCH expression.
 *
 * FTS5 treats bare punctuation and operators as syntax; a user typing
 * "mae geri (droite)" must not produce a syntax error. Every token is quoted,
 * and a trailing prefix-match is added so search feels live while typing.
 *
 * Two modes, because the two callers want opposite things:
 *   · 'and' (default) — the search box, where each word you add narrows.
 *   · 'or'  — matching a whole natural-language sentence against the base.
 *     "les contres à longue distance sur mae geri" has no fiche containing
 *     every word, so AND returns nothing; OR surfaces the fiches worth
 *     looking at and bm25 puts the best first. Words under three characters
 *     are dropped: with OR they would match half the base.
 */
export function toMatchExpression(
  query: string,
  mode: 'and' | 'or' = 'and',
): string | undefined {
  const all = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);

  const tokens = mode === 'or' ? all.filter((t) => t.length >= 3) : all;
  if (tokens.length === 0) return undefined;

  if (mode === 'or') return tokens.map((t) => `"${t}"`).join(' OR ');
  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(' AND ');
}

export function searchEntities(
  db: Db,
  query: string,
  filters: SearchFilters = {},
): EntityRecord[] {
  const bind: Record<string, string | number> = {};
  const where: string[] = ['e.deleted = 0'];
  let from = 'FROM entities e';
  let order = 'e.code ASC';

  const match = toMatchExpression(query, filters.match ?? 'and');
  if (match) {
    from += ' JOIN entities_fts f ON f.rowid = e.rowid';
    where.push('entities_fts MATCH $match');
    bind.$match = match;
    order = 'bm25(entities_fts, 4.0, 8.0, 1.0)'; // code and title outweigh body
  }

  if (filters.types?.length) {
    const holes = filters.types.map((_, i) => `$t${i}`).join(', ');
    filters.types.forEach((t, i) => (bind[`$t${i}`] = t));
    where.push(`e.type IN (${holes})`);
  }

  // json_extract keeps the descriptor-driven fields queryable even though they
  // live in a JSON column.
  let f = 0;
  for (const [field, values] of Object.entries(filters.fields ?? {})) {
    if (!values.length) continue;
    const holes = values.map((_, i) => `$f${f}_${i}`).join(', ');
    values.forEach((v, i) => (bind[`$f${f}_${i}`] = v));
    bind[`$fk${f}`] = `$.${field}`;
    where.push(`json_extract(e.data, $fk${f}) IN (${holes})`);
    f += 1;
  }

  for (const [i, tag] of (filters.tags ?? []).entries()) {
    bind[`$tag${i}`] = tag;
    where.push(
      `EXISTS (SELECT 1 FROM json_each(e.data, '$.tags') WHERE json_each.value = $tag${i})`,
    );
  }

  if (filters.linkedTo) {
    bind.$linked = filters.linkedTo;
    where.push(`EXISTS (
      SELECT 1 FROM links l
       WHERE l.deleted = 0
         AND (   (l.from_id = $linked AND l.to_id   = e.id)
              OR (l.to_id   = $linked AND l.from_id = e.id))
    )`);
  }

  const sql = `SELECT e.id, e.type, e.code, e.title, e.data, e.created_at, e.updated_at
               ${from}
               WHERE ${where.join(' AND ')}
               ORDER BY ${order}
               LIMIT ${Number(filters.limit ?? 200)}`;

  return db.all(sql, bind).map(toRecord);
}

/** Distinct values a field actually holds, for building filter chips. */
export function distinctFieldValues(db: Db, type: EntityKey, field: string): string[] {
  return db
    .all<{ v: string }>(
      `SELECT DISTINCT json_extract(data, $path) AS v
         FROM entities
        WHERE type = $type AND deleted = 0 AND v IS NOT NULL AND v <> ''
        ORDER BY v`,
      { $path: `$.${field}`, $type: type },
    )
    .map((r) => r.v);
}

/** Every tag in use, with how often — powers the tag cloud and filters. */
export function allTags(db: Db): { tag: string; count: number }[] {
  return db.all<{ tag: string; count: number }>(
    `SELECT json_each.value AS tag, count(*) AS count
       FROM entities, json_each(entities.data, '$.tags')
      WHERE entities.deleted = 0
      GROUP BY tag
      ORDER BY count DESC, tag ASC`,
  );
}
