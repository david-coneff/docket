// toolbar.js — File menu + toolbar (working dir, commit mode, batch commit, theme).
import { el } from '../lib/dom.js';
import { icon } from '../lib/icon.js';
import { renderThemePill } from '../lib/theme.js';
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
  bar.append(el('span.menubar-spacer'));
  // Right-aligned, following tessel's convention: app name then theme toggle
  // (toggle rightmost).
  bar.append(el('span.app-name', { text: 'docket' }));
  bar.append(renderThemePill());
  return bar;
}

export function renderToolbar(store, actions) {
  const bar = el('div.toolbar');

  // Reconnect banner when handle needs a user gesture to re-grant permission
  if (store.pendingDirHandle) {
    const name = store.prefs.workingDirName || 'last folder';
    const btn = el('button.btn.reconnect-btn', { onclick: () => actions.reconnect() });
    btn.append(icon('folder', 14), document.createTextNode(` Reconnect to “${name}”`));
    bar.append(btn);
    bar.append(el('span.spacer'));
    return bar;
  }

  const folderBtn = el('button.btn', { onclick: () => actions.openDir() });
  folderBtn.append(icon('folder', 14), document.createTextNode(
    store.prefs.workingDirName ? ` ${store.prefs.workingDirName}` : ' Open folder'
  ));
  bar.append(folderBtn);

  if (store.dirHandle) {
    const reloadBtn = el('button.btn.icon-btn', { title: 'Reload proposals', onclick: () => actions.reload() });
    reloadBtn.append(icon('reload', 14));
    bar.append(reloadBtn);
  }

  bar.append(el('span.spacer'));

  const toggle = el('div.mode-toggle');
  for (const m of ['immediate', 'batch']) {
    const b = el('button', { text: m, onclick: () => store.savePrefs({ commitMode: m }) });
    if (store.prefs.commitMode === m) b.classList.add('active');
    toggle.append(b);
  }
  bar.append(el('span.toolbar-label', { text: 'Commit:' }), toggle);

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
