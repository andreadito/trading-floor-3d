import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three + AG Grid + ECharts is ~2.6 MB minified; fine for a demo.
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        how: resolve(import.meta.dirname, 'how-it-was-built.html'),
      },
    },
  },
});
