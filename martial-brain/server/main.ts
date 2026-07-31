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

/**
 * KV is opened lazily and is allowed to fail.
 *
 * `await Deno.openKv()` at module scope was a real bug: KV is not provisioned
 * on every deployment, and a throw at module load means the entrypoint never
 * starts — so the whole site dies, including the parts that never needed a
 * database. Sync is an optional feature and must fail like one: the app is
 * served either way, and only the /api/sync routes report the problem.
 */
let kvOnce: Promise<Deno.Kv | null> | null = null;

function openKv(): Promise<Deno.Kv | null> {
  kvOnce ??= (async (): Promise<Deno.Kv | null> => {
    // When KV is not enabled, `Deno.openKv` is not merely unusable — it does
    // not exist, and calling it raises "Deno.openKv is not a function"
    // synchronously. A `.catch()` never sees that, which is why this has to be
    // a guard rather than a rejection handler.
    if (typeof Deno.openKv !== 'function') {
      console.error(
        'Deno KV n’est pas activé sur ce déploiement — la synchronisation est désactivée.',
      );
      return null;
    }
    try {
      return await Deno.openKv();
    } catch (err) {
      console.error('Deno KV indisponible — la synchronisation est désactivée.', err);
      return null;
    }
  })();
  return kvOnce;
}

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
async function tooManyAttempts(kv: Deno.Kv, ip: string): Promise<boolean> {
  const now = Date.now();
  const key = ['pair_attempts', ip];
  const entry = await kv.get<number[]>(key);
  const recent = (entry.value ?? []).filter((t) => t > now - PAIR_WINDOW_MS);
  if (recent.length >= PAIR_MAX_ATTEMPTS) return true;
  return false;
}

async function recordAttempt(kv: Deno.Kv, ip: string): Promise<void> {
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

  // Every route below stores or reads state, so they all need KV. Refusing
  // clearly here beats a stack trace, and leaves the app itself untouched.
  const kv = await openKv();
  if (!kv) {
    return json(
      {
        error:
          'Le stockage de synchronisation (Deno KV) n’est pas disponible sur ce ' +
          'déploiement. L’application fonctionne normalement ; seule la ' +
          'synchronisation entre appareils est désactivée.',
      },
      503,
    );
  }

  if (url.pathname === '/api/pair' && request.method === 'POST') {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';

    if (await tooManyAttempts(kv, ip)) {
      return json({ error: 'Trop de tentatives. Réessaie dans quinze minutes.' }, 429);
    }

    const body = (await request.json().catch(() => ({}))) as { secret?: string };
    if (!(await secretMatches(typeof body.secret === 'string' ? body.secret : '', SECRET))) {
      await recordAttempt(kv, ip);
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
