/**
 * The SQLite WASM bundle loads sqlite3.wasm with `fetch()`. In the browser that
 * is an http(s) URL; under vitest it resolves to a `file://` URL, which Node's
 * undici refuses with "not implemented... yet...". Teach fetch to read those
 * from disk so the real WASM build — not a mock — backs the unit tests.
 */
import { readFile } from 'node:fs/promises';

const upstream = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('file://')) {
    const bytes = await readFile(new URL(url));
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/wasm' },
    });
  }
  return upstream(input, init);
}) as typeof fetch;
