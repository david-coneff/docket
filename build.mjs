#!/usr/bin/env node
/*
 * build.mjs — docket single-file HTML build (rhiz-Partition modality B / DS-002).
 *
 * Rolls the modular `src/` tree up into ONE self-contained `docket.html` that
 * opens from file:// with zero network. esbuild bundles + minifies the JS and
 * CSS; this script inlines both into the `src/index.html` shell. There is no
 * Vite, no dev server, no HTML-entry plugin — just one command an AI agent (or
 * a human) runs non-interactively:
 *
 *     node build.mjs            # one-shot production build
 *     node build.mjs --watch    # rebuild on change (esbuild context)
 *
 * `docket.html` is a BUILD OUTPUT, never the source of truth — only `src/` is
 * canonical. The emitted file carries a generated-artifact banner.
 */
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(ROOT, 'src/main.js');
const SHELL = resolve(ROOT, 'src/index.html');
const OUT = resolve(ROOT, 'docket.html');
const watch = process.argv.includes('--watch');

const BANNER = `<!--\n  GENERATED FILE — do not edit by hand.\n  Source of truth: src/ (modular ESM + CSS). Rebuild: node build.mjs\n  Single-file roll-up per rhiz-Partition modality B (DS-002).\n-->\n`;

/** esbuild settings shared by build + watch. */
const options = {
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  write: false,
  // Required so esbuild assigns output paths to the JS + CSS it emits; nothing
  // is actually written to disk because write:false keeps the result in memory.
  outdir: 'dist',
  // .md files (e.g. the default tag taxonomy) import as their raw text — the
  // esbuild equivalent of Vite's `?raw` query suffix.
  loader: { '.md': 'text' },
};

/** Inline the bundled JS + CSS into the HTML shell and write the single file. */
function emit(outputFiles) {
  let js = '';
  let css = '';
  for (const f of outputFiles) {
    if (f.path.endsWith('.js')) js = f.text;
    else if (f.path.endsWith('.css')) css = f.text;
  }
  // Escape any literal </script> / </style> inside the bundle so the inline
  // tags don't terminate early. Validate the EMITTED artifact, not the source
  // (rhiz-Audit pattern #41 / Charlotte template-constraint lesson).
  const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
  const safeCss = css.replace(/<\/style>/gi, '<\\/style>');

  let html = readFileSync(SHELL, 'utf8');
  if (safeCss) html = html.replace('</head>', `  <style>${safeCss}</style>\n</head>`);
  html = html.replace('</body>', `  <script>${safeJs}</script>\n</body>`);
  html = BANNER + html;

  writeFileSync(OUT, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`docket.html written — ${kb} KB (self-contained, file://-ready)`);
}

if (watch) {
  const ctx = await context({ ...options, plugins: [{
    name: 'inline-html',
    setup(b) { b.onEnd((r) => { if (r.outputFiles) emit(r.outputFiles); }); },
  }] });
  await ctx.watch();
  console.log('watching src/ — rebuilding docket.html on change …');
} else {
  const result = await build(options);
  emit(result.outputFiles);
}
