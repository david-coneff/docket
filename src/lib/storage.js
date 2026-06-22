// storage.js — synchronous key/value store with OPFS durability mirror.
// Adapted from tessel's StorageEngine. Key convention: 'dkt:*'.
//
// localStorage is the synchronous source of truth so getItem() returns
// persisted values immediately at module load (no top-level await, which the
// single-file build target rejects and which would block the whole module
// graph). OPFS is a best-effort async write-through mirror: it hydrates any
// keys missing from localStorage on startup (e.g. localStorage was cleared but
// OPFS survived) and receives a debounced copy of every write for durability.

var _cache = new Map();
var _opfsRoot = null;
var _useOpfs = false;
var _saveTimer = null;

function _isOpfsAvailable() {
  return typeof navigator !== 'undefined'
    && navigator.storage
    && typeof navigator.storage.getDirectory === 'function'
    && location.protocol !== 'file:';
}

// --- Synchronous seed from localStorage (runs at import, no await) ----------
function _seedFromLocalStorage() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('dkt:')) {
        const v = localStorage.getItem(k);
        if (v !== null) _cache.set(k, v);
      } else if (k.startsWith('rhiz-review.')) {
        // Migrate legacy keys into the cache (kept in localStorage mirror too).
        const v = localStorage.getItem(k);
        if (v !== null) _cache.set(k, v);
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}
_seedFromLocalStorage();

// --- OPFS durability mirror (async, non-blocking) ---------------------------
async function _opfsLoad() {
  try {
    const fh = await _opfsRoot.getFileHandle('dkt-state.json');
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}

async function _flushToDisk() {
  _saveTimer = null;
  if (!_useOpfs || !_opfsRoot) return;
  try {
    const data = JSON.stringify(Object.fromEntries(_cache));
    const fh = await _opfsRoot.getFileHandle('dkt-state.json', { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
  } catch {}
}

function _scheduleSave() {
  if (!_useOpfs) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flushToDisk, 300);
}

// Hydrate from OPFS in the background. Keys absent from the synchronous
// localStorage seed are recovered (and mirrored back to localStorage so future
// loads see them synchronously). Resolves when hydration is complete.
export const ready = (async () => {
  if (!_isOpfsAvailable()) return;
  try {
    _opfsRoot = await navigator.storage.getDirectory();
    _useOpfs = true;
    const obj = await _opfsLoad();
    if (obj) {
      for (const k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        if (!_cache.has(k)) {
          _cache.set(k, obj[k]);
          try { localStorage.setItem(k, String(obj[k])); } catch {}
        }
      }
    }
    // Persist the merged state (covers first-run and migrated legacy keys).
    _scheduleSave();
  } catch { _useOpfs = false; }
})();

// --- Public API (synchronous) -----------------------------------------------
export function getItem(key) {
  if (_cache.has(key)) return _cache.get(key);
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setItem(key, value) {
  const v = String(value);
  _cache.set(key, v);
  try { localStorage.setItem(key, v); } catch {}
  _scheduleSave();
}

export function removeItem(key) {
  _cache.delete(key);
  try { localStorage.removeItem(key); } catch {}
  _scheduleSave();
}

export function getKeys(prefix) {
  const result = [];
  _cache.forEach((_, k) => { if (!prefix || k.startsWith(prefix)) result.push(k); });
  return result;
}

export function isOpfs() { return _useOpfs; }
