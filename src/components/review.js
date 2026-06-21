// review.js — center panel: Composed / Review mode / Edit ✎ tabs + hunk nav.
import { el } from '../lib/dom.js';
import { renderDiff } from '../lib/diffRender.js';
import { renderMarkdown } from '../lib/markdown.js';
import { saveDraft, loadDraft } from '../lib/store.js';

// Module-local view state (not part of the proposal artifact).
export const reviewUI = { tab: 'composed', granularity: 'auto', diffMyEdits: false, editValue: null };

export function renderReview(store, onChange) {
  const panel = el('div.panel.review');
  const proposal = store.activeProposal();
  const hunk = store.activeHunk();

  if (!proposal || !hunk) {
    panel.append(el('div.empty', { text: 'Select a proposal from the queue.' }));
    return panel;
  }

  // Tabs.
  const tabs = el('div.tabs');
  for (const [id, label] of [['composed', 'Composed'], ['review', 'Review mode'], ['edit', 'Edit ✎']]) {
    const b = el('button', { text: label, onclick: () => { reviewUI.tab = id; onChange(); } });
    if (reviewUI.tab === id) b.classList.add('active');
    tabs.append(b);
  }
  panel.append(tabs);

  // Hunk navigation.
  const count = proposal.hunks.length;
  const nav = el('div.hunk-nav', {}, [
    el('button.btn', { text: '‹', disabled: store.activeHunkIndex === 0,
      onclick: () => store.setHunkIndex(store.activeHunkIndex - 1) }),
    el('span', { text: `Hunk ${store.activeHunkIndex + 1} of ${count}` }),
    el('button.btn', { text: '›', disabled: store.activeHunkIndex >= count - 1,
      onclick: () => store.setHunkIndex(store.activeHunkIndex + 1) }),
    el('span', { text: hunk.article || '', style: 'font-family:var(--mono);font-size:11px;color:var(--fg-muted)' }),
  ]);
  panel.append(nav);

  if (reviewUI.tab === 'composed') {
    panel.append(el('div.content-view', { html: renderMarkdown(hunk.after || '') }));
  } else if (reviewUI.tab === 'review') {
    const gran = el('select', { value: reviewUI.granularity,
      onchange: (e) => { reviewUI.granularity = e.target.value; onChange(); } },
      ['auto', 'word', 'line'].map((g) =>
        el('option', { value: g, selected: g === reviewUI.granularity, text: g })));
    panel.append(el('div.edit-toolbar', {}, [el('span', { text: 'Granularity:' }), gran]));
    const { html } = renderDiff(hunk.before || '', hunk.after || '', reviewUI.granularity);
    panel.append(el('div.diff-view', { html }));
  } else {
    renderEditTab(panel, store, hunk, onChange);
  }

  return panel;
}

function renderEditTab(panel, store, hunk, onChange) {
  // Seed the editor: prefer existing reviewer_edit, else after. Restore an
  // OPFS draft if one exists for this hunk (best-effort, async).
  const seed = reviewUI.editValue ?? hunk.reviewer_edit ?? hunk.after ?? '';

  const ta = el('textarea.edit-surface', { value: seed,
    oninput: (e) => {
      reviewUI.editValue = e.target.value;
      saveDraft(store.activeProposalId, hunk.id, e.target.value);
      // Update the Diff-my-edits view live without full re-render churn.
      if (reviewUI.diffMyEdits) refreshDiff();
      // Enable/disable the Edit ▾ action elsewhere by emitting.
      store.emit();
    },
  });

  loadDraft(store.activeProposalId, hunk.id).then((draft) => {
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
    const { html, changed } = renderDiff(hunk.after || '', ta.value, 'auto');
    diffBox.innerHTML = changed ? html : '<em>No changes relative to the agent\'s proposal.</em>';
  };
  if (reviewUI.diffMyEdits) { refreshDiff(); panel.append(diffBox); }
}

/** Current editor content for the active hunk (for resolution actions). */
export function currentEditValue(hunk) {
  return reviewUI.editValue ?? hunk.reviewer_edit ?? null;
}

/** True when the Edit surface differs from the agent's `after`. */
export function editDiffersFromAfter(hunk) {
  const v = reviewUI.editValue;
  if (v == null) return !!hunk.reviewer_edit && hunk.reviewer_edit !== hunk.after;
  return v !== (hunk.after ?? '');
}

/** Reset edit view state when switching hunks/proposals. */
export function resetEditState() { reviewUI.editValue = null; reviewUI.diffMyEdits = false; }
