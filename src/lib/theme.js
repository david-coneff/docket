// theme.js — ThemeManager with A/B toggle pill. Adapted from tessel.
import * as S from './storage.js';

const THEMES = [
  { id: 'dark', name: 'Dark', vars: {
    '--bg': '#1a1b1e', '--surface': '#24262b', '--surface2': '#2d2f35',
    '--border': '#3a3c42', '--text': '#d4d4d4', '--muted': '#7a7d87',
    '--accent': '#5b8af0', '--accent-text': '#fff',
    '--field-bg': '#252a42', '--field-border': '#3d5299',
    '--ins-bg': '#12331c', '--ins-fg': '#3fb950',
    '--del-bg': '#3a1417', '--del-fg': '#f85149',
  }},
  { id: 'light', name: 'Light', vars: {
    '--bg': '#f0f0f2', '--surface': '#ffffff', '--surface2': '#e8e9ec',
    '--border': '#d0d2d8', '--text': '#1a1b1e', '--muted': '#6b7280',
    '--accent': '#2f6feb', '--accent-text': '#fff',
    '--field-bg': '#eef2ff', '--field-border': '#c7d2fe',
    '--ins-bg': '#e3f7e8', '--ins-fg': '#1a7f37',
    '--del-bg': '#fceaea', '--del-fg': '#b22222',
  }},
  { id: 'nord', name: 'Nord', vars: {
    '--bg': '#2e3440', '--surface': '#3b4252', '--surface2': '#434c5e',
    '--border': '#4c566a', '--text': '#eceff4', '--muted': '#7b88a1',
    '--accent': '#88c0d0', '--accent-text': '#1a1b1e',
    '--field-bg': '#3b4f6b', '--field-border': '#5e81ac',
    '--ins-bg': '#1a3a2a', '--ins-fg': '#a3be8c',
    '--del-bg': '#3a1a1a', '--del-fg': '#bf616a',
  }},
  { id: 'warm-light', name: 'Warm Light', vars: {
    '--bg': '#faf8f3', '--surface': '#fffefb', '--surface2': '#f0ece3',
    '--border': '#ddd8cc', '--text': '#2c2416', '--muted': '#8a7d68',
    '--accent': '#c07c3a', '--accent-text': '#fff',
    '--field-bg': '#fef3e2', '--field-border': '#e0c090',
    '--ins-bg': '#e8f5e0', '--ins-fg': '#5a7a3a',
    '--del-bg': '#fceaea', '--del-fg': '#8b3a3a',
  }},
  { id: 'high-contrast', name: 'High Contrast', vars: {
    '--bg': '#000000', '--surface': '#0d0d0d', '--surface2': '#1a1a1a',
    '--border': '#777777', '--text': '#ffffff', '--muted': '#cccccc',
    '--accent': '#ffff00', '--accent-text': '#000000',
    '--field-bg': '#001a33', '--field-border': '#4499ff',
    '--ins-bg': '#003300', '--ins-fg': '#00ff00',
    '--del-bg': '#330000', '--del-fg': '#ff4444',
  }},
];

export function getThemes() { return THEMES; }
export function getThemeById(id) { return THEMES.find((t) => t.id === id) || null; }

function isLight(hex) {
  if (!hex || hex[0] !== '#') return false;
  const h = hex.slice(1).padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35;
}

const _cbs = [];
export function onThemeChange(cb) { _cbs.push(cb); }

export function applyTheme(themeId) {
  const theme = getThemeById(themeId) || getThemeById('dark');
  const vars = theme.vars;
  const css = ':root {\n' + Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}';
  let styleEl = document.getElementById('dkt-theme-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dkt-theme-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
  document.body.classList.toggle('light', isLight(vars['--bg']));
  S.setItem('dkt:active-theme', theme.id);
  _cbs.forEach((cb) => { try { cb(theme.id); } catch {} });
  _updatePill();
}

function _updatePill() {
  const pillA = document.getElementById('dkt-pill-a');
  const pillB = document.getElementById('dkt-pill-b');
  if (!pillA || !pillB) return;
  const slot = S.getItem('dkt:active-slot') || 'a';
  pillA.classList.toggle('active', slot === 'a');
  pillB.classList.toggle('active', slot === 'b');
  const slider = document.getElementById('dkt-pill-slider');
  if (slider) {
    const active = slot === 'a' ? pillA : pillB;
    slider.style.left = active.offsetLeft + 'px';
    slider.style.width = active.offsetWidth + 'px';
  }
}

export function renderThemePill() {
  const wrap = document.createElement('div');
  wrap.className = 'theme-pill';
  const slider = document.createElement('div');
  slider.id = 'dkt-pill-slider'; slider.className = 'theme-pill-slider';
  const btnA = document.createElement('button');
  btnA.id = 'dkt-pill-a'; btnA.className = 'theme-pill-btn';
  const btnB = document.createElement('button');
  btnB.id = 'dkt-pill-b'; btnB.className = 'theme-pill-btn';

  const tA = getThemeById(S.getItem('dkt:theme-a') || 'dark');
  const tB = getThemeById(S.getItem('dkt:theme-b') || 'light');
  btnA.textContent = (tA?.name || 'A').slice(0, 1);
  btnA.title = tA?.name || 'Theme A';
  btnB.textContent = (tB?.name || 'B').slice(0, 1);
  btnB.title = tB?.name || 'Theme B';

  wrap.append(slider, btnA, btnB);
  btnA.addEventListener('click', () => {
    S.setItem('dkt:active-slot', 'a');
    applyTheme(S.getItem('dkt:theme-a') || 'dark');
  });
  btnB.addEventListener('click', () => {
    S.setItem('dkt:active-slot', 'b');
    applyTheme(S.getItem('dkt:theme-b') || 'light');
  });
  setTimeout(_updatePill, 0);
  return wrap;
}

export function initTheme() {
  if (!S.getItem('dkt:theme-a')) S.setItem('dkt:theme-a', 'dark');
  if (!S.getItem('dkt:theme-b')) S.setItem('dkt:theme-b', 'light');
  if (!S.getItem('dkt:active-slot')) S.setItem('dkt:active-slot', 'a');
  const slot = S.getItem('dkt:active-slot') || 'a';
  const themeId = S.getItem('dkt:theme-' + slot) || (slot === 'b' ? 'light' : 'dark');
  applyTheme(themeId);
}
