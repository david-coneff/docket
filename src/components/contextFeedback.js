// contextFeedback.js — right panel: index context, tags, feedback, actions,
// lint gate. Owns the six-state resolution UI (docket §Actions).
import { el } from '../lib/dom.js';
import { renderTags } from './tags.js';
import { applyResolution, STATES, STATE_LABEL } from '../lib/resolve.js';
import { lintHunk } from '../lib/lint.js';
import { currentEditValue, editDiffersFromAfter, resetEditState } from './review.js';
import { clearDraft } from '../lib/store.js';

let feedbackText = '';
let editNotesText = '';
let editMenuOpen = false;
let approveMenuOpen = false;

export function resetFeedbackState() { feedbackText = ''; editNotesText = ''; editMenuOpen = false; approveMenuOpen = false; }

export function renderContextFeedback(store, onResolve, onChange) {
  const panel = el('div.panel.context');
  const hunk = store.activeHunk();
  if (!hunk) return panel;

  const resolved = hunk.status !== 'pending';
  panel.append(el('div', { style: 'margin-bottom:10px' }, [
    el(`span.status-pill${resolved ? '.resolved' : ''}`, { text: STATE_LABEL[hunk.status] || hunk.status }),
  ]));

  const ctx = el('div.section');
  ctx.append(el('h3', { text: 'Index context' }));
  if (hunk.index_context) {
    const article = (hunk.article || '').split('/').pop();
    const text = hunk.index_context;
    const box = el('div.index-context');
    text.split('\n').forEach((line) => {
      const row = el('div', { text: line + '\n' });
      if (article && line.includes(article)) row.className = 'hit';
      box.append(row);
    });
    ctx.append(box);
  } else {
    ctx.append(el('div', { text: '(no index context recorded)', style: 'color:var(--fg-muted)' }));
  }
  panel.append(ctx);

  panel.append(renderTags(hunk, store.taxonomy, onChange));

  const fb = el('div.section');
  fb.append(el('h3', { text: 'Feedback' }));
  fb.append(el('div.feedback-label', { text: 'Notes (required for Request changes / Reject)' }));
  const fbArea = el('textarea.feedback', { value: feedbackText, placeholder: 'Markdown feedback…',
    oninput: (e) => { feedbackText = e.target.value; } });
  fb.append(fbArea);

  const attachList = el('ul.attach-list');
  (hunk.comments || []).flatMap((c) => c.attachments || []).forEach((a) =>
    attachList.append(el('li', { text: `📎 ${a.filename} → ${a.path}` })));
  const zone = el('div.attach-zone', { text: 'Drag files here to attach as path references' });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag');
    for (const f of e.dataTransfer.files) {
      pendingAttachments.push({ filename: f.name, mime_type: f.type || 'application/octet-stream',
        path: f.path || `(dropped: ${f.name} — provide path manually)` });
      attachList.append(el('li', { text: `📎 ${f.name} (pending)` }));
    }
  });
  fb.append(zone, attachList);
  panel.append(fb);

  const en = el('div.section');
  en.append(el('div.feedback-label', { text: 'Edit note (short, for direct edits)' }));
  en.append(el('input', { type: 'text', value: editNotesText, placeholder: 'e.g. fixed wording in para 3',
    style: 'width:100%;padding:5px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:4px',
    oninput: (e) => { editNotesText = e.target.value; } }));
  panel.append(en);

  const lint = lintHunk(hunk);
  const gate = el(`div.lint-gate${lint.errors.length ? '' : ' clean'}`);
  if (!lint.errors.length && !lint.warnings.length) gate.append(el('span', { text: '✓ rhiz-lint: clean' }));
  lint.errors.forEach((e) => gate.append(el('div.err', { text: `✗ ${e}` })));
  lint.warnings.forEach((w) => gate.append(el('div.warn', { text: `⚠ ${w}` })));
  panel.append(gate);

  panel.append(renderActions(store, hunk, onResolve, onChange));
  return panel;
}

let pendingAttachments = [];

function commitAttachments(hunk, role) {
  if (!pendingAttachments.length) return;
  if (!hunk.comments) hunk.comments = [];
  hunk.comments.push({
    id: `comment-${(hunk.comments.length + 1).toString().padStart(2, '0')}`,
    created: new Date().toISOString(), role, text: '', attachments: pendingAttachments.slice(),
  });
  pendingAttachments = [];
}

function renderActions(store, hunk, onResolve, onChange) {
  const wrap = el('div.actions');
  const finish = (state, opts) => {
    commitAttachments(hunk, 'general');
    applyResolution(hunk, state, opts);
    clearDraft(store.activeProposalId, hunk.id);
    resetFeedbackState();
    onResolve(state);
  };

  const approveSplit = el('div.split');
  if (approveMenuOpen) {
    approveSplit.append(el('div.menu', {}, [
      el('button', { text: 'Approve', onclick: () => finish(STATES.APPROVED, { notes: feedbackText }) }),
      el('button', { text: 'Approve — working draft', onclick: () => finish(STATES.APPROVED_WORKING_DRAFT, { notes: feedbackText }) }),
    ]));
  }
  approveSplit.append(el('button.btn.primary', { text: 'Approve ▾',
    style: 'width:100%', onclick: () => { approveMenuOpen = !approveMenuOpen; editMenuOpen = false; onChange(); } }));

  const canEdit = editDiffersFromAfter(hunk);
  const editSplit = el('div.split');
  if (editMenuOpen && canEdit) {
    editSplit.append(el('div.menu', {}, [
      el('button', { text: 'Commit my edit', onclick: () =>
        finish(STATES.EDITED_COMMIT, { reviewerEdit: currentEditValue(hunk), editNotes: editNotesText, comment: feedbackText }) }),
      el('button', { text: 'Send edit as feedback', onclick: () =>
        finish(STATES.EDITED_FOR_AGENT, { reviewerEdit: currentEditValue(hunk), editNotes: editNotesText, comment: feedbackText }) }),
    ]));
  }
  editSplit.append(el('button.btn', { text: 'Edit ▾', disabled: !canEdit, style: 'width:100%',
    title: canEdit ? '' : 'Edit the content in the Edit ✎ tab first',
    onclick: () => { editMenuOpen = !editMenuOpen; approveMenuOpen = false; onChange(); } }));

  wrap.append(el('div.row', {}, [approveSplit, editSplit]));

  const requireFb = (state) => {
    if (!feedbackText.trim()) { alert('Feedback is required for this action.'); return; }
    finish(state, { comment: feedbackText });
  };
  wrap.append(el('div.row', {}, [
    el('button.btn', { text: 'Request changes', style: 'flex:1', onclick: () => requireFb(STATES.CHANGES_REQUESTED) }),
    el('button.btn', { text: 'Reject', style: 'flex:1', onclick: () => requireFb(STATES.REJECTED) }),
  ]));

  return wrap;
}
