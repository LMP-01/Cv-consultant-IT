/**
 * Stage the SQLite WASM runtime into public/sqlite/.
 *
 * It must NOT go through the bundler. sqlite3.mjs locates sqlite3.wasm from its
 * own import.meta.url; once Rollup inlines the module into the app chunk that
 * URL becomes the bundle's, the fetch falls through to the SPA's index.html and
 * the browser rejects it with "Incorrect response MIME type. Expected
 * 'application/wasm'". Serving it as a plain static asset keeps the pair
 * together and is why src/db/sqliteLoader.ts imports it by URL.
 *
 * Runs from `predev` and `prebuild`; public/sqlite/ is gitignored.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm');
const to = join(root, 'public/sqlite');

// Only what the ES-module entry actually needs at runtime. The rest of jswasm/
// (the non-module sqlite3.js, the worker1 bundles) is dead weight here.
const FILES = ['sqlite3.mjs', 'sqlite3.wasm', 'sqlite3-opfs-async-proxy.js'];

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
}
console.log(`sqlite runtime staged → public/sqlite/ (${FILES.length} files)`);
