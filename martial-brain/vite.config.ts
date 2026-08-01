import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const resolve = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * The SQLite runtime is loaded as a static asset from public/sqlite/ rather
 * than bundled — see scripts/copy-sqlite.mjs. Tests cannot do that (no HTTP
 * origin), so `#sqlite-loader` points at a Node-side twin instead.
 */
const SQLITE_LOADER_BROWSER = resolve('./src/db/sqliteLoader.ts');
const SQLITE_LOADER_NODE = resolve('./src/db/sqliteLoader.node.ts');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      workbox: {
        // The SQLite runtime and the fonts must both be cached, or an offline
        // launch either cannot open its own database or repaints in a fallback
        // face — and offline launches are the entire point of installing it.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,wasm,mjs,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Combat OS · Second cerveau martial',
        short_name: 'Combat OS',
        description:
          'Graphe de connaissances martiales : techniques, combinaisons, contres, sparrings et principes, tous reliés.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],

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
