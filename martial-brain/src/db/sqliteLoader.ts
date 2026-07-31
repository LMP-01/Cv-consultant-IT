/**
 * Browser entry point for the SQLite WASM runtime.
 *
 * The URL is built at runtime and the import is marked @vite-ignore so the
 * bundler leaves it alone — see scripts/copy-sqlite.mjs for why that matters.
 * BASE_URL rather than a leading slash, so the app still works when deployed
 * under a sub-path.
 *
 * The test suite swaps this file out via the `#sqlite-loader` alias
 * (see vite.config.ts) because Node has no HTTP origin to load it from.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadSqliteModule(): Promise<any> {
  const url = `${import.meta.env.BASE_URL}sqlite/sqlite3.mjs`;
  const mod = (await import(/* @vite-ignore */ url)) as { default: unknown };
  return mod.default;
}
