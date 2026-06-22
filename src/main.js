// main.js — docket application shell.
import './styles/theme.css';
import './styles/app.css';
import defaultTaxonomyText from '../tag-taxonomy.md?raw';

import { el, clear } from './lib/dom.js';
import { store } from './lib/store.js';
import { parseTaxonomy } from './lib/taxonomy.js';
import {
  supportsFSAccess, pickWorkingDirectory, readProposals, readProjectTaxonomy,
  readFilesViaInput, writeResolved,
} from './lib/fsAccess.js';
import { COMMITTABLE, isProposalReady, pendingCount } from './lib/resolve.js';
import { renderMenubar, renderToolbar } from './components/toolbar.js';
import { renderQueue } from './components/queue.js';
import { renderReview, resetEditState } from './components/review.js';
import { renderContextFeedback, resetFeedbackState } from './components/contextFeedback.js';

store.taxonomy = parseTaxonomy(defaultTaxonomyText);
store.taxonomySource = `tag-taxonomy.md (default)`;

const root = document.getElementById('app');

let lastActiveKey = null;
function syncTransient() {
  const key = `${store.activeProposalId}::${store.activeFileIndex}`;
  if (key !== lastActiveKey) { resetEditState(); resetFeedbackState(); lastActiveKey = key; }
}

const actions = {
  async openDir() {
    if (supportsFSAccess) {
      const handle = await pickWorkingDirectory();
      if (!handle) return;
      store.dirHandle = handle;
      store.savePrefs({ workingDirName: handle.name });
      const override = await readProjectTaxonomy(handle);
      if (override) {
        store.taxonomy = parseTaxonomy(override);
        store.taxonomySource = 'rhiz-proposals/tag-taxonomy.md (project-local)';
      }
      const found = await readProposals(handle);
      store.setProposals(found);
    } else {
      const files = await readFilesViaInput();
      const tax = files.find((f) => f.taxonomy);
      if (tax) { store.taxonomy = parseTaxonomy(tax.taxonomy); store.taxonomySource = 'project-local (uploaded)'; }
      store.setProposals(files.filter((f) => f.data));
    }
  },

  async reload() {
    if (store.dirHandle) store.setProposals(await readProposals(store.dirHandle));
  },

  async onResolve(state) {
    const proposal = store.activeProposal();
    if (store.prefs.commitMode === 'immediate' && COMMITTABLE.has(state)) {
      const res = await writeResolved(store.dirHandle, proposal);
      flash(`Committed file → ${res.path}`);
    }
    const next = (proposal.file_changes || []).findIndex(
      (fc, i) => i > store.activeFileIndex && fc.status === 'pending'
    );
    if (next >= 0) store.setFileIndex(next);
    else store.emit();
  },

  async onBulkResolve(state) {
    const proposal = store.activeProposal();
    if (store.prefs.commitMode === 'immediate' && COMMITTABLE.has(state)) {
      const res = await writeResolved(store.dirHandle, proposal);
      flash(`Committed → ${res.path}`);
    } else {
      store.emit();
    }
  },

  async commitBatch() {
    const proposal = store.activeProposal();
    const res = await writeResolved(store.dirHandle, proposal);
    flash(`Batch written → ${res.path}`);
  },

  async disposeSelected(ids) {
    const ready = [], notReady = [];
    for (const id of ids) {
      const p = store.proposals.find((p) => p.data?.id === id);
      if (!p) continue;
      if (isProposalReady(p.data)) ready.push(p); else notReady.push(p.data);
    }
    for (const p of ready) {
      await writeResolved(store.dirHandle, p.data);
      store.disposedProposalIds.add(p.data.id);
    }
    store.selectedProposalIds.clear();
    const msgs = [];
    if (ready.length) msgs.push(`Dispositioned ${ready.length} proposal(s).`);
    if (notReady.length) {
      msgs.push(`${notReady.length} proposal(s) skipped — still have pending files:`);
      notReady.forEach((d) => { const n = pendingCount(d); msgs.push(`  • ${d.title || d.id} (${n} file(s) pending)`); });
    }
    flash(msgs.join('\n'));
    store.emit();
  },
};

let flashMsg = null;
function flash(msg) { flashMsg = msg; render(); setTimeout(() => { flashMsg = null; render(); }, 4000); }

// Focusable input selectors that should survive a re-render.
const FOCUS_SELECTORS = ['.edit-surface', 'textarea.feedback'];

function render() {
  // Save focus state so text inputs survive DOM replacement.
  const prev = document.activeElement;
  const focusSelector = FOCUS_SELECTORS.find((s) => prev?.matches?.(s));
  const selStart = focusSelector ? prev.selectionStart : null;
  const selEnd   = focusSelector ? prev.selectionEnd   : null;

  syncTransient();
  clear(root);
  root.append(renderMenubar(store, actions));
  root.append(renderToolbar(store, actions));

  const panels = el('div.panels');
  panels.append(renderQueue(store, actions.disposeSelected));
  panels.append(renderReview(store, render, actions.onBulkResolve));
  panels.append(renderContextFeedback(store, actions.onResolve, render));
  root.append(panels);

  if (flashMsg) {
    root.append(el('div', { text: flashMsg,
      style: 'position:fixed;bottom:16px;right:16px;background:var(--accent);color:#fff;padding:10px 16px;border-radius:6px;z-index:60;white-space:pre-line' }));
  }

  // Restore focus and cursor position if a text input was active.
  if (focusSelector) {
    const next = root.querySelector(focusSelector);
    if (next) {
      next.focus();
      try { next.setSelectionRange(selStart, selEnd); } catch { /* not all inputs support this */ }
    }
  }
}

store.subscribe(() => render());
render();

if (!supportsFSAccess) {
  console.info('File System Access API unavailable — using file-input fallback (read) and download (write).');
}
