// storage.js — OPFS-backed key/value store with localStorage fallback.
// Adapted from tessel's StorageEngine. Key convention: 'dkt:*'.
// Top-level await ensures cache is populated before any importing module runs.

var _cache = new Map();
var _useOpfs = false;
var _opfsRoot = null;
var _saveTimer = null;

function _isOpfsAvailable() {
  return typeof navigator !== 'undefined'
    && navigator.storage
    && typeof navigator.storage.getDirectory === 'function'
    && location.protocol !== 'file:';
}

async function _load() {
  try {
    const fh = await _opfsRoot.getFileHandle('dkt-state.json');
    const file = await fh.getFile();
    const obj = JSON.parse(await file.text());
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) _cache.set(k, obj[k]);
    }
    return true;
  } catch { return false; }
}

function _scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flushToDisk, 300);
}

async function _flushToDisk() {
  _saveTimer = null;
  try {
    const data = JSON.stringify(Object.fromEntries(_cache));
    const fh = await _opfsRoot.getFileHandle('dkt-state.json', { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
  } catch {}
}

function _migrate() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('rhiz-review.') || k.startsWith('dkt:'))) {
        const v = localStorage.getItem(k);
        if (v !== null) _cache.set(k, v);
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}

if (_isOpfsAvailable()) {
  try {
    _opfsRoot = await navigator.storage.getDirectory();
    _useOpfs = true;
    if (!await _load()) { _migrate(); await _flushToDisk(); }
  } catch { _useOpfs = false; }
}

export function getItem(key) {
  if (_useOpfs) return _cache.has(key) ? _cache.get(key) : null;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setItem(key, value) {
  if (_useOpfs) { _cache.set(key, String(value)); _scheduleSave(); return; }
  try { localStorage.setItem(key, String(value)); } catch {}
}

export function removeItem(key) {
  if (_useOpfs) { _cache.delete(key); _scheduleSave(); return; }
  try { localStorage.removeItem(key); } catch {}
}

export function getKeys(prefix) {
  const result = [];
  if (_useOpfs) {
    _cache.forEach((_, k) => { if (!prefix || k.startsWith(prefix)) result.push(k); });
  } else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (!prefix || k.startsWith(prefix))) result.push(k);
      }
    } catch {}
  }
  return result;
}

export const isOpfs = _useOpfs;
