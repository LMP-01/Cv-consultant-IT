/**
 * Test-only entry point for the SQLite WASM runtime.
 *
 * Node cannot load the browser copy over HTTP, and the package's own `node`
 * export points at a file the 3.51.0-build1 tarball does not ship, so the
 * browser bundle is imported straight from node_modules. tests/setup.ts adds
 * the file:// fetch shim it needs to reach sqlite3.wasm.
 *
 * The tests therefore run against the real WASM build — same FTS5, same
 * tokenizer, same json1 — rather than a stand-in.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Held in a variable so TypeScript does not try to resolve types for a raw
// emscripten bundle that ships none; the path is resolved at runtime relative
// to this module.
const BUNDLE = '../../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.mjs';

export async function loadSqliteModule(): Promise<any> {
  const mod = (await import(/* @vite-ignore */ BUNDLE)) as { default: unknown };
  return mod.default;
}
