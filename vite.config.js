import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    fs: { allow: [resolve(__dirname)] },
  },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'docket.html'),
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
