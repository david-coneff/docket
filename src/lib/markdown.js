// markdown.js — intentionally minimal Markdown→HTML for the Composed preview.
// Covers headings, bold/italic, inline code, fenced code, links, hr, and
// unordered lists. Not a full CommonMark implementation; the Review-mode diff
// (not this) is the authoritative view of changes.

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let inCode = false;
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCode) { closeList(); out.push('<pre><code>'); inCode = true; }
      else { out.push('</code></pre>'); inCode = false; }
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^(\s*[-*]\s+)/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\s*---\s*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    if (line.trim() === '') { closeList(); out.push(''); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push('</code></pre>');
  closeList();
  return out.join('\n');
}
