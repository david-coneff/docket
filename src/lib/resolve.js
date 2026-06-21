// resolve.js — the six-state hunk resolution machine and queue sorting.
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

export const COMMITTABLE = new Set([
  STATES.APPROVED, STATES.APPROVED_WORKING_DRAFT, STATES.EDITED_COMMIT,
]);

function addTag(hunk, tag) {
  if (!Array.isArray(hunk.tags)) hunk.tags = [];
  if (!hunk.tags.includes(tag)) hunk.tags.push(tag);
}

function pushComment(hunk, role, text) {
  if (!text) return;
  if (!Array.isArray(hunk.comments)) hunk.comments = [];
  hunk.comments.push({
    id: `comment-${(hunk.comments.length + 1).toString().padStart(2, '0')}`,
    created: new Date().toISOString(),
    role, text, attachments: [],
  });
}

export function applyResolution(hunk, state, opts = {}) {
  hunk.status = state;

  switch (state) {
    case STATES.APPROVED:
      pushComment(hunk, 'approval-note', opts.notes);
      break;

    case STATES.APPROVED_WORKING_DRAFT:
      addTag(hunk, 'working-draft');
      pushComment(hunk, 'approval-note', opts.notes);
      break;

    case STATES.EDITED_COMMIT:
      hunk.reviewer_edit = opts.reviewerEdit ?? hunk.reviewer_edit;
      hunk.reviewer_edit_mode = 'commit-as-is';
      hunk.reviewer_edit_notes = opts.editNotes || hunk.reviewer_edit_notes || null;
      addTag(hunk, 'reviewer-edited');
      pushComment(hunk, 'edit-note', opts.comment);
      break;

    case STATES.EDITED_FOR_AGENT:
      hunk.reviewer_edit = opts.reviewerEdit ?? hunk.reviewer_edit;
      hunk.reviewer_edit_mode = 'agent-feedback';
      hunk.reviewer_edit_notes = opts.editNotes || hunk.reviewer_edit_notes || null;
      addTag(hunk, 'reviewer-edited');
      addTag(hunk, 'needs-agent-analysis');
      pushComment(hunk, 'edit-note', opts.comment);
      break;

    case STATES.CHANGES_REQUESTED:
      pushComment(hunk, 'change-request', opts.comment);
      break;

    case STATES.REJECTED:
      pushComment(hunk, 'rejection-rationale', opts.comment);
      break;
  }
  return hunk;
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
