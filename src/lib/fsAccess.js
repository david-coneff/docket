// fsAccess.js — File System Access API wrapper with a graceful fallback.
//
// docket §5: the user selects a working directory via the native picker
// (showDirectoryPicker). The handle is persisted across sessions where the
// browser supports IndexedDB-stored handles; the *name* is always persisted in
// localStorage so the UI can show the last-used folder. Resolved proposal JSON
// is written back to <dir>/rhiz-proposals/<id>.resolved.json automatically.
//
// When the API is unavailable (non-Chromium, or file:// context), we fall back
// to <input type=file multiple> for reading and Blob download for writing.

export const supportsFSAccess = typeof window !== 'undefined'
  && 'showDirectoryPicker' in window;

const PROPOSALS_SUBDIR = 'rhiz-proposals';

/** Prompt the user to pick a working directory. Returns a handle or null. */
export async function pickWorkingDirectory() {
  if (!supportsFSAccess) return null;
  try {
    return await window.showDirectoryPicker({ id: 'docket-wd', mode: 'readwrite' });
  } catch {
    return null; // user cancelled
  }
}

async function getProposalsDir(dirHandle, create = false) {
  return dirHandle.getDirectoryHandle(PROPOSALS_SUBDIR, { create });
}

/** Read all *.proposal.json files from <dir>/rhiz-proposals/. */
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
      } catch (e) {
        out.push({ name, error: String(e) });
      }
    }
  }
  return out;
}

/** Read a tag-taxonomy.md override from the proposals dir, or null. */
export async function readProjectTaxonomy(dirHandle) {
  try {
    const pdir = await getProposalsDir(dirHandle, false);
    const fh = await pdir.getFileHandle('tag-taxonomy.md', { create: false });
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

/** Write a resolved proposal back to <dir>/rhiz-proposals/<id>.resolved.json. */
export async function writeResolved(dirHandle, proposal) {
  const json = JSON.stringify(proposal, null, 2) + '\n';
  const filename = `${proposal.id}.resolved.json`;
  if (dirHandle) {
    const pdir = await getProposalsDir(dirHandle, true);
    const fh = await pdir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(json);
    await w.close();
    return { method: 'fs', path: `${PROPOSALS_SUBDIR}/${filename}` };
  }
  downloadBlob(json, filename, 'application/json');
  return { method: 'download', path: filename };
}

/** Fallback file reading via <input type=file>. */
export function readFilesViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.md';
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
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
