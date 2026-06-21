// lint.js — in-memory linkage check for a proposal's resolved state.
//
// This is the browser-side counterpart to rhiz-lint.py (in david-coneff/rhizome).
// It cannot walk the whole repository (the UI only holds the proposal's own
// hunks), so it checks what it can see: that each hunk's resolved content still
// references its declared index context, and that the chosen-for-commit content
// is internally coherent. rhiz-lint.py remains the authoritative full-repo gate.
//
// docket §Phase 6: lint the *proposed state* (reviewer_edit when present,
// else after) before final hunk approval; show results inline.

const LINE_WARN = 200;
const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** The content that would actually be committed for a hunk. */
export function committedContent(hunk) {
  if (hunk.reviewer_edit && hunk.reviewer_edit_mode === 'commit-as-is') {
    return hunk.reviewer_edit;
  }
  return hunk.after;
}

function basename(p) {
  return p.split('/').pop();
}

export function lintHunk(hunk) {
  const errors = [];
  const warnings = [];
  const content = committedContent(hunk) || '';
  const lineCount = content.split('\n').length;

  if (lineCount > LINE_WARN) {
    warnings.push(
      `Article is ${lineCount} lines (> ${LINE_WARN}); consider splitting per rhiz-State §6.8.4 (tag: needs-split).`
    );
  }

  if (hunk.article && !hunk.index_context) {
    warnings.push(
      `Hunk has no index_context — the article may be orphaned (no index links to it).`
    );
  }

  let m;
  while ((m = MD_LINK.exec(content)) !== null) {
    const target = m[1].trim();
    if (!target) errors.push('Empty Markdown link target found.');
    else if (/\s/.test(target) && !target.startsWith('http')) {
      warnings.push(`Link target contains whitespace: "${target}"`);
    }
  }

  if (content.trim() && !/^#\s/m.test(content.split('\n')[0])) {
    warnings.push('Content does not begin with a top-level "# " heading.');
  }

  return { errors, warnings };
}

/** Lint every committable hunk in a proposal. */
export function lintProposal(proposal) {
  const COMMITTABLE = new Set(['approved', 'approved-working-draft', 'edited-commit-as-is']);
  const results = [];
  for (const hunk of proposal.hunks || []) {
    if (!COMMITTABLE.has(hunk.status)) continue;
    const { errors, warnings } = lintHunk(hunk);
    if (errors.length || warnings.length) {
      results.push({ hunkId: hunk.id, article: basename(hunk.article || ''), errors, warnings });
    }
  }
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  return { results, errorCount, clean: errorCount === 0 };
}
