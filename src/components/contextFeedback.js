// contextFeedback.js — right panel: tags, feedback, and resolution actions.
import { el } from '../lib/dom.js';
import { icon } from '../lib/icon.js';
import * as S from '../lib/storage.js';
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

function collapsible(label, contentEl, storageKey) {
  const open = S.getItem(storageKey) !== '0';
  const wrap = el('div.collapsible-section');
  const hdr = el('div.collapsible-header');
  const arrow = el('span.collapsible-arrow');
  arrow.append(icon(open ? 'chevron-down' : 'chevron-right', 12));
  hdr.append(arrow, el('span.collapsible-label', { text: label }));
  const body = el('div.collapsible-body', { style: open ? '' : 'display:none' });
  body.append(contentEl);
  hdr.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    arrow.innerHTML = '';
    arrow.append(icon(isOpen ? 'chevron-right' : 'chevron-down', 12));
    S.setItem(storageKey, isOpen ? '0' : '1');
  });
  wrap.append(hdr, body);
  return wrap;
}

export function renderContextFeedback(store, onResolve, onChange) {
  const panel = el('div.panel.context');
  const fc = store.activeFile();
  if (!fc) return panel;

  const resolved = fc.status !== 'pending';
  panel.append(el('div.status-row', {}, [
    el(`span.status-pill${resolved ? '.resolved' : ''}`, { text: STATE_LABEL[fc.status] || fc.status }),
  ]));

  // Tags (collapsible)
  const tagsContent = renderTags(fc, store.taxonomy, onChange);
  panel.append(collapsible('Tags', tagsContent, 'dkt:ui.cf.tags'));

  // Feedback (collapsible)
  const fbWrap = el('div');
  fbWrap.append(el('div.feedback-label', { text: 'Notes (required for Request changes / Reject)' }));
  const fbArea = el('textarea.feedback', { value: feedbackText, placeholder: 'Markdown feedback…',
    oninput: (e) => { feedbackText = e.target.value; } });
  fbWrap.append(fbArea);
  const attachList = el('ul.attach-list');
  (fc.comments || []).flatMap((c) => c.attachments || []).forEach((a) =>
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
  fbWrap.append(zone, attachList);
  panel.append(collapsible('Feedback', fbWrap, 'dkt:ui.cf.feedback'));

  // Edit note (collapsible)
  const enWrap = el('div');
  enWrap.append(el('div.feedback-label', { text: 'Short note for direct edits' }));
  enWrap.append(el('input', { type: 'text', value: editNotesText, placeholder: 'e.g. fixed wording in para 3',
    style: 'width:100%;padding:5px;background:var(--field-bg);color:var(--text);border:1px solid var(--field-border);border-radius:4px',
    oninput: (e) => { editNotesText = e.target.value; } }));
  panel.append(collapsible('Edit note', enWrap, 'dkt:ui.cf.editnote'));

  // Lint gate (always visible)
  const lint = lintHunk(fc);
  const gate = el(`div.lint-gate${lint.errors.length ? '' : ' clean'}`);
  if (!lint.errors.length && !lint.warnings.length) {
    gate.append(icon('check-circle', 13), document.createTextNode(' rhiz-lint: clean'));
  }
  lint.errors.forEach((e) => {
    const row = el('div.err'); row.append(icon('x-circle', 13), document.createTextNode(` ${e}`)); gate.append(row);
  });
  lint.warnings.forEach((w) => {
    const row = el('div.warn'); row.append(icon('warning', 13), document.createTextNode(` ${w}`)); gate.append(row);
  });
  panel.append(gate);

  panel.append(renderActions(store, fc, onResolve, onChange));
  return panel;
}

let pendingAttachments = [];

function commitAttachments(fc, role) {
  if (!pendingAttachments.length) return;
  if (!fc.comments) fc.comments = [];
  fc.comments.push({
    id: `comment-${(fc.comments.length + 1).toString().padStart(2, '0')}`,
    created: new Date().toISOString(), role, text: '', attachments: pendingAttachments.slice(),
  });
  pendingAttachments = [];
}

function renderActions(store, fc, onResolve, onChange) {
  const wrap = el('div.actions');
  const finish = (state, opts) => {
    commitAttachments(fc, 'general');
    applyResolution(fc, state, opts);
    clearDraft(store.activeProposalId, fc.id);
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

  const canEdit = editDiffersFromAfter(fc);
  const editSplit = el('div.split');
  if (editMenuOpen && canEdit) {
    editSplit.append(el('div.menu', {}, [
      el('button', { text: 'Commit my edit', onclick: () =>
        finish(STATES.EDITED_COMMIT, { reviewerEdit: currentEditValue(fc), editNotes: editNotesText, comment: feedbackText }) }),
      el('button', { text: 'Send edit as feedback', onclick: () =>
        finish(STATES.EDITED_FOR_AGENT, { reviewerEdit: currentEditValue(fc), editNotes: editNotesText, comment: feedbackText }) }),
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
