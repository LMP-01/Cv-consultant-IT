/**
 * Waza sync Worker.
 *
 * Three jobs: pair a device, exchange rows, and proxy AI calls so provider keys
 * never sit in page JavaScript and CORS never gets in the way.
 *
 * Raw D1 statements rather than an ORM: two tables and six queries do not repay
 * a schema-definition layer plus its codegen step, and the merge rule is easier
 * to audit against the client's when both are written in the same SQL.
 */
import { issueToken, secretMatches, verifyToken } from './auth';
import { proxyGenerate, listModels } from './ai';

export interface Env {
  DB: D1Database;
  SYNC_SECRET: string;
  TOKEN_TTL_MINUTES?: string;
}

interface EntityRow {
  id: string;
  type: string;
  code: string;
  title: string;
  data: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

interface LinkRow {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const PAGE_SIZE = 500;
const PAIR_WINDOW_MS = 15 * 60_000;
const PAIR_MAX_ATTEMPTS = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);

    try {
      if (!env.SYNC_SECRET) {
        return json({ error: 'SYNC_SECRET n’est pas configuré sur ce Worker.' }, 500);
      }

      if (url.pathname === '/pair' && request.method === 'POST') {
        return await handlePair(request, env);
      }

      // Everything past this point needs a paired device.
      const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!(await verifyToken(env.SYNC_SECRET, token))) {
        return json({ error: 'Appareil non appairé ou jeton expiré.' }, 401);
      }

      if (url.pathname === '/sync/pull' && request.method === 'GET') {
        return await handlePull(url, env);
      }
      if (url.pathname === '/sync/push' && request.method === 'POST') {
        return await handlePush(request, env);
      }
      if (url.pathname === '/ai/generate' && request.method === 'POST') {
        return await proxyGenerate(request, CORS);
      }
      if (url.pathname === '/ai/models' && request.method === 'POST') {
        return await listModels(request, CORS);
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        return await handleStatus(env);
      }

      return json({ error: 'Route inconnue.' }, 404);
    } catch (err) {
      // Never surface a stack trace; it can carry binding names and SQL.
      console.error('worker error', err);
      return json({ error: 'Erreur interne.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

/* ── Pairing ──────────────────────────────────────────────────────────────── */

async function handlePair(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();

  // Workers keep no memory between invocations, so the attempt counter lives
  // in D1. Without it, a single passphrase would be brute-forceable at the
  // speed of the edge network.
  await env.DB.prepare(`DELETE FROM pair_attempts WHERE at < ?`)
    .bind(now - PAIR_WINDOW_MS)
    .run();

  const recent = await env.DB.prepare(
    `SELECT count(*) AS n FROM pair_attempts WHERE ip = ? AND at >= ?`,
  )
    .bind(ip, now - PAIR_WINDOW_MS)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= PAIR_MAX_ATTEMPTS) {
    return json({ error: 'Trop de tentatives. Réessaie dans quinze minutes.' }, 429);
  }

  const body = (await request.json().catch(() => ({}))) as { secret?: string };
  const given = typeof body.secret === 'string' ? body.secret : '';

  if (!(await secretMatches(given, env.SYNC_SECRET))) {
    await env.DB.prepare(`INSERT INTO pair_attempts (ip, at) VALUES (?, ?)`)
      .bind(ip, now)
      .run();
    return json({ error: 'Phrase secrète incorrecte.' }, 403);
  }

  const ttl = Number(env.TOKEN_TTL_MINUTES ?? '43200');
  return json({ token: await issueToken(env.SYNC_SECRET, ttl) });
}

/* ── Pull ─────────────────────────────────────────────────────────────────── */

async function handlePull(url: URL, env: Env): Promise<Response> {
  const since = Math.max(0, Number(url.searchParams.get('since') ?? '0') || 0);

  const [entities, links, head] = await Promise.all([
    env.DB.prepare(
      `SELECT id, type, code, title, data, created_at, updated_at, deleted, server_seq
         FROM entities WHERE server_seq > ? ORDER BY server_seq ASC LIMIT ?`,
    )
      .bind(since, PAGE_SIZE)
      .all<EntityRow & { server_seq: number }>(),
    env.DB.prepare(
      `SELECT id, from_id, to_id, kind, created_at, updated_at, deleted, server_seq
         FROM links WHERE server_seq > ? ORDER BY server_seq ASC LIMIT ?`,
    )
      .bind(since, PAGE_SIZE)
      .all<LinkRow & { server_seq: number }>(),
    env.DB.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first<{ value: number }>(),
  ]);

  const seq: Record<string, number> = {};
  for (const row of entities.results) seq[row.id] = row.server_seq;
  for (const row of links.results) seq[row.id] = row.server_seq;

  /*
   * The cursor may only advance to a point where EVERYTHING at or below it has
   * been delivered. The two tables are paged independently, so their results
   * are not a single clean prefix: entities might be cut off at seq 500 while
   * links happen to reach 700. Advancing to 700 would silently skip entity rows
   * 501–699 forever, which is the one bug in a sync engine nobody notices until
   * data is missing.
   *
   * So: a table that filled its page bounds the cursor at its own last row;
   * a table that did not is exhausted and bounds nothing. If neither filled,
   * we have everything and can jump to the server's head.
   */
  const bound = (rows: { server_seq: number }[]): number =>
    rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.server_seq ?? since) : Infinity;

  const limit = Math.min(bound(entities.results), bound(links.results));
  const more = Number.isFinite(limit);
  const cursor = more ? limit : (head?.value ?? since);

  return json({
    entities: entities.results.filter((r) => r.server_seq <= cursor).map(strip),
    links: links.results.filter((r) => r.server_seq <= cursor).map(strip),
    seq,
    cursor,
    more,
  });
}

function strip<T extends { server_seq?: number }>(row: T): Omit<T, 'server_seq'> {
  const { server_seq: _ignored, ...rest } = row;
  return rest;
}

/* ── Push ─────────────────────────────────────────────────────────────────── */

async function handlePush(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { entities?: EntityRow[]; links?: LinkRow[] }
    | null;
  if (!body) return json({ error: 'Corps de requête illisible.' }, 400);

  const entities = Array.isArray(body.entities) ? body.entities.slice(0, PAGE_SIZE) : [];
  const links = Array.isArray(body.links) ? body.links.slice(0, PAGE_SIZE) : [];
  const incoming = entities.length + links.length;

  if (incoming === 0) {
    const head = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first<{
      value: number;
    }>();
    return json({ applied: {}, rejected: [], cursor: head?.value ?? 0 });
  }

  // Read what we already hold for these ids, so the merge decision is made
  // before any write and the whole push can go out as one batch.
  const held = new Map<string, number>();
  for (const [table, rows] of [
    ['entities', entities],
    ['links', links],
  ] as const) {
    if (rows.length === 0) continue;
    const holes = rows.map(() => '?').join(',');
    const existing = await env.DB.prepare(
      `SELECT id, updated_at FROM ${table} WHERE id IN (${holes})`,
    )
      .bind(...rows.map((r) => r.id))
      .all<{ id: string; updated_at: number }>();
    for (const row of existing.results) held.set(row.id, row.updated_at);
  }

  const applied: Record<string, number> = {};
  const rejected: string[] = [];
  const winners: { kind: 'entity' | 'link'; row: EntityRow | LinkRow }[] = [];

  const judge = (kind: 'entity' | 'link', row: EntityRow | LinkRow): void => {
    const mine = held.get(row.id);
    // Same rule as src/sync/merge.ts: newer wins, exact ties break on id.
    const wins = mine === undefined || row.updated_at > mine;
    if (wins) winners.push({ kind, row });
    else rejected.push(row.id);
  };
  for (const row of entities) judge('entity', row);
  for (const row of links) judge('link', row);

  if (winners.length === 0) {
    const head = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first<{
      value: number;
    }>();
    return json({ applied, rejected, cursor: head?.value ?? 0 });
  }

  // Allocate a contiguous block of sequence numbers in a single atomic
  // statement, so two Workers pushing simultaneously cannot collide.
  const head = await env.DB.prepare(
    `UPDATE meta SET value = value + ? WHERE key = 'seq' RETURNING value`,
  )
    .bind(winners.length)
    .first<{ value: number }>();

  const top = head?.value ?? winners.length;
  let next = top - winners.length + 1;

  const statements = winners.map(({ kind, row }) => {
    const seq = next;
    next += 1;
    applied[row.id] = seq;

    if (kind === 'entity') {
      const e = row as EntityRow;
      return env.DB.prepare(
        `INSERT INTO entities (id, type, code, title, data, created_at, updated_at, deleted, server_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, code = excluded.code, title = excluded.title,
           data = excluded.data, created_at = excluded.created_at,
           updated_at = excluded.updated_at, deleted = excluded.deleted,
           server_seq = excluded.server_seq`,
      ).bind(e.id, e.type, e.code, e.title, e.data, e.created_at, e.updated_at, e.deleted ? 1 : 0, seq);
    }

    const l = row as LinkRow;
    return env.DB.prepare(
      `INSERT INTO links (id, from_id, to_id, kind, created_at, updated_at, deleted, server_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         from_id = excluded.from_id, to_id = excluded.to_id, kind = excluded.kind,
         created_at = excluded.created_at, updated_at = excluded.updated_at,
         deleted = excluded.deleted, server_seq = excluded.server_seq`,
    ).bind(l.id, l.from_id, l.to_id, l.kind, l.created_at, l.updated_at, l.deleted ? 1 : 0, seq);
  });

  await env.DB.batch(statements);

  return json({ applied, rejected, cursor: top });
}

/* ── Status ───────────────────────────────────────────────────────────────── */

async function handleStatus(env: Env): Promise<Response> {
  const [entities, links, head] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM entities WHERE deleted = 0`).first<{ n: number }>(),
    env.DB.prepare(`SELECT count(*) AS n FROM links WHERE deleted = 0`).first<{ n: number }>(),
    env.DB.prepare(`SELECT value FROM meta WHERE key = 'seq'`).first<{ value: number }>(),
  ]);
  return json({ entities: entities?.n ?? 0, links: links?.n ?? 0, cursor: head?.value ?? 0 });
}
