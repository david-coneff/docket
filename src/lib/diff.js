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
 *
 * Pass { coalesce: false } to get one op per token (needed for attribution
 * walks, where each non-deletion op must map to exactly one `b` token).
 */
export function lcsDiff(a, b, { coalesce: doCoalesce = true } = {}) {
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
  return doCoalesce ? coalesce(ops) : ops;
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

/** Merge adjacent ops sharing the same type AND layer. */
function coalesceLayered(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type && last.layer === op.layer) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

/**
 * Two-layer attributed diff: agent (before→after) and reviewer (after→edit),
 * reconciled over `after` as the shared spine. Returns a flat op list of
 * { type:'equal'|'del'|'ins', layer:'agent'|'reviewer'|null, text }.
 *
 * Net effect rules:
 *  - tokens the reviewer removed render as reviewer `del` (even if the agent
 *    had inserted them — the net result is that they are gone);
 *  - tokens the reviewer added render as reviewer `ins`;
 *  - surviving agent insertions render as agent `ins`;
 *  - tokens the agent removed render as agent `del`.
 *
 * `granularity` is 'word' or 'line' (mixed/auto maps to word here, since the
 * three-way spine alignment needs a single uniform tokenization).
 */
export function diffLayered(before, after, edit, granularity = 'word') {
  const tok = granularity === 'line' ? tokenizeLines : tokenizeWords;
  const B = tok(before), M = tok(after), E = tok(edit);

  const agentOps = lcsDiff(B, M, { coalesce: false });
  const reviewerOps = lcsDiff(M, E, { coalesce: false });

  // Attribution arrays over the `after` spine (length M.length).
  const mAgent = new Array(M.length).fill('equal');     // 'equal' | 'ins'
  const mReviewer = new Array(M.length).fill('equal');  // 'equal' | 'del'
  const agentDelBefore = Array.from({ length: M.length + 1 }, () => []);
  const reviewerInsBefore = Array.from({ length: M.length + 1 }, () => []);

  let k = 0;
  for (const op of agentOps) {
    if (op.type === 'del') agentDelBefore[k].push(op.text);
    else { if (op.type === 'ins') mAgent[k] = 'ins'; k++; }
  }
  k = 0;
  for (const op of reviewerOps) {
    if (op.type === 'ins') reviewerInsBefore[k].push(op.text);
    else { if (op.type === 'del') mReviewer[k] = 'del'; k++; }
  }

  const ops = [];
  const flush = (texts, type, layer) => {
    for (const text of texts) ops.push({ type, layer, text });
  };
  for (let idx = 0; idx <= M.length; idx++) {
    flush(agentDelBefore[idx], 'del', 'agent');
    flush(reviewerInsBefore[idx], 'ins', 'reviewer');
    if (idx === M.length) break;
    if (mReviewer[idx] === 'del') ops.push({ type: 'del', layer: 'reviewer', text: M[idx] });
    else if (mAgent[idx] === 'ins') ops.push({ type: 'ins', layer: 'agent', text: M[idx] });
    else ops.push({ type: 'equal', layer: null, text: M[idx] });
  }
  return coalesceLayered(ops);
}

/** True when the layered op list contains any reviewer-attributed change. */
export function hasReviewerChanges(ops) {
  return ops.some((o) => o.layer === 'reviewer');
}
