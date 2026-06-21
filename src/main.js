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

// --- Taxonomy bootstrap (bundled default; project override loaded on open). --
store.taxonomy = parseTaxonomy(defaultTaxonomyText);
store.taxonomySource = `tag-taxonomy.md (default)`;

const root = document.getElementById('app');

// Reset transient per-file UI state when the active file changes.
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

  // Called after a single file change resolves.
  async onResolve(state) {
    const proposal = store.activeProposal();
    if (store.prefs.commitMode === 'immediate' && COMMITTABLE.has(state)) {
      const res = await writeResolved(store.dirHandle, proposal);
      flash(`Committed → ${res.path}`);
    }
    // Advance to next pending file_change if any.
    const changes = proposal.file_changes || [];
    const next = changes.findIndex((fc, i) => i > store.activeFileIndex && fc.status === 'pending');
    if (next >= 0) store.setFileIndex(next);
    else store.emit();
  },

  // Called after a bulk-apply action from the review panel.
  async onBulkResolve(state) {
    const proposal = store.activeProposal();
    if (store.prefs.commitMode === 'immediate' && COMMITTABLE.has(state)) {
      const res = await writeResolved(store.dirHandle, proposal);
      flash(`Bulk committed → ${res.path}`);
    } else {
      store.emit();
    }
  },

  async commitBatch() {
    const proposal = store.activeProposal();
    const res = await writeResolved(store.dirHandle, proposal);
    flash(`Batch written → ${res.path}`);
  },

  // Dispose selected proposals from the queue.
  // Ready proposals are written and removed from the queue view.
  // Proposals with pending files are skipped with a reminder.
  async disposeSelected(ids) {
    const ready = [];
    const notReady = [];
    for (const id of ids) {
      const p = store.proposals.find((p) => p.data?.id === id);
      if (!p) continue;
      if (isProposalReady(p.data)) ready.push(p);
      else notReady.push(p.data);
    }

    for (const p of ready) {
      await writeResolved(store.dirHandle, p.data);
      store.disposedProposalIds.add(p.data.id);
    }
    store.selectedProposalIds.clear();

    const msgs = [];
    if (ready.length) msgs.push(`Disposed ${ready.length} proposal${ready.length !== 1 ? 's' : ''}.`);
    if (notReady.length) {
      msgs.push(`${notReady.length} proposal${notReady.length !== 1 ? 's' : ''} skipped — still have pending files:`);
      notReady.forEach((d) => {
        const n = pendingCount(d);
        msgs.push(`  • ${d.title || d.id} (${n} file${n !== 1 ? 's' : ''} pending)`);
      });
    }
    flash(msgs.join('\n'));
    store.emit();
  },
};

let flashMsg = null;
function flash(msg) { flashMsg = msg; render(); setTimeout(() => { flashMsg = null; render(); }, 6000); }

function render() {
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
    root.append(el('div.flash-msg', {
      text: flashMsg,
      style: 'position:fixed;bottom:16px;right:16px;background:var(--accent);color:var(--accent-fg);padding:10px 16px;border-radius:6px;z-index:60;white-space:pre-line;max-width:400px',
    }));
  }
}

store.subscribe(() => render());
render();

if (!supportsFSAccess) {
  console.info('File System Access API unavailable — using file-input fallback (read) and download (write).');
}
