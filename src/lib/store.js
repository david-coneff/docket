// store.js — central app state with a tiny pub/sub, localStorage-backed
// preferences, and OPFS-backed persistence of unsaved Edit-tab content.

const PREFS_KEY = 'docket.prefs.v1';

const DEFAULT_PREFS = {
  commitMode: 'batch',
  sortMode: 'manual',
  sortTag: null,
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
  taxonomySource: 'default',
  proposals: [],
  manualOrder: [],
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

  updateActiveHunk(patch) {
    const h = this.activeHunk();
    if (!h) return;
    Object.assign(h, patch);
    this.emit();
  },
};

async function opfsDir() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('docket-drafts', { create: true });
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
