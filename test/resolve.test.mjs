import assert from 'node:assert';
import { applyResolution, STATES, sortProposals, COMMITTABLE, isProposalReady, bulkApply, pendingCount } from '../src/lib/resolve.js';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; } };

const mkFC = () => ({ id: 'file-01', path: 'docs/article.md', after: 'X', tags: [], comments: [],
  reviewer_edit: null, reviewer_edit_mode: null, reviewer_edit_notes: null });

const mkProposal = (statuses) => ({
  id: 'prop-test',
  file_changes: statuses.map((s, i) => ({
    id: `file-0${i + 1}`, path: `file${i + 1}.md`, status: s, after: 'X',
    tags: [], comments: [], reviewer_edit: null, reviewer_edit_mode: null, reviewer_edit_notes: null,
  })),
});

t('approve adds approval note, no tags', () => {
  const fc = mkFC();
  applyResolution(fc, STATES.APPROVED, { notes: 'lgtm' });
  assert.equal(fc.status, 'approved');
  assert.equal(fc.comments[0].role, 'approval-note');
  assert.deepEqual(fc.tags, []);
});

t('working draft auto-tags working-draft', () => {
  const fc = mkFC();
  applyResolution(fc, STATES.APPROVED_WORKING_DRAFT, {});
  assert.ok(fc.tags.includes('working-draft'));
});

t('edited commit-as-is sets reviewer_edit + mode + tag', () => {
  const fc = mkFC();
  applyResolution(fc, STATES.EDITED_COMMIT, { reviewerEdit: 'Y', editNotes: 'fixed wording' });
  assert.equal(fc.reviewer_edit, 'Y');
  assert.equal(fc.reviewer_edit_mode, 'commit-as-is');
  assert.equal(fc.reviewer_edit_notes, 'fixed wording');
  assert.ok(fc.tags.includes('reviewer-edited'));
  assert.ok(COMMITTABLE.has(fc.status));
});

t('edited for-agent tags reviewer-edited + needs-agent-analysis, not committable', () => {
  const fc = mkFC();
  applyResolution(fc, STATES.EDITED_FOR_AGENT, { reviewerEdit: 'Z' });
  assert.equal(fc.reviewer_edit_mode, 'agent-feedback');
  assert.ok(fc.tags.includes('reviewer-edited'));
  assert.ok(fc.tags.includes('needs-agent-analysis'));
  assert.ok(!COMMITTABLE.has(fc.status));
});

t('reject records rejection-rationale comment', () => {
  const fc = mkFC();
  applyResolution(fc, STATES.REJECTED, { comment: 'out of scope' });
  assert.equal(fc.comments[0].role, 'rejection-rationale');
});

t('sort by date descending', () => {
  const ps = [
    { data: { id: 'a', created: '2026-01-01', tags: [] } },
    { data: { id: 'b', created: '2026-03-01', tags: [] } },
  ];
  const out = sortProposals(ps, { sortMode: 'date', manualOrder: ['a', 'b'] });
  assert.equal(out[0].data.id, 'b');
});

t('sort by importance puts high before low, untagged last', () => {
  const ps = [
    { data: { id: 'a', tags: ['low'] } },
    { data: { id: 'b', tags: ['critical'] } },
    { data: { id: 'c', tags: [] } },
  ];
  const out = sortProposals(ps, { sortMode: 'importance', manualOrder: [] });
  assert.deepEqual(out.map((p) => p.data.id), ['b', 'a', 'c']);
});

t('isProposalReady returns false when any file is pending', () => {
  assert.equal(isProposalReady(mkProposal(['approved', 'pending'])), false);
});

t('isProposalReady returns true when all files resolved', () => {
  assert.equal(isProposalReady(mkProposal(['approved', 'rejected'])), true);
});

t('isProposalReady returns false for empty file_changes', () => {
  assert.equal(isProposalReady({ file_changes: [] }), false);
});

t('bulkApply only touches pending files, leaves resolved intact', () => {
  const p = mkProposal(['approved', 'pending', 'pending']);
  bulkApply(p, STATES.REJECTED, { comment: 'batch rejected' });
  assert.equal(p.file_changes[0].status, 'approved');
  assert.equal(p.file_changes[1].status, 'rejected');
  assert.equal(p.file_changes[2].status, 'rejected');
});

t('pendingCount returns correct count', () => {
  assert.equal(pendingCount(mkProposal(['approved', 'pending', 'pending'])), 2);
  assert.equal(pendingCount(mkProposal(['approved', 'rejected'])), 0);
});

console.log(`\n${pass} assertions passed.`);
