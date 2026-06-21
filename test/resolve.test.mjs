import assert from 'node:assert';
import { applyResolution, STATES, sortProposals, COMMITTABLE } from '../src/lib/resolve.js';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; } };

const mkHunk = () => ({ id: 'hunk-01', after: 'X', tags: [], comments: [],
  reviewer_edit: null, reviewer_edit_mode: null, reviewer_edit_notes: null });

t('approve adds approval note, no tags', () => {
  const h = mkHunk();
  applyResolution(h, STATES.APPROVED, { notes: 'lgtm' });
  assert.equal(h.status, 'approved');
  assert.equal(h.comments[0].role, 'approval-note');
  assert.deepEqual(h.tags, []);
});

t('working draft auto-tags working-draft', () => {
  const h = mkHunk();
  applyResolution(h, STATES.APPROVED_WORKING_DRAFT, {});
  assert.ok(h.tags.includes('working-draft'));
});

t('edited commit-as-is sets reviewer_edit + mode + tag', () => {
  const h = mkHunk();
  applyResolution(h, STATES.EDITED_COMMIT, { reviewerEdit: 'Y', editNotes: 'fixed wording' });
  assert.equal(h.reviewer_edit, 'Y');
  assert.equal(h.reviewer_edit_mode, 'commit-as-is');
  assert.equal(h.reviewer_edit_notes, 'fixed wording');
  assert.ok(h.tags.includes('reviewer-edited'));
  assert.ok(COMMITTABLE.has(h.status));
});

t('edited for-agent tags reviewer-edited + needs-agent-analysis, not committable', () => {
  const h = mkHunk();
  applyResolution(h, STATES.EDITED_FOR_AGENT, { reviewerEdit: 'Z' });
  assert.equal(h.reviewer_edit_mode, 'agent-feedback');
  assert.ok(h.tags.includes('reviewer-edited'));
  assert.ok(h.tags.includes('needs-agent-analysis'));
  assert.ok(!COMMITTABLE.has(h.status));
});

t('reject requires-comment role recorded', () => {
  const h = mkHunk();
  applyResolution(h, STATES.REJECTED, { comment: 'out of scope' });
  assert.equal(h.comments[0].role, 'rejection-rationale');
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
  assert.deepEqual(out.map(p => p.data.id), ['b', 'a', 'c']);
});

console.log(`\n${pass} assertions passed.`);
