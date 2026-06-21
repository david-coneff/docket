// taxonomy.js — parse a tag-taxonomy.md file into a usable model.
//
// The taxonomy file has three parts (rhiz tools/tag-taxonomy.md):
//   1. YAML frontmatter (cid-short, adopted, schema-version) — version identity
//   2. prose tables (human form, governing)
//   3. a fenced ```yaml Machine Form block — the projection we load here
//
// We avoid a YAML dependency by parsing the known, shallow structure of the
// Machine Form block directly. On any parse failure we fall back to an empty
// taxonomy, and the UI treats all tags as freeform (warn-not-error).

const FALLBACK = {
  cidShort: null, adopted: null, schemaVersion: null,
  categories: [], mutualExclusion: [], allTags: new Set(),
};

/** Parse the `key: value` frontmatter between the first two `---` lines. */
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return fm;
}

/** Extract the first ```yaml fenced block body. */
function extractMachineYaml(text) {
  const m = text.match(/```yaml\n([\s\S]*?)\n```/);
  return m ? m[1] : '';
}

/**
 * Minimal structural parser for the taxonomy Machine Form. Tracks indentation
 * to assemble categories, their tags, and mutual-exclusion groups.
 */
function parseMachine(yaml) {
  const categories = [];
  const mutualExclusion = [];
  let cur = null;
  let inTags = false;
  let inMutex = false;

  for (const raw of yaml.split('\n')) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (line.startsWith('- id:') && indent <= 4) {
      cur = { id: line.slice(5).trim(), label: '', colorToken: '', tags: [] };
      categories.push(cur);
      inTags = false; inMutex = false;
      continue;
    }
    if (!cur) continue;

    if (line.startsWith('label:')) cur.label = line.slice(6).trim();
    else if (line.startsWith('color-token:')) cur.colorToken = line.slice(12).trim().replace(/^["']|["']$/g, '');
    else if (line.startsWith('mutual-exclusion-groups:')) { inMutex = true; inTags = false; }
    else if (line.startsWith('tags:')) { inTags = true; inMutex = false; }
    else if (inMutex && line.startsWith('- [')) {
      mutualExclusion.push(line.slice(3, -1).split(',').map((s) => s.trim()));
    }
    else if (inTags && line.startsWith('- id:')) cur.tags.push(line.slice(5).trim());
  }
  return { categories, mutualExclusion };
}

export function parseTaxonomy(text) {
  try {
    const fm = parseFrontmatter(text);
    const { categories, mutualExclusion } = parseMachine(extractMachineYaml(text));
    const allTags = new Set();
    for (const c of categories) for (const t of c.tags) allTags.add(t);
    return {
      cidShort: fm['cid-short'] || null,
      adopted: fm.adopted || null,
      schemaVersion: fm['schema-version'] || null,
      categories, mutualExclusion, allTags,
    };
  } catch {
    return { ...FALLBACK, allTags: new Set() };
  }
}

/** category id for a tag, or null if freeform. */
export function categoryOf(taxonomy, tag) {
  for (const c of taxonomy.categories) if (c.tags.includes(tag)) return c.id;
  return null;
}

/**
 * Given a hunk's current tag list and a candidate tag, return the tag(s) that
 * the candidate is mutually exclusive with and already present. Used to warn
 * (intent-hypothesis vs implementation-hypothesis).
 */
export function mutexConflicts(taxonomy, currentTags, candidate) {
  const conflicts = [];
  for (const group of taxonomy.mutualExclusion) {
    if (!group.includes(candidate)) continue;
    for (const other of group) {
      if (other !== candidate && currentTags.includes(other)) conflicts.push(other);
    }
  }
  return conflicts;
}
