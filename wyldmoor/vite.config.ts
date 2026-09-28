import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    host: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Wyldmoor',
        short_name: 'Wyldmoor',
        description: 'Un RPG de créatures sauvages en monde ouvert, inspiré de la première génération.',
        theme_color: '#1c2b1e',
        background_color: '#0d1410',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell only; the (large) 3D assets are cached on
        // first use by the runtime route below so installs stay light.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['assets/creatures/**', 'assets/characters/**', 'assets/nature/**', 'assets/town/**', 'assets/village/**', 'assets/textures/**', 'assets/env/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /assets\/(creatures|characters|nature|town|village|textures|env|models)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wyldmoor-3d-assets',
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
