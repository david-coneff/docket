// store.js — central app state with pub/sub, OPFS-backed storage, session persistence.
import * as S from './storage.js';

const DEFAULT_PREFS = {
  commitMode: 'batch',
  sortMode: 'manual',
  sortTag: null,
  workingDirName: null,
};

function loadPrefs() {
  try {
    const raw = S.getItem('dkt:prefs') || S.getItem('rhiz-review.prefs.v1');
    return { ...DEFAULT_PREFS, ...JSON.parse(raw || '{}') };
  } catch { return { ...DEFAULT_PREFS }; }
}

function loadSession() {
  try {
    return {
      activeProposalId: S.getItem('dkt:session.proposalId') || null,
      activeFileIndex: parseInt(S.getItem('dkt:session.fileIndex') || '0', 10),
      manualOrder: JSON.parse(S.getItem('dkt:session.manualOrder') || '[]'),
    };
  } catch { return { activeProposalId: null, activeFileIndex: 0, manualOrder: [] }; }
}

const _session = loadSession();

export const store = {
  prefs: loadPrefs(),
  dirHandle: null,
  pendingDirHandle: null,
  taxonomy: null,
  taxonomySource: 'default',
  proposals: [],
  manualOrder: _session.manualOrder,
  activeProposalId: _session.activeProposalId,
  activeFileIndex: _session.activeFileIndex,
  selectedProposalIds: new Set(),
  disposedProposalIds: new Set(),
  _subs: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit() {
    for (const fn of this._subs) fn(this);
    try {
      S.setItem('dkt:session.proposalId', this.activeProposalId || '');
      S.setItem('dkt:session.fileIndex', String(this.activeFileIndex));
      S.setItem('dkt:session.manualOrder', JSON.stringify(this.manualOrder));
    } catch {}
  },

  savePrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    S.setItem('dkt:prefs', JSON.stringify(this.prefs));
    this.emit();
  },

  setProposals(list) {
    this.proposals = list;
    const ids = list.map((p) => p.data?.id).filter(Boolean);
    this.manualOrder = [
      ...this.manualOrder.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !this.manualOrder.includes(id)),
    ];
    if (!this.activeProposalId || !ids.includes(this.activeProposalId)) {
      this.activeProposalId = ids[0] || null;
      this.activeFileIndex = 0;
    }
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

  clearSelection() { this.selectedProposalIds.clear(); this.emit(); },
};

// ---------------------------------------------------------------------------
// OPFS persistence of unsaved Edit-tab content.
// ---------------------------------------------------------------------------
async function opfsDir() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('dkt-drafts', { create: true });
}

function draftKey(proposalId, fileId) { return `${proposalId}__${fileId}.draft`; }

export async function saveDraft(proposalId, fileId, content) {
  try {
    const dir = await opfsDir(); if (!dir) return;
    const fh = await dir.getFileHandle(draftKey(proposalId, fileId), { create: true });
    const w = await fh.createWritable(); await w.write(content); await w.close();
  } catch {}
}

export async function loadDraft(proposalId, fileId) {
  try {
    const dir = await opfsDir(); if (!dir) return null;
    const fh = await dir.getFileHandle(draftKey(proposalId, fileId), { create: false });
    return await (await fh.getFile()).text();
  } catch { return null; }
}

export async function clearDraft(proposalId, fileId) {
  try {
    const dir = await opfsDir(); if (!dir) return;
    await dir.removeEntry(draftKey(proposalId, fileId));
  } catch {}
}
