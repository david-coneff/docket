// toolbar.js — File menu + toolbar (working dir, commit mode, batch commit).
import { el } from '../lib/dom.js';
import { openTaxonomyInspector } from './taxonomyInspector.js';
import { COMMITTABLE } from '../lib/resolve.js';

export function renderMenubar(store, actions) {
  const bar = el('div.menubar');
  const fileItem = el('div.menu-item', { text: 'File' });
  let open = false;
  const dd = el('div.dropdown', { style: 'display:none' }, [
    el('button', { text: 'Open working directory…', onclick: () => { hide(); actions.openDir(); } }),
    el('button', { text: 'Reload proposals', onclick: () => { hide(); actions.reload(); } }),
    el('div.sep'),
    el('button', { text: 'Tag Taxonomy…', onclick: () => { hide(); openTaxonomyInspector(store); } }),
  ]);
  const hide = () => { open = false; dd.style.display = 'none'; };
  fileItem.append(dd);
  fileItem.addEventListener('click', (e) => {
    if (e.target !== fileItem) return;
    open = !open; dd.style.display = open ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => { if (!fileItem.contains(e.target)) hide(); });
  bar.append(fileItem);
  bar.append(el('span', { text: 'docket', style: 'margin-left:10px;color:var(--fg-muted);font-size:12px' }));
  return bar;
}

export function renderToolbar(store, actions) {
  const bar = el('div.toolbar');
  bar.append(el('span.wd-path', { text: store.prefs.workingDirName
    ? `📁 ${store.prefs.workingDirName}` : '📁 (no folder)' }));
  bar.append(el('button.btn', { text: 'Change folder', onclick: () => actions.openDir() }));

  bar.append(el('span.spacer'));

  const toggle = el('div.mode-toggle');
  for (const m of ['immediate', 'batch']) {
    const b = el('button', { text: m, onclick: () => store.savePrefs({ commitMode: m }) });
    if (store.prefs.commitMode === m) b.classList.add('active');
    toggle.append(b);
  }
  bar.append(el('span', { text: 'Commit:', style: 'color:var(--fg-muted)' }), toggle);

  if (store.prefs.commitMode === 'batch') {
    const proposal = store.activeProposal();
    const committable = proposal
      ? (proposal.file_changes || []).filter((fc) => COMMITTABLE.has(fc.status)).length : 0;
    bar.append(el('button.btn.primary', {
      text: `Commit batch (${committable})`,
      disabled: committable === 0,
      onclick: () => actions.commitBatch(),
    }));
  }
  return bar;
}
