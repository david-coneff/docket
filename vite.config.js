import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Standalone-HTML-first target (docket §5). `base: './'` keeps asset URLs
// relative so the built bundle runs when opened from any path. The canonical
// tag taxonomy lives at the repo root and is imported with ?raw.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    fs: { allow: [resolve(__dirname)] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
