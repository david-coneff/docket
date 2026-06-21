// diff.js — mixed-granularity diff engine for rhiz-review.
//
// Prose is diffed at word granularity; fenced code / YAML / JSON blocks are
// diffed at line granularity (rhiz-review §UI Review mode). The same engine
// powers Review mode (before→after) and "Diff my edits" (after→reviewer_edit).
//
// No external dependencies: a classic LCS (longest common subsequence) over a
// token array, emitted as a flat op list of {type:'equal'|'del'|'ins', text}.

/** Tokenize prose into words and the whitespace between them (both kept). */
export function tokenizeWords(text) {
  // Split on whitespace boundaries but keep the whitespace as its own tokens
  // so reconstruction is loss-less.
  return text.match(/\s+|[^\s]+/g) || [];
}

/** Tokenize into lines, keeping the trailing newline on each line. */
export function tokenizeLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

/**
 * LCS diff over two token arrays. Returns ops in order.
 * Uses the standard dynamic-programming LCS table. Token arrays here are
 * bounded (single knowledge articles), so O(n*m) is acceptable.
 */
export function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  // DP table of LCS lengths.
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] }); i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] }); i++;
    } else {
      ops.push({ type: 'ins', text: b[j] }); j++;
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] });
  while (j < m) ops.push({ type: 'ins', text: b[j++] });
  return coalesce(ops);
}

/** Merge runs of same-type ops into single ops for compact rendering. */
function coalesce(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

export function diffWords(before, after) {
  return lcsDiff(tokenizeWords(before), tokenizeWords(after));
}

export function diffLines(before, after) {
  return lcsDiff(tokenizeLines(before), tokenizeLines(after));
}

/**
 * Segment text into alternating prose / fenced-code regions. A fence is a line
 * whose trimmed form starts with ``` (any info string). Returns an ordered
 * array of {kind:'prose'|'code', text}.
 */
export function segment(text) {
  const lines = text.split('\n');
  const segs = [];
  let buf = [];
  let kind = 'prose';
  const flush = () => {
    if (buf.length) { segs.push({ kind, text: buf.join('\n') }); buf = []; }
  };
  for (const line of lines) {
    const isFence = line.trim().startsWith('```');
    if (isFence) {
      buf.push(line);
      if (kind === 'prose') { // opening fence: flush prose, switch to code
        const opening = buf.pop();
        flush();
        kind = 'code';
        buf.push(opening);
      } else { // closing fence: include it, flush code, back to prose
        flush();
        kind = 'prose';
      }
    } else {
      buf.push(line);
    }
  }
  flush();
  return segs;
}

/**
 * Mixed-granularity diff. If both sides share the same segment structure
 * (same count and kinds), each segment is diffed at its natural granularity:
 * prose word-level, code line-level. Otherwise the whole text is line-diffed
 * (structural change — line granularity is the safe, readable fallback).
 *
 * Returns a flat op list, suitable for renderDiff().
 */
export function diffMixed(before, after) {
  const sa = segment(before);
  const sb = segment(after);
  const sameShape = sa.length === sb.length &&
    sa.every((s, k) => s.kind === sb[k].kind);
  if (!sameShape) return diffLines(before, after);

  const ops = [];
  for (let k = 0; k < sa.length; k++) {
    const part = sa[k].kind === 'code'
      ? diffLines(sa[k].text, sb[k].text)
      : diffWords(sa[k].text, sb[k].text);
    ops.push(...part);
    // Re-insert the newline that split() removed between segments.
    if (k < sa.length - 1) ops.push({ type: 'equal', text: '\n' });
  }
  return coalesce(ops);
}

/** True when the diff contains any insertion or deletion. */
export function hasChanges(ops) {
  return ops.some((o) => o.type !== 'equal');
}
