/**
 * Optional AI relay.
 *
 * The app calls Gemini / Groq / Mistral straight from the browser by default —
 * the key is the user's, the destination is the provider they chose, and no
 * infrastructure has to exist for §5.2 to work. This relay is the escape hatch
 * for the one thing a browser cannot work around: a provider that refuses
 * cross-origin requests.
 *
 * It stores nothing. The key arrives with the request, is used once, and is
 * gone when the invocation ends — there is no key table to leak and no
 * encryption scheme to get wrong. Access is still gated by device pairing, so
 * this cannot be used as an open proxy by anyone who finds the URL.
 */

const ALLOWED_HOSTS = new Set([
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.mistral.ai',
]);

interface RelayBody {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Refuse anything that is not one of the three providers.
 * Without this the relay would forward wherever a caller pointed it.
 */
function assertAllowed(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('HTTPS uniquement');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`hôte non autorisé : ${url.hostname}`);
  return url;
}

async function relay(request: Request, cors: Record<string, string>): Promise<Response> {
  const body = (await request.json().catch(() => null)) as RelayBody | null;
  if (!body?.url) {
    return new Response(JSON.stringify({ error: 'Requête relais invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let target: URL;
  try {
    target = assertAllowed(body.url);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'cible refusée' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }

  const upstream = await fetch(target.toString(), {
    method: body.method ?? 'POST',
    headers: body.headers ?? {},
    ...(body.body === undefined ? {} : { body: body.body }),
  });

  // Pass the provider's status and payload through untouched, so the client's
  // 429 handling and error messages keep working exactly as they do direct.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      ...cors,
    },
  });
}

export function proxyGenerate(
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  return relay(request, cors);
}

export function listModels(request: Request, cors: Record<string, string>): Promise<Response> {
  return relay(request, cors);
}
