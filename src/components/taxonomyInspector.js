// taxonomyInspector.js — File > Tag Taxonomy modal (docket §Taxonomy Inspector).
import { el } from '../lib/dom.js';

const CATEGORY_LABELS = {
  'bug-lifecycle': 'Bug & Fix Lifecycle',
  hypothesis: 'Hypothesis',
  'prose-governance': 'Prose & Governance',
  process: 'Process',
};

export function openTaxonomyInspector(store) {
  const tax = store.taxonomy;
  const close = () => backdrop.remove();
  const backdrop = el('div.modal-backdrop', { onclick: (e) => { if (e.target === backdrop) close(); } });

  const modal = el('div.modal');
  modal.append(el('span.close-x', { text: '✕', onclick: close }));
  modal.append(el('h2', { text: 'Tag Taxonomy' }));
  modal.append(el('div.ver', { html:
    `Source:&nbsp; ${store.taxonomySource}<br>` +
    `Version:&nbsp; ${tax.adopted || '(unstamped)'} · cid-short: ${tax.cidShort || '—'}<br>` +
    `Schema:&nbsp; v${tax.schemaVersion || '?'}` }));

  for (const cat of tax.categories) {
    modal.append(el('div.cat-head', { text: `── ${CATEGORY_LABELS[cat.id] || cat.id} ──` }));
    const table = el('table');
    for (const tag of cat.tags) {
      table.append(el('tr', {}, [
        el('td', { html: `<code>${tag}</code>` }),
        el('td', { text: '' }),
      ]));
    }
    modal.append(table);
    const mutex = tax.mutualExclusion.filter((g) => g.every((t) => cat.tags.includes(t)));
    mutex.forEach((g) => modal.append(el('div.mutex-warn', {
      text: `⚠ Mutually exclusive within a single hunk: ${g.join(' / ')}` })));
  }

  backdrop.append(modal);
  document.body.append(backdrop);
}
