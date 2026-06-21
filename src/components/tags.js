// tags.js — editable tag chips with taxonomy autocomplete + mutex warning.
import { el } from '../lib/dom.js';
import { categoryOf, mutexConflicts } from '../lib/taxonomy.js';

export function renderTags(hunk, taxonomy, onChange) {
  const tags = Array.isArray(hunk.tags) ? hunk.tags : (hunk.tags = []);
  const wrap = el('div.section');
  wrap.append(el('h3', { text: 'Tags' }));

  const chips = el('div.tag-chips');
  for (const tag of tags) {
    const cat = categoryOf(taxonomy, tag) || 'neutral';
    chips.append(el(`span.chip.${cat}`, {}, [
      tag,
      el('span.x', { text: '×', title: 'remove', onclick: () => {
        hunk.tags = tags.filter((t) => t !== tag); onChange();
      } }),
    ]));
  }
  wrap.append(chips);

  const input = el('input', { type: 'text', placeholder: 'add tag…',
    list: 'tag-suggestions' });
  const addBtn = el('button.btn', { text: 'Add', onclick: () => add() });
  const add = () => {
    const v = input.value.trim();
    if (v && !tags.includes(v)) { tags.push(v); input.value = ''; onChange(); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  // Datalist of known tags for autocomplete.
  const dl = el('datalist', { id: 'tag-suggestions' },
    [...taxonomy.allTags].map((t) => el('option', { value: t })));

  wrap.append(el('div.tag-add', {}, [input, addBtn]), dl);

  // Mutual-exclusion warning across all known mutex groups.
  for (const group of taxonomy.mutualExclusion) {
    const present = group.filter((t) => tags.includes(t));
    if (present.length > 1) {
      wrap.append(el('div.mutex-warn', {
        text: `⚠ Mutually exclusive tags present: ${present.join(' + ')}`,
      }));
    }
  }
  return wrap;
}

export { mutexConflicts };
