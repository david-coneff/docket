// store.js — central app state with a tiny pub/sub, localStorage-backed
// preferences, and OPFS-backed persistence of unsaved Edit-tab content.
//
// Persisted preferences (rhiz-review §3.2, §5, Queue sorting): commit mode,
// sort mode, last working-directory name. The directory *handle* itself is
// held in memory only (re-pick on reload unless the browser restores it).

const PREFS_KEY = 'rhiz-review.prefs.v1';

const DEFAULT_PREFS = {
  commitMode: 'batch',        // 'immediate' | 'batch'
  sortMode: 'manual',         // 'manual' | 'date' | 'tag' | 'importance'
  sortTag: null,              // tag to group by when sortMode === 'tag'
  workingDirName: null,
};

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_PREFS }; }
}

export const store = {
  prefs: loadPrefs(),
  dirHandle: null,
  taxonomy: null,
  taxonomySource: 'default',     // 'default' | 'project-local'
  proposals: [],                 // [{ name, data }]
  manualOrder: [],               // proposal ids in manual order
  activeProposalId: null,
  activeHunkIndex: 0,
  _subs: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit() { for (const fn of this._subs) fn(this); },

  savePrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
    this.emit();
  },

  setProposals(list) {
    this.proposals = list;
    const ids = list.map((p) => p.data?.id).filter(Boolean);
    // Preserve any existing manual order; append new ids at the end.
    this.manualOrder = [
      ...this.manualOrder.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !this.manualOrder.includes(id)),
    ];
    if (!this.activeProposalId && ids.length) this.activeProposalId = ids[0];
    this.emit();
  },

  activeProposal() {
    return this.proposals.find((p) => p.data?.id === this.activeProposalId)?.data || null;
  },

  activeHunk() {
    const p = this.activeProposal();
    return p ? p.hunks[this.activeHunkIndex] || null : null;
  },

  setActive(proposalId, hunkIndex = 0) {
    this.activeProposalId = proposalId;
    this.activeHunkIndex = hunkIndex;
    this.emit();
  },

  setHunkIndex(i) { this.activeHunkIndex = i; this.emit(); },

  // Mutate the active hunk and re-emit.
  updateActiveHunk(patch) {
    const h = this.activeHunk();
    if (!h) return;
    Object.assign(h, patch);
    this.emit();
  },
};

// ---------------------------------------------------------------------------
// OPFS persistence of unsaved Edit-tab content (rhiz-review §5 / Review panel).
// Keyed by "<proposalId>::<hunkId>". Best-effort; silently no-ops if OPFS is
// unavailable.
// ---------------------------------------------------------------------------

async function opfsDir() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('rhiz-review-drafts', { create: true });
}

function draftKey(proposalId, hunkId) {
  return `${proposalId}__${hunkId}.draft`;
}

export async function saveDraft(proposalId, hunkId, content) {
  try {
    const dir = await opfsDir();
    if (!dir) return;
    const fh = await dir.getFileHandle(draftKey(proposalId, hunkId), { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  } catch { /* ignore */ }
}

export async function loadDraft(proposalId, hunkId) {
  try {
    const dir = await opfsDir();
    if (!dir) return null;
    const fh = await dir.getFileHandle(draftKey(proposalId, hunkId), { create: false });
    return await (await fh.getFile()).text();
  } catch { return null; }
}

export async function clearDraft(proposalId, hunkId) {
  try {
    const dir = await opfsDir();
    if (!dir) return;
    await dir.removeEntry(draftKey(proposalId, hunkId));
  } catch { /* ignore */ }
}
