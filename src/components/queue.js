// queue.js — proposal queue with sorting and manual drag-reorder.
import { el } from '../lib/dom.js';
import { sortProposals, STATE_LABEL } from '../lib/resolve.js';
import { categoryOf } from '../lib/taxonomy.js';

export function renderQueue(store) {
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
  });

  if (!ordered.length) {
    panel.append(el('div.empty', { text: 'No proposals. Open a working directory.' }));
    return panel;
  }

  const manual = store.prefs.sortMode === 'manual';
  ordered.forEach((p) => {
    const d = p.data;
    if (!d) return;
    const resolved = (d.hunks || []).every((h) => h.status !== 'pending');
    const item = el('div.queue-item', {
      draggable: manual,
      onclick: () => store.setActive(d.id, 0),
      dataset: { id: d.id },
    });
    if (d.id === store.activeProposalId) item.classList.add('active');
    item.append(el('div.qtitle', { text: d.title || d.id }));
    item.append(el('div.qmeta', {
      text: `${(d.hunks || []).length} hunk(s) · ${resolved ? 'resolved' : 'pending'}`,
    }));
    const chips = el('div.tag-chips', { style: 'margin-top:6px' });
    (d.tags || []).forEach((t) => {
      const cat = categoryOf(store.taxonomy, t) || 'neutral';
      chips.append(el(`span.chip.${cat}`, { text: t, style: 'font-size:10px' }));
    });
    item.append(chips);

    if (manual) wireDrag(item, store);
    panel.append(item);
  });

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
