import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolve = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * The SQLite runtime is loaded as a static asset from public/sqlite/ rather
 * than bundled — see scripts/copy-sqlite.mjs. Tests cannot do that (no HTTP
 * origin), so `#sqlite-loader` points at a Node-side twin instead.
 */
const SQLITE_LOADER_BROWSER = resolve('./src/db/sqliteLoader.ts');
const SQLITE_LOADER_NODE = resolve('./src/db/sqliteLoader.node.ts');

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '#sqlite-loader': SQLITE_LOADER_BROWSER },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
  },

  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    alias: { '#sqlite-loader': SQLITE_LOADER_NODE },
  },
});
