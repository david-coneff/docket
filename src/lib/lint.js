// lint.js — in-memory linkage check for a proposal's resolved state.
//
// This is the browser-side counterpart to tools/rhiz-lint.py. It cannot walk
// the whole repository (the UI only holds the proposal's own file_changes), so
// it checks what it can see: that a NEW article is linked from another file in
// the same proposal, and that the chosen-for-commit content is internally
// coherent. rhiz-lint.py remains the authoritative full-repo gate.
//
// rhiz-review §Phase 6: lint the *proposed state* (reviewer_edit when present,
// else after) before final approval of each file change; show results inline.

import { COMMITTABLE } from './resolve.js';

const LINE_WARN = 200;
const MD_LINK = /\[[^\]]*\]\(([^)]*)\)/g;   // `*`: an empty `()` must match, or its error can never fire

/** The content that would actually be committed for a file change. */
export function committedContent(fc) {
  if (fc.reviewer_edit && fc.reviewer_edit_mode === 'commit-as-is') {
    return fc.reviewer_edit;
  }
  return fc.after;
}

function basename(p) {
  return p.split('/').pop();
}

/** Does some OTHER file change in the proposal link to `fc.path`? A link counts when its
 *  target (anchor and query stripped) ends with the article's file name. */
function linkedFromSibling(fc, siblings) {
  const name = basename(fc.path || '');
  if (!name) return false;
  return siblings.some((o) => {
    if (o === fc || o.id === fc.id) return false;
    const text = committedContent(o) || '';
    for (const m of text.matchAll(MD_LINK)) {
      const target = m[1].trim().split(/[#?]/)[0];
      if (target && basename(target) === name) return true;
    }
    return false;
  });
}

/**
 * Lint a single file change's would-be-committed content. `siblings` is the
 * proposal's file_changes (omit it when they are not at hand: the orphan check
 * is then skipped, never guessed).
 * Returns { errors:[], warnings:[] }.
 */
export function lintFileChange(fc, siblings = null) {
  const errors = [];
  const warnings = [];
  const content = committedContent(fc) || '';
  const lineCount = content.split('\n').length;

  if (lineCount > LINE_WARN) {
    warnings.push(
      `Article is ${lineCount} lines (> ${LINE_WARN}); consider splitting per rhiz-State §6.8.4 (tag: needs-split).`
    );
  }

  // A NEW article (no `before`) is reachable only if an index links to it. An
  // index edit travels as its own file change, so the proposal can show it; an
  // article that already exists was linked before, which only rhiz-lint.py can see.
  if (siblings && !fc.before && /\.md$/.test(fc.path || '') && !linkedFromSibling(fc, siblings)) {
    warnings.push(
      `New article ${basename(fc.path)} is not linked from any other file in this proposal — it may be orphaned (no index links to it).`
    );
  }

  // Detect obviously broken self-references: a relative link whose target is
  // the article's own directory sibling that is clearly malformed (empty,
  // whitespace, or containing a space).
  let m;
  while ((m = MD_LINK.exec(content)) !== null) {
    const target = m[1].trim();
    if (!target) errors.push('Empty Markdown link target found.');
    else if (/\s/.test(target) && !target.startsWith('http')) {
      warnings.push(`Link target contains whitespace: "${target}"`);
    }
  }

  // Heading sanity: a knowledge article should start with a top-level heading.
  if (content.trim() && !/^#\s/m.test(content.split('\n')[0])) {
    warnings.push('Content does not begin with a top-level "# " heading.');
  }

  return { errors, warnings };
}

/** Lint every committable file change in a proposal. */
export function lintProposal(proposal) {
  const changes = proposal.file_changes || [];
  const results = [];
  for (const fc of changes) {
    if (!COMMITTABLE.has(fc.status)) continue;
    const { errors, warnings } = lintFileChange(fc, changes);
    if (errors.length || warnings.length) {
      results.push({ fileId: fc.id, path: fc.path, errors, warnings });
    }
  }
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  return { results, errorCount, clean: errorCount === 0 };
}
