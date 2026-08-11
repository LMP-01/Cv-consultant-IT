import { defineConfig } from 'vite';

// Déployé sur GitHub Pages : https://lmp-01.github.io/Cv-consultant-IT/
export default defineConfig({
  base: '/Cv-consultant-IT/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  }
});
