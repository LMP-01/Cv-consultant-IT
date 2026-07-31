/**
 * Static file serving for the built app.
 *
 * Hand-written rather than pulling in a file-server package: it is a few dozen
 * lines, it keeps the deployment to a single dependency-free entry point, and
 * the one thing that actually matters here — refusing to serve anything outside
 * dist/ — is easier to be sure of when it is right there in the file.
 *
 * Two constraints come from running on Deno Deploy rather than a local Deno:
 *
 *   · The root is resolved from this module's own URL, never from the working
 *     directory. Locally the CWD happens to be the project root; on Deploy it
 *     is not guaranteed to be, and a relative "dist" would find nothing —
 *     producing a site that 404s on every request with no useful error.
 *
 *   · No Deno.realPath(). The deployed filesystem is read-only and that call is
 *     not something to depend on; if it threw, every request would fall through
 *     to the not-found path and the whole site would be dead. Traversal is
 *     prevented by normalising the path as a string instead, which is what
 *     actually resolves "..", encoded or not — realPath was never the part
 *     doing the work.
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
 * Collapse "." and ".." segments, purely on the string.
 *
 * A ".." that would climb above the root is dropped rather than honoured, so
 * the result can never point outside it. Percent-encoding is decoded first —
 * "%2e%2e" is "..", and checking the raw URL for ".." would miss it.
 */
function normalise(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname; // malformed escapes: treat literally rather than throw
  }

  const out: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    // A NUL byte would truncate the path at the syscall boundary.
    if (segment.includes('\0')) return '';
    out.push(segment);
  }
  return out.join('/');
}

async function open(root: URL, relative: string): Promise<[URL, Deno.FsFile] | null> {
  if (relative === '') return null;
  const target = new URL(relative, root);

  // Belt and braces: after normalisation the path cannot escape, but the URL
  // resolution is the thing actually used to open the file, so check it too.
  if (!target.href.startsWith(root.href)) return null;

  const file = await Deno.open(target, { read: true }).catch(() => null);
  if (!file) return null;

  const info = await file.stat().catch(() => null);
  if (!info?.isFile) {
    file.close();
    return null;
  }
  return [target, file];
}

/**
 * Serve a file from `root`, falling back to the app shell.
 *
 * `root` is a directory URL (trailing slash required) so that relative
 * resolution against it behaves.
 */
export async function serveStatic(root: URL, url: URL): Promise<Response> {
  const wanted = normalise(url.pathname);

  let found =
    wanted === ''
      ? null
      : ((await open(root, wanted)) ?? (await open(root, `${wanted}/index.html`)));

  // Unknown path: hand back the shell. Routing is hash-based, so this only
  // ever happens for a genuinely missing asset or a hard-refreshed deep link.
  found ??= await open(root, 'index.html');
  if (!found) return new Response('Not found', { status: 404 });

  const [target, file] = found;
  const path = target.pathname;

  // Vite fingerprints everything in assets/, so those can be cached hard;
  // index.html and the service worker must not be, or an update never lands.
  const immutable = /\/assets\/|\.wasm$/.test(path);

  return new Response(file.readable, {
    headers: {
      'Content-Type': contentType(path),
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    },
  });
}
