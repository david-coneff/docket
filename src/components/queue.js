// queue.js — proposal queue with sorting, multi-select, and bulk disposition.
import { el } from '../lib/dom.js';
import { sortProposals, isProposalReady, pendingCount } from '../lib/resolve.js';
import { categoryOf } from '../lib/taxonomy.js';

export function renderQueue(store, onDisposeSelected) {
  const panel = el('div.panel.queue');
  panel.append(el('h3', { text: 'Queue' }));

  const sortSel = el('select', {
    value: store.prefs.sortMode,
    onchange: (e) => store.savePrefs({ sortMode: e.target.value }),
  }, ['manual', 'date', 'tag', 'importance'].map((m) =>
    el('option', { value: m, selected: m === store.prefs.sortMode, text: m })));
  const sortRow = el('div.sort-row', {}, [el('span', { text: 'Sort:' }), sortSel]);

  if (store.prefs.sortMode === 'tag') {
    const allTags = new Set();
    store.proposals.forEach((p) => (p.data?.tags || []).forEach((t) => allTags.add(t)));
    const tagSel = el('select', {
      onchange: (e) => store.savePrefs({ sortTag: e.target.value }),
    }, [...allTags].map((t) =>
      el('option', { value: t, selected: t === store.prefs.sortTag, text: t })));
    sortRow.append(tagSel);
  }
  panel.append(sortRow);

  const ordered = sortProposals(store.proposals, {
    sortMode: store.prefs.sortMode,
    sortTag: store.prefs.sortTag,
    manualOrder: store.manualOrder,
  }).filter((p) => !store.disposedProposalIds.has(p.data?.id));

  if (!ordered.length) {
    panel.append(el('div.empty', { text: 'No proposals. Open a working directory.' }));
  } else {
    const manual = store.prefs.sortMode === 'manual';
    ordered.forEach((p) => {
      const d = p.data;
      if (!d) return;
      const ready = isProposalReady(d);
      const pending = pendingCount(d);
      const fileCount = (d.file_changes || []).length;

      const item = el('div.queue-item', { dataset: { id: d.id } });
      if (d.id === store.activeProposalId) item.classList.add('active');
      if (ready) item.classList.add('ready');
      if (manual) item.draggable = true;

      const cb = el('input', {
        type: 'checkbox',
        checked: store.selectedProposalIds.has(d.id),
        title: 'Select for bulk dispose',
        onclick: (e) => { e.stopPropagation(); store.toggleProposalSelect(d.id); },
      });

      const header = el('div.queue-item-header', {}, [
        cb,
        el('div.qtitle', { text: d.title || d.id }),
      ]);
      if (ready) header.append(el('span.ready-badge', { text: '✓', title: 'All files resolved — ready to dispose' }));
      item.append(header);

      item.append(el('div.qmeta', {
        text: `${fileCount} file${fileCount !== 1 ? 's' : ''} · ${pending} pending`,
      }));

      const chips = el('div.tag-chips', { style: 'margin-top:6px' });
      (d.tags || []).forEach((t) => {
        const cat = categoryOf(store.taxonomy, t) || 'neutral';
        chips.append(el(`span.chip.${cat}`, { text: t, style: 'font-size:10px' }));
      });
      item.append(chips);

      item.addEventListener('click', () => store.setActive(d.id, 0));
      if (manual) wireDrag(item, store);
      panel.append(item);
    });
  }

  const selCount = store.selectedProposalIds.size;
  const disposeBtn = el('button.btn.primary.dispose-btn', {
    text: selCount ? `Dispose selected (${selCount})` : 'Dispose selected',
    disabled: selCount === 0,
    onclick: () => onDisposeSelected([...store.selectedProposalIds]),
  });
  panel.append(disposeBtn);

  return panel;
}

function wireDrag(item, store) {
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', item.dataset.id);
    item.style.opacity = '0.4';
  });
  item.addEventListener('dragend', () => { item.style.opacity = ''; });
  item.addEventListener('dragover', (e) => e.preventDefault());
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    const dragged = e.dataTransfer.getData('text/plain');
    const target = item.dataset.id;
    if (!dragged || dragged === target) return;
    const order = store.manualOrder.filter((id) => id !== dragged);
    const idx = order.indexOf(target);
    order.splice(idx, 0, dragged);
    store.manualOrder = order;
    store.emit();
  });
}
