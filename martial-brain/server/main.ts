/**
 * Waza server — one deployment serves the app and the sync API.
 *
 * That is the point: a single free *.deno.dev URL, nothing to configure, no
 * domain, and no second provider involved. Sync is entirely optional; the app
 * works offline with no server at all, and this only exists to make several
 * devices converge.
 *
 * Run locally:   deno task dev
 * Deploy:        deployctl deploy --project=<nom> --include=dist,server server/main.ts
 */
import { issueToken, secretMatches, verifyToken } from './auth.ts';
import { pull, push, stats, type EntityRow, type LinkRow } from './store.ts';
import { serveStatic } from './static.ts';

const SECRET = Deno.env.get('SYNC_SECRET') ?? '';
const TOKEN_TTL_MINUTES = Number(Deno.env.get('TOKEN_TTL_MINUTES') ?? '43200');

const PAIR_WINDOW_MS = 15 * 60_000;
const PAIR_MAX_ATTEMPTS = 8;

const kv = await Deno.openKv();

/**
 * Where the built app lives, resolved from THIS module's location rather than
 * the working directory. On Deno Deploy the CWD is not guaranteed to be the
 * project root, and a relative "dist" would silently find nothing.
 */
const STATIC_ROOT = new URL(Deno.env.get('STATIC_ROOT') ?? '../dist/', import.meta.url);

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

/**
 * Rate-limit pairing attempts per IP.
 *
 * A single passphrase guarding the whole graph would otherwise be brute-forcible
 * at network speed. Attempts expire on read rather than on a timer, since there
 * is no background job here.
 */
async function tooManyAttempts(ip: string): Promise<boolean> {
  const now = Date.now();
  const key = ['pair_attempts', ip];
  const entry = await kv.get<number[]>(key);
  const recent = (entry.value ?? []).filter((t) => t > now - PAIR_WINDOW_MS);
  if (recent.length >= PAIR_MAX_ATTEMPTS) return true;
  return false;
}

async function recordAttempt(ip: string): Promise<void> {
  const now = Date.now();
  const key = ['pair_attempts', ip];
  const entry = await kv.get<number[]>(key);
  const recent = (entry.value ?? []).filter((t) => t > now - PAIR_WINDOW_MS);
  recent.push(now);
  await kv.set(key, recent, { expireIn: PAIR_WINDOW_MS });
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (!SECRET) {
    return json(
      { error: 'SYNC_SECRET n’est pas configuré sur ce déploiement.' },
      500,
    );
  }

  if (url.pathname === '/api/pair' && request.method === 'POST') {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';

    if (await tooManyAttempts(ip)) {
      return json({ error: 'Trop de tentatives. Réessaie dans quinze minutes.' }, 429);
    }

    const body = (await request.json().catch(() => ({}))) as { secret?: string };
    if (!(await secretMatches(typeof body.secret === 'string' ? body.secret : '', SECRET))) {
      await recordAttempt(ip);
      return json({ error: 'Phrase secrète incorrecte.' }, 403);
    }

    return json({ token: await issueToken(SECRET, TOKEN_TTL_MINUTES) });
  }

  // Everything past this point needs a paired device.
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await verifyToken(SECRET, token))) {
    return json({ error: 'Appareil non appairé ou jeton expiré.' }, 401);
  }

  if (url.pathname === '/api/sync/pull' && request.method === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since') ?? '0') || 0);
    return json(await pull(kv, since));
  }

  if (url.pathname === '/api/sync/push' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as
      | { entities?: EntityRow[]; links?: LinkRow[] }
      | null;
    if (!body) return json({ error: 'Corps de requête illisible.' }, 400);

    return json(
      await push(
        kv,
        Array.isArray(body.entities) ? body.entities : [],
        Array.isArray(body.links) ? body.links : [],
      ),
    );
  }

  if (url.pathname === '/api/status' && request.method === 'GET') {
    return json(await stats(kv));
  }

  return json({ error: 'Route inconnue.' }, 404);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, url);
      } catch (err) {
        // Never surface a stack trace; it can carry internals.
        console.error('erreur serveur', err);
        return json({ error: 'Erreur interne.' }, 500);
      }
    }

    // Static app. Hash routing means every path that is not a real file can
    // fall back to index.html without any rewrite rules.
    return await serveStatic(STATIC_ROOT, url);
  },
} satisfies Deno.ServeDefaultExport;
