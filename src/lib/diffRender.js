// diffRender.js — render a diff op list to track-changes HTML.
import { diffMixed, diffWords, diffLines, hasChanges } from './diff.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

export function renderDiff(before, after, granularity = 'auto') {
  let ops;
  if (granularity === 'word') ops = diffWords(before, after);
  else if (granularity === 'line') ops = diffLines(before, after);
  else ops = diffMixed(before, after);
  return { html: renderOps(ops), changed: hasChanges(ops) };
}
