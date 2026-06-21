// diffRender.js — render a diff op list to track-changes HTML.
import { diffMixed, diffWords, diffLines, hasChanges } from './diff.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render ops to an HTML string with <ins>/<del> markup. Whitespace is
 * preserved by the CSS (white-space: pre-wrap) on the container.
 */
export function renderOps(ops) {
  let out = '';
  for (const op of ops) {
    const text = escapeHtml(op.text);
    if (op.type === 'equal') out += `<span>${text}</span>`;
    else if (op.type === 'del') out += `<del>${text}</del>`;
    else out += `<ins>${text}</ins>`;
  }
  return out;
}

/**
 * Render a before→after track-changes view. `granularity` may be 'auto'
 * (mixed: word for prose, line for code), 'word', or 'line'.
 */
export function renderDiff(before, after, granularity = 'auto') {
  let ops;
  if (granularity === 'word') ops = diffWords(before, after);
  else if (granularity === 'line') ops = diffLines(before, after);
  else ops = diffMixed(before, after);
  return { html: renderOps(ops), changed: hasChanges(ops) };
}
