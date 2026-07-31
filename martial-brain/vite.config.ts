import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The sqlite-wasm package ships a browser bundle plus a `node` export that, in
// 3.51.0-build1, points at a file the tarball does not contain. Vitest resolves
// the `node` condition and would explode, so tests alias the module straight to
// the browser bundle (see tests/setup.ts for the file:// fetch shim it needs).
const sqliteBrowserBundle = fileURLToPath(
  new URL(
    './node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.mjs',
    import.meta.url,
  ),
);

export default defineConfig({
  plugins: [react()],

  // sqlite-wasm must not be pre-bundled: esbuild would rewrite the import.meta.url
  // the loader uses to locate sqlite3.wasm.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },

  worker: { format: 'es' },

  build: {
    target: 'es2022',
    sourcemap: true,
  },

  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    alias: { '@sqlite.org/sqlite-wasm': sqliteBrowserBundle },
  },
});
