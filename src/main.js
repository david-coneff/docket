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
import { COMMITTABLE } from './lib/resolve.js';
import { renderMenubar, renderToolbar } from './components/toolbar.js';
import { renderQueue } from './components/queue.js';
import { renderReview, resetEditState } from './components/review.js';
import { renderContextFeedback, resetFeedbackState } from './components/contextFeedback.js';

// --- Taxonomy bootstrap (bundled default; project override loaded on open). --
store.taxonomy = parseTaxonomy(defaultTaxonomyText);
store.taxonomySource = `tag-taxonomy.md (default)`;

const root = document.getElementById('app');

// Reset transient per-hunk UI state when the active hunk changes.
let lastActiveKey = null;
function syncTransient() {
  const key = `${store.activeProposalId}::${store.activeHunkIndex}`;
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
      // Fallback: file input.
      const files = await readFilesViaInput();
      const tax = files.find((f) => f.taxonomy);
      if (tax) { store.taxonomy = parseTaxonomy(tax.taxonomy); store.taxonomySource = 'project-local (uploaded)'; }
      store.setProposals(files.filter((f) => f.data));
    }
  },

  async reload() {
    if (store.dirHandle) store.setProposals(await readProposals(store.dirHandle));
  },

  // Called after a hunk resolves. In immediate mode, write the resolved
  // artifact whenever the hunk became committable.
  async onResolve(state) {
    const proposal = store.activeProposal();
    if (store.prefs.commitMode === 'immediate' && COMMITTABLE.has(state)) {
      const res = await writeResolved(store.dirHandle, proposal);
      flash(`Committed hunk → ${res.path}`);
    }
    // Advance to next pending hunk if any.
    const next = proposal.hunks.findIndex((h, i) => i > store.activeHunkIndex && h.status === 'pending');
    if (next >= 0) store.setHunkIndex(next);
    else store.emit();
  },

  async commitBatch() {
    const proposal = store.activeProposal();
    const res = await writeResolved(store.dirHandle, proposal);
    flash(`Batch written → ${res.path}`);
  },
};

let flashMsg = null;
function flash(msg) { flashMsg = msg; render(); setTimeout(() => { flashMsg = null; render(); }, 4000); }

function render() {
  syncTransient();
  clear(root);
  root.append(renderMenubar(store, actions));
  root.append(renderToolbar(store, actions));

  const panels = el('div.panels');
  panels.append(renderQueue(store));
  panels.append(renderReview(store, render));
  panels.append(renderContextFeedback(store, actions.onResolve, render));
  root.append(panels);

  if (flashMsg) {
    root.append(el('div', { text: flashMsg,
      style: 'position:fixed;bottom:16px;right:16px;background:var(--accent);color:#fff;padding:10px 16px;border-radius:6px;z-index:60' }));
  }
}

store.subscribe(() => render());
render();

// Surface FS-access capability for the user.
if (!supportsFSAccess) {
  console.info('File System Access API unavailable — using file-input fallback (read) and download (write).');
}
