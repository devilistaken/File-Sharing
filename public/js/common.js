/* Small helpers shared by every page */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return 'never';
  return new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeLeft(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > -1 ? name.slice(i + 1).toLowerCase() : 'file';
}

function extClass(ext) {
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'ext-img';
  if (['pdf'].includes(ext)) return 'ext-pdf';
  if (['zip'].includes(ext)) return 'ext-zip';
  return 'ext-doc';
}

function shareLink(token) {
  const url = new URL('download.html', location.href);
  url.search = '?t=' + token;
  return url.toString();
}

/* Toasts */
function toast(message, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = el('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = el('div', { class: `toast toast-${type}`, role: 'status', text: message });
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* Logo (inline SVG so there is nothing to load) */
function logo() {
  const wrap = el('a', { class: 'brand', href: 'index.html', 'aria-label': 'One-Off Transfer home' });
  wrap.innerHTML = `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1.5" y="1.5" width="31" height="31" rx="9" fill="#ff5a45" stroke="#17123a" stroke-width="2.5"/>
      <path d="M17 7c1 4.5 6 6.5 6 12a6 6 0 0 1-12 0c0-2.4 1.1-3.8 2.4-5 0 2.3 1.2 3.4 2.4 3.6C15.2 14 15.2 10.5 17 7z" fill="#fff"/>
    </svg><span>One-Off</span>`;
  return wrap;
}
document.addEventListener('DOMContentLoaded', () => {
  $$('[data-logo]').forEach((n) => n.replaceWith(logo()));
});
