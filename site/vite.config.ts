import { defineConfig } from 'vite';

// GitHub Pages : le workflow de déploiement fournit BASE_PATH (dérivé du nom du dépôt).
export default defineConfig({
  base: process.env.BASE_PATH || '/ia-data-consulting/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  }
});
