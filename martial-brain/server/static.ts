/**
 * Static file serving for the built app.
 *
 * Hand-written rather than pulling in a file-server package: it is thirty lines,
 * it keeps the deployment to a single dependency-free entry point, and the one
 * thing that actually matters here — refusing to serve anything outside dist/ —
 * is easier to be sure of when it is right there in the file.
 */

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  // Without the exact type the browser refuses to compile the module, which is
  // how SQLite fails to load if this is ever wrong.
  wasm: 'application/wasm',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

function contentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Resolve a request path inside `root`, or null if it escapes.
 *
 * The check is done on the resolved absolute path, not on the raw string:
 * filtering for ".." in the URL misses encoded and normalised variants.
 */
async function resolve(root: string, pathname: string): Promise<string | null> {
  const base = await Deno.realPath(root);
  const decoded = decodeURIComponent(pathname);
  const candidate = `${base}/${decoded.replace(/^\/+/, '')}`;

  try {
    const real = await Deno.realPath(candidate);
    if (real !== base && !real.startsWith(`${base}/`)) return null;
    return real;
  } catch {
    return null;
  }
}

export async function serveStatic(root: string, url: URL): Promise<Response> {
  const wanted = url.pathname === '/' ? '/index.html' : url.pathname;
  let path = await resolve(root, wanted);

  if (path) {
    const info = await Deno.stat(path).catch(() => null);
    if (info?.isDirectory) path = await resolve(root, `${wanted}/index.html`);
  }

  // Unknown path: hand back the shell. Routing is hash-based, so this only
  // ever happens for a genuinely missing asset or a hard-refreshed deep link.
  if (!path) path = await resolve(root, '/index.html');
  if (!path) return new Response('Not found', { status: 404 });

  const file = await Deno.open(path, { read: true }).catch(() => null);
  if (!file) return new Response('Not found', { status: 404 });

  const immutable = /\/assets\/|\.wasm$/.test(path);
  return new Response(file.readable, {
    headers: {
      'Content-Type': contentType(path),
      // Vite fingerprints everything in assets/, so those can be cached hard;
      // index.html and the service worker must not be, or an update never lands.
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    },
  });
}
