import assert from 'node:assert';
import { lintFileChange, lintProposal, committedContent } from '../src/lib/lint.js';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; } };

// file_changes entries as docket-propose.py writes them: `path`, `before`, `after`.
const fc = (id, path, before, after, status = 'approved') => ({
  id, path, before, after, status, tags: [], comments: [],
  reviewer_edit: null, reviewer_edit_mode: null, reviewer_edit_notes: null,
});
const ORPHAN = /not linked from any other file/;
const warns = (r) => r.warnings.join('\n');

t('a new article no sibling links to is warned as orphaned', () => {
  const art = fc('file-01', 'docs/new.md', '', '# New\n');
  const r = lintFileChange(art, [art, fc('file-02', 'docs/other.md', '# O\n', '# O\n')]);
  assert.match(warns(r), ORPHAN);
});

t('a new article linked from an index in the same proposal is not', () => {
  const art = fc('file-01', 'docs/new.md', '', '# New\n');
  const idx = fc('file-02', 'docs/index.md', '# Index\n', '# Index\n- [New](new.md#top)\n');
  assert.doesNotMatch(warns(lintFileChange(art, [art, idx])), ORPHAN);
});

t('the link is read from the content that would be committed (reviewer edit)', () => {
  const art = fc('file-01', 'docs/new.md', null, '# New\n');
  const idx = fc('file-02', 'docs/index.md', '# Index\n', '# Index\n');
  idx.reviewer_edit = '# Index\n- [New](./new.md)\n';
  idx.reviewer_edit_mode = 'commit-as-is';
  assert.equal(committedContent(idx), idx.reviewer_edit);
  assert.doesNotMatch(warns(lintFileChange(art, [art, idx])), ORPHAN);
});

t('an existing article, or a call without siblings, is not judged orphaned', () => {
  const old = fc('file-01', 'docs/old.md', '# Old\n', '# Old v2\n');
  assert.doesNotMatch(warns(lintFileChange(old, [old])), ORPHAN);
  const art = fc('file-01', 'docs/new.md', '', '# New\n');
  assert.doesNotMatch(warns(lintFileChange(art)), ORPHAN);
});

t('an article does not count as linking itself', () => {
  const art = fc('file-01', 'docs/new.md', '', '# New\nsee [me](new.md)\n');
  assert.match(warns(lintFileChange(art, [art])), ORPHAN);
});

t('lintProposal walks file_changes and skips what is not committable', () => {
  const art = fc('file-01', 'docs/new.md', '', '# New\n');
  const pending = fc('file-02', 'docs/p.md', '', 'no heading', 'pending');
  const r = lintProposal({ id: 'p', file_changes: [art, pending] });
  assert.deepEqual(r.results.map((x) => [x.fileId, x.path]), [['file-01', 'docs/new.md']]);
  assert.match(r.results[0].warnings.join('\n'), ORPHAN);
  assert.equal(r.clean, true);
});

t('an empty link target is an error', () => {
  const r = lintProposal({ file_changes: [fc('file-01', 'a.md', '# A\n', '# A\n[x]()\n')] });
  assert.equal(r.errorCount, 1);
  assert.equal(r.clean, false);
});

console.log(`lint: ${pass} passed`);
