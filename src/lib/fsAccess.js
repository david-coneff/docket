// fsAccess.js — File System Access API wrapper with graceful fallback.
// Dir handle persisted in IndexedDB so it can be restored across page reloads.

export const supportsFSAccess = typeof window !== 'undefined'
  && 'showDirectoryPicker' in window;

const PROPOSALS_SUBDIR = 'rhiz-proposals';

export async function pickWorkingDirectory() {
  if (!supportsFSAccess) return null;
  try {
    return await window.showDirectoryPicker({ id: 'rhiz-review-wd', mode: 'readwrite' });
  } catch { return null; }
}

async function getProposalsDir(dirHandle, create = false) {
  return dirHandle.getDirectoryHandle(PROPOSALS_SUBDIR, { create });
}

export async function readProposals(dirHandle) {
  const out = [];
  let pdir;
  try { pdir = await getProposalsDir(dirHandle, false); }
  catch { return out; }
  for await (const [name, handle] of pdir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.proposal.json')) {
      try {
        const file = await handle.getFile();
        out.push({ name, data: JSON.parse(await file.text()) });
      } catch (e) { out.push({ name, error: String(e) }); }
    }
  }
  return out;
}

export async function readProjectTaxonomy(dirHandle) {
  try {
    const pdir = await getProposalsDir(dirHandle, false);
    const fh = await pdir.getFileHandle('tag-taxonomy.md', { create: false });
    return await (await fh.getFile()).text();
  } catch { return null; }
}

export async function writeResolved(dirHandle, proposal) {
  const json = JSON.stringify(proposal, null, 2) + '\n';
  const filename = `${proposal.id}.resolved.json`;
  if (dirHandle) {
    const pdir = await getProposalsDir(dirHandle, true);
    const fh = await pdir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(json); await w.close();
    return { method: 'fs', path: `${PROPOSALS_SUBDIR}/${filename}` };
  }
  downloadBlob(json, filename, 'application/json');
  return { method: 'download', path: filename };
}

export function readFilesViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = '.json,.md';
    input.onchange = async () => {
      const out = [];
      for (const file of input.files) {
        const text = await file.text();
        if (file.name.endsWith('.proposal.json')) {
          try { out.push({ name: file.name, data: JSON.parse(text) }); }
          catch (e) { out.push({ name: file.name, error: String(e) }); }
        } else if (file.name === 'tag-taxonomy.md') {
          out.push({ name: file.name, taxonomy: text });
        }
      }
      resolve(out);
    };
    input.click();
  });
}

export function downloadBlob(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// IndexedDB persistence for FileSystemDirectoryHandle.
// Handles are structured-cloneable; only Chromium allows querying permission
// without a user gesture, so restoreDirectoryHandle() returns the handle
// directly if permission is already granted, or {handle, needsPermission:true}
// if the browser needs a user gesture before requestPermission() can succeed.
// ---------------------------------------------------------------------------

const IDB_NAME = 'docket';
const IDB_STORE = 'handles';
const IDB_KEY = 'dir-handle';

function _openIdb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = (e) => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveDirectoryHandle(handle) {
  try {
    const db = await _openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch {}
}

export async function restoreDirectoryHandle() {
  if (!supportsFSAccess) return null;
  try {
    const db = await _openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const handle = await new Promise((res) => {
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
    db.close();
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return handle;
    if (perm === 'prompt') return { handle, needsPermission: true };
    return null;
  } catch { return null; }
}
