// review.js — center panel: file list + Composed / Review mode / Edit ✎ tabs.
import { el } from '../lib/dom.js';
import { renderDiff } from '../lib/diffRender.js';
import { renderMarkdown } from '../lib/markdown.js';
import { saveDraft, loadDraft } from '../lib/store.js';
import { STATE_ICON, STATE_LABEL, bulkApply, STATES } from '../lib/resolve.js';

export const reviewUI = { tab: 'composed', granularity: 'auto', diffMyEdits: false, editValue: null, bulkMenuOpen: false };

export function renderReview(store, onChange, onBulkResolve) {
  const panel = el('div.panel.review');
  const proposal = store.activeProposal();
  const fc = store.activeFile();

  if (!proposal || !fc) {
    panel.append(el('div.empty', { text: 'Select a proposal from the queue.' }));
    return panel;
  }

  const changes = proposal.file_changes || [];

  // Bulk apply dropdown
  const bulkMenu = el('div.bulk-menu', { style: reviewUI.bulkMenuOpen ? '' : 'display:none' });
  [
    ['Approve all', STATES.APPROVED],
    ['Approve working draft', STATES.APPROVED_WORKING_DRAFT],
    ['Request changes', STATES.CHANGES_REQUESTED],
    ['Reject all', STATES.REJECTED],
  ].forEach(([label, state]) => {
    bulkMenu.append(el('button', { text: label, onclick: () => {
      bulkApply(proposal, state);
      reviewUI.bulkMenuOpen = false;
      onBulkResolve(state);
    } }));
  });

  const bulkWrap = el('div.bulk-wrap', {}, [bulkMenu,
    el('button.btn.sm', { text: 'Apply all pending ▾', onclick: () => {
      reviewUI.bulkMenuOpen = !reviewUI.bulkMenuOpen;
      onChange();
    } }),
  ]);

  panel.append(el('div.file-list-header', {}, [
    el('span', { text: `${changes.length} file(s)` }),
    bulkWrap,
  ]));

  // File list
  const fileList = el('div.file-list');
  changes.forEach((f, i) => {
    const icon = STATE_ICON[f.status] || '○';
    const item = el('div.file-item', { title: STATE_LABEL[f.status] });
    if (i === store.activeFileIndex) item.classList.add('active');
    item.append(
      el('span.file-status-icon', { text: icon, dataset: { status: f.status } }),
      el('span.file-path', { text: f.path || `file-${i + 1}` }),
    );
    item.addEventListener('click', () => store.setFileIndex(i));
    fileList.append(item);
  });
  panel.append(fileList);

  // Per-file rationale
  if (fc.rationale) {
    panel.append(el('div.file-rationale', { text: fc.rationale }));
  }

  // Tabs
  const tabs = el('div.tabs');
  for (const [id, label] of [['composed', 'Composed'], ['review', 'Review mode'], ['edit', 'Edit ✎']]) {
    const b = el('button', { text: label, onclick: () => { reviewUI.tab = id; onChange(); } });
    if (reviewUI.tab === id) b.classList.add('active');
    tabs.append(b);
  }
  panel.append(tabs);

  if (reviewUI.tab === 'composed') {
    panel.append(el('div.content-view', { html: renderMarkdown(fc.after || '') }));
  } else if (reviewUI.tab === 'review') {
    const gran = el('select', { value: reviewUI.granularity,
      onchange: (e) => { reviewUI.granularity = e.target.value; onChange(); } },
      ['auto', 'word', 'line'].map((g) =>
        el('option', { value: g, selected: g === reviewUI.granularity, text: g })));
    panel.append(el('div.edit-toolbar', {}, [el('span', { text: 'Granularity:' }), gran]));
    const { html } = renderDiff(fc.before || '', fc.after || '', reviewUI.granularity);
    panel.append(el('div.diff-view', { html }));
  } else {
    renderEditTab(panel, store, fc, onChange);
  }

  return panel;
}

function renderEditTab(panel, store, fc, onChange) {
  const seed = reviewUI.editValue ?? fc.reviewer_edit ?? fc.after ?? '';

  const ta = el('textarea.edit-surface', { value: seed,
    oninput: (e) => {
      reviewUI.editValue = e.target.value;
      saveDraft(store.activeProposalId, fc.id, e.target.value);
      if (reviewUI.diffMyEdits) refreshDiff();
      store.emit();
    },
  });

  loadDraft(store.activeProposalId, fc.id).then((draft) => {
    if (draft != null && reviewUI.editValue == null) { ta.value = draft; reviewUI.editValue = draft; }
  });

  const toggle = el('label', {}, [
    el('input', { type: 'checkbox', checked: reviewUI.diffMyEdits,
      onchange: (e) => { reviewUI.diffMyEdits = e.target.checked; onChange(); } }),
    ' Diff my edits',
  ]);
  panel.append(el('div.edit-toolbar', {}, [toggle]));
  panel.append(ta);

  const diffBox = el('div.diff-view', { style: 'margin-top:10px' });
  const refreshDiff = () => {
    const { html, changed } = renderDiff(fc.after || '', ta.value, 'auto');
    diffBox.innerHTML = changed ? html : '<em>No changes relative to the agent\'s proposal.</em>';
  };
  if (reviewUI.diffMyEdits) { refreshDiff(); panel.append(diffBox); }
}

export function currentEditValue(fc) {
  return reviewUI.editValue ?? fc.reviewer_edit ?? null;
}

export function editDiffersFromAfter(fc) {
  const v = reviewUI.editValue;
  if (v == null) return !!fc.reviewer_edit && fc.reviewer_edit !== fc.after;
  return v !== (fc.after ?? '');
}

export function resetEditState() { reviewUI.editValue = null; reviewUI.diffMyEdits = false; reviewUI.bulkMenuOpen = false; }
