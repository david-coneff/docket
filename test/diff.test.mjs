// Node-native test for the diff engine. Run: node test/diff.test.mjs
import assert from 'node:assert';
import {
  tokenizeWords, tokenizeLines, diffWords, diffLines, segment, diffMixed, hasChanges,
  diffLayered, hasReviewerChanges,
} from '../src/lib/diff.js';

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

t('tokenizeWords is loss-less', () => {
  const s = 'the  quick\nbrown fox';
  assert.equal(tokenizeWords(s).join(''), s);
});

t('tokenizeLines is loss-less', () => {
  const s = 'line one\nline two\nthree';
  assert.equal(tokenizeLines(s).join(''), s);
});

t('diffWords reconstructs before from equal+del', () => {
  const before = 'line one two';
  const after = 'line ONE two three';
  const ops = diffWords(before, after);
  const reBefore = ops.filter(o => o.type !== 'ins').map(o => o.text).join('');
  const reAfter = ops.filter(o => o.type !== 'del').map(o => o.text).join('');
  assert.equal(reBefore, before);
  assert.equal(reAfter, after);
});

t('diffWords detects a single word change', () => {
  const ops = diffWords('alpha beta gamma', 'alpha BETA gamma');
  assert.ok(ops.some(o => o.type === 'del' && o.text.includes('beta')));
  assert.ok(ops.some(o => o.type === 'ins' && o.text.includes('BETA')));
});

t('diffLines reconstructs both sides', () => {
  const before = 'a\nb\nc\n';
  const after = 'a\nB\nc\nd\n';
  const ops = diffLines(before, after);
  assert.equal(ops.filter(o => o.type !== 'ins').map(o => o.text).join(''), before);
  assert.equal(ops.filter(o => o.type !== 'del').map(o => o.text).join(''), after);
});

t('identical input yields no changes', () => {
  const s = 'no change here\nat all';
  assert.equal(hasChanges(diffMixed(s, s)), false);
});

t('segment splits prose and fenced code', () => {
  const text = 'intro line\n```js\ncode();\n```\noutro';
  const segs = segment(text);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].kind, 'prose');
  assert.equal(segs[1].kind, 'code');
  assert.equal(segs[2].kind, 'prose');
});

t('diffMixed reconstructs both sides (prose + code)', () => {
  const before = 'intro words here\n```js\nlet x = 1;\n```\ntail';
  const after = 'intro WORDS here\n```js\nlet x = 2;\n```\ntail';
  const ops = diffMixed(before, after);
  assert.equal(ops.filter(o => o.type !== 'ins').map(o => o.text).join(''), before);
  assert.equal(ops.filter(o => o.type !== 'del').map(o => o.text).join(''), after);
  assert.ok(hasChanges(ops));
});

t('diffMixed falls back to line diff on structural change', () => {
  const before = 'just prose, no fence';
  const after = 'now with\n```\na fence\n```\nadded';
  const ops = diffMixed(before, after);
  assert.equal(ops.filter(o => o.type !== 'ins').map(o => o.text).join(''), before);
  assert.equal(ops.filter(o => o.type !== 'del').map(o => o.text).join(''), after);
});

t('diffLayered attributes agent and reviewer changes distinctly', () => {
  // agent: insert "big"; reviewer: change "cat" -> "dog"
  const ops = diffLayered('the cat sat', 'the big cat sat', 'the big dog sat', 'word');
  assert.ok(ops.some(o => o.type === 'ins' && o.layer === 'agent' && o.text.includes('big')));
  assert.ok(ops.some(o => o.type === 'del' && o.layer === 'reviewer' && o.text.includes('cat')));
  assert.ok(ops.some(o => o.type === 'ins' && o.layer === 'reviewer' && o.text.includes('dog')));
  assert.ok(hasReviewerChanges(ops));
});

t('diffLayered reconstructs the effective (edit) text from equal+ins', () => {
  const before = 'one two three', after = 'one two THREE four', edit = 'one TWO THREE four';
  const ops = diffLayered(before, after, edit, 'word');
  assert.equal(ops.filter(o => o.type !== 'del').map(o => o.text).join(''), edit);
});

t('diffLayered with no reviewer edit reports no reviewer changes', () => {
  const ops = diffLayered('a cat', 'a big cat', 'a big cat', 'word');
  assert.equal(hasReviewerChanges(ops), false);
  assert.ok(ops.some(o => o.type === 'ins' && o.layer === 'agent'));
});

console.log(`\n${pass} assertions passed.`);
