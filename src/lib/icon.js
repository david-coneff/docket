// icon.js — Lucide SVG icon factory. Adapted from tessel's icon.js.
import {
  FolderOpen, Folder, RotateCcw, X, Check, ChevronDown, ChevronUp, ChevronRight,
  ChevronLeft, Trash2, Eye, EyeOff, Moon, Sun, Palette, FileText, Settings2,
  Plus, Minus, AlertTriangle, CheckCircle2, XCircle, Clock, Tag, MessageSquare,
  Pencil, ThumbsUp, ThumbsDown, SkipForward, ListChecks, Layers,
} from 'lucide';

const SVG_NS = 'http://www.w3.org/2000/svg';

const REGISTRY = {
  'folder': FolderOpen, 'folder-closed': Folder, 'reload': RotateCcw,
  'x': X, 'check': Check,
  'chevron-down': ChevronDown, 'chevron-up': ChevronUp,
  'chevron-right': ChevronRight, 'chevron-left': ChevronLeft,
  'trash': Trash2, 'eye': Eye, 'eye-off': EyeOff,
  'moon': Moon, 'sun': Sun, 'palette': Palette,
  'file-text': FileText, 'settings': Settings2,
  'plus': Plus, 'minus': Minus,
  'warning': AlertTriangle, 'check-circle': CheckCircle2, 'x-circle': XCircle,
  'clock': Clock, 'tag': Tag, 'message': MessageSquare,
  'edit': Pencil, 'approve': ThumbsUp, 'reject': ThumbsDown,
  'skip': SkipForward, 'list-checks': ListChecks, 'layers': Layers,
};

// Lucide named exports may be either a flat list of child nodes
// (`[[tag, attrs], ...]`) or a full node (`[tag, attrs, children]`). Normalize
// to a flat list of [tag, attrs] child pairs, ignoring a wrapping 'svg' node.
function childNodes(iconData) {
  if (!Array.isArray(iconData)) return [];
  // Full node form: ['svg', attrs, [children...]]
  if (typeof iconData[0] === 'string' && Array.isArray(iconData[2])) {
    return iconData[2];
  }
  return iconData;
}

function buildSvg(iconData, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const node of childNodes(iconData)) {
    if (!Array.isArray(node)) continue;
    const [tag, attrs] = node;
    if (typeof tag !== 'string') continue;
    const elem = document.createElementNS(SVG_NS, tag);
    if (attrs && typeof attrs === 'object') {
      for (const [k, v] of Object.entries(attrs)) elem.setAttribute(k, String(v));
    }
    svg.appendChild(elem);
  }
  return svg;
}

export function icon(name, size = 16) {
  const data = REGISTRY[name];
  if (data) {
    try {
      const svg = buildSvg(data, size);
      if (svg.childNodes.length) return svg;
    } catch (err) {
      console.warn(`[docket] icon("${name}") failed to build:`, err);
    }
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '12'); text.setAttribute('y', '16');
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '14');
  text.setAttribute('fill', 'currentColor'); text.textContent = name;
  svg.appendChild(text);
  return svg;
}
