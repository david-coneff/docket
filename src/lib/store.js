// store.js — central app state with a tiny pub/sub, localStorage-backed
// preferences, and OPFS-backed persistence of unsaved Edit-tab content.

const PREFS_KEY = 'rhiz-review.prefs.v1';

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
  activeFileIndex: 0,
  selectedProposalIds: new Set(),
  disposedProposalIds: new Set(),
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

  activeFile() {
    const p = this.activeProposal();
    return p ? (p.file_changes || [])[this.activeFileIndex] || null : null;
  },

  setActive(proposalId, fileIndex = 0) {
    this.activeProposalId = proposalId;
    this.activeFileIndex = fileIndex;
    this.emit();
  },

  setFileIndex(i) { this.activeFileIndex = i; this.emit(); },

  updateActiveFile(patch) {
    const fc = this.activeFile();
    if (!fc) return;
    Object.assign(fc, patch);
    this.emit();
  },

  toggleProposalSelect(id) {
    if (this.selectedProposalIds.has(id)) this.selectedProposalIds.delete(id);
    else this.selectedProposalIds.add(id);
    this.emit();
  },

  clearSelection() {
    this.selectedProposalIds.clear();
    this.emit();
  },
};

// ---------------------------------------------------------------------------
// OPFS persistence of unsaved Edit-tab content.
// Keyed by "<proposalId>::<fileId>".
// ---------------------------------------------------------------------------

async function opfsDir() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('rhiz-review-drafts', { create: true });
}

function draftKey(proposalId, fileId) {
  return `${proposalId}__${fileId}.draft`;
}

export async function saveDraft(proposalId, fileId, content) {
  try {
    const dir = await opfsDir();
    if (!dir) return;
    const fh = await dir.getFileHandle(draftKey(proposalId, fileId), { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  } catch { /* ignore */ }
}

export async function loadDraft(proposalId, fileId) {
  try {
    const dir = await opfsDir();
    if (!dir) return null;
    const fh = await dir.getFileHandle(draftKey(proposalId, fileId), { create: false });
    return await (await fh.getFile()).text();
  } catch { return null; }
}

export async function clearDraft(proposalId, fileId) {
  try {
    const dir = await opfsDir();
    if (!dir) return;
    await dir.removeEntry(draftKey(proposalId, fileId));
  } catch { /* ignore */ }
}
