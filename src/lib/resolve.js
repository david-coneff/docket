// resolve.js — the six-state file-change resolution machine and queue sorting.
export const STATES = {
  APPROVED: 'approved',
  APPROVED_WORKING_DRAFT: 'approved-working-draft',
  EDITED_COMMIT: 'edited-commit-as-is',
  EDITED_FOR_AGENT: 'edited-for-agent',
  CHANGES_REQUESTED: 'changes-requested',
  REJECTED: 'rejected',
};

export const STATE_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  'approved-working-draft': 'Approved — working draft',
  'edited-commit-as-is': 'Edited — commit as-is',
  'edited-for-agent': 'Edited — for agent',
  'changes-requested': 'Request changes',
  rejected: 'Rejected',
};

// Unicode symbols for compact file-list status column.
export const STATE_ICON = {
  pending: '○',
  approved: '✓',
  'approved-working-draft': '✓',
  'edited-commit-as-is': '✓',
  'edited-for-agent': '↩',
  'changes-requested': '⚠',
  rejected: '✗',
};

export const COMMITTABLE = new Set([
  STATES.APPROVED, STATES.APPROVED_WORKING_DRAFT, STATES.EDITED_COMMIT,
]);

function addTag(fc, tag) {
  if (!Array.isArray(fc.tags)) fc.tags = [];
  if (!fc.tags.includes(tag)) fc.tags.push(tag);
}

function pushComment(fc, role, text) {
  if (!text) return;
  if (!Array.isArray(fc.comments)) fc.comments = [];
  fc.comments.push({
    id: `comment-${(fc.comments.length + 1).toString().padStart(2, '0')}`,
    created: new Date().toISOString(),
    role, text, attachments: [],
  });
}

export function applyResolution(fc, state, opts = {}) {
  fc.status = state;

  switch (state) {
    case STATES.APPROVED:
      pushComment(fc, 'approval-note', opts.notes);
      break;

    case STATES.APPROVED_WORKING_DRAFT:
      addTag(fc, 'working-draft');
      pushComment(fc, 'approval-note', opts.notes);
      break;

    case STATES.EDITED_COMMIT:
      fc.reviewer_edit = opts.reviewerEdit ?? fc.reviewer_edit;
      fc.reviewer_edit_mode = 'commit-as-is';
      fc.reviewer_edit_notes = opts.editNotes || fc.reviewer_edit_notes || null;
      addTag(fc, 'reviewer-edited');
      pushComment(fc, 'edit-note', opts.comment);
      break;

    case STATES.EDITED_FOR_AGENT:
      fc.reviewer_edit = opts.reviewerEdit ?? fc.reviewer_edit;
      fc.reviewer_edit_mode = 'agent-feedback';
      fc.reviewer_edit_notes = opts.editNotes || fc.reviewer_edit_notes || null;
      addTag(fc, 'reviewer-edited');
      addTag(fc, 'needs-agent-analysis');
      pushComment(fc, 'edit-note', opts.comment);
      break;

    case STATES.CHANGES_REQUESTED:
      pushComment(fc, 'change-request', opts.comment);
      break;

    case STATES.REJECTED:
      pushComment(fc, 'rejection-rationale', opts.comment);
      break;
  }
  return fc;
}

// Returns true when every file_change in the proposal has a non-pending status.
export function isProposalReady(proposal) {
  const changes = proposal.file_changes || [];
  return changes.length > 0 && changes.every((fc) => fc.status !== 'pending');
}

// Applies a resolution to every pending file_change in the proposal.
// This is the bulk-action convenience alias: proposal-level gesture → per-file write.
export function bulkApply(proposal, state, opts = {}) {
  (proposal.file_changes || [])
    .filter((fc) => fc.status === 'pending')
    .forEach((fc) => applyResolution(fc, state, opts));
  return proposal;
}

export function pendingCount(proposal) {
  return (proposal.file_changes || []).filter((fc) => fc.status === 'pending').length;
}

function importanceRank(proposal) {
  const tags = proposal.tags || [];
  const num = tags.map((t) => /^importance:(\d+)$/.exec(t)).find(Boolean);
  if (num) return Number(num[1]);
  const words = { critical: 4, high: 3, medium: 2, low: 1 };
  for (const t of tags) if (t in words) return words[t];
  return -1;
}

export function sortProposals(proposals, { sortMode, sortTag, manualOrder }) {
  const list = [...proposals];
  switch (sortMode) {
    case 'date':
      return list.sort((a, b) =>
        String(b.data?.created || '').localeCompare(String(a.data?.created || '')));
    case 'tag':
      return list.sort((a, b) => {
        const av = (a.data?.tags || []).includes(sortTag) ? 0 : 1;
        const bv = (b.data?.tags || []).includes(sortTag) ? 0 : 1;
        return av - bv;
      });
    case 'importance':
      return list.sort((a, b) => importanceRank(b.data) - importanceRank(a.data));
    case 'manual':
    default:
      return list.sort((a, b) =>
        manualOrder.indexOf(a.data?.id) - manualOrder.indexOf(b.data?.id));
  }
}
