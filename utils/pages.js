// Server-rendered pages for recipients (anonymous). Everything dynamic is HTML-escaped.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)} · One-Off Transfer</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body class="center-page">
  <main class="panel narrow">
    <p class="brand">One-Off Transfer</p>
    ${body}
  </main>
</body>
</html>`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function timeLeft(date) {
  const ms = new Date(date) - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.floor(h / 24)} days`;
}

const messages = {
  // Same page for "not found" and "expired" so nobody can probe which tokens exist.
  unavailable: {
    status: 404,
    title: 'Link unavailable',
    heading: 'This link is no longer available',
    text: 'It may have expired, been removed, or never existed. Ask the sender for a new link.',
  },
  revoked: {
    status: 410,
    title: 'Link revoked',
    heading: 'The sender revoked this link',
    text: 'The file was withdrawn and deleted. Ask the sender to share it again if you still need it.',
  },
  consumed: {
    status: 410,
    title: 'Download limit reached',
    heading: 'This file has already been downloaded',
    text: 'The sender set a download limit and it has been reached. The file has been permanently deleted.',
  },
  server: {
    status: 500,
    title: 'Something went wrong',
    heading: 'We could not complete that',
    text: 'Please try again in a moment.',
  },
};

function errorPage(kind) {
  const m = messages[kind] || messages.unavailable;
  return {
    status: m.status,
    html: layout(m.title, `<h1>${esc(m.heading)}</h1><p class="muted">${esc(m.text)}</p>`),
  };
}

function downloadPage(file) {
  const limitLine = file.maxDownloads > 0
    ? `<li>Downloads left: <strong>${file.maxDownloads - file.downloadCount}</strong></li>`
    : '';
  return layout('Download file', `
    <h1>${esc(file.originalName)}</h1>
    <ul class="facts">
      <li>Size: <strong>${formatSize(file.size)}</strong></li>
      <li>Available for: <strong>${esc(timeLeft(file.expiresAt))}</strong></li>
      ${limitLine}
    </ul>
    ${file.maxDownloads === 1 ? '<p class="warn">This link works once. The file is deleted right after you download it.</p>' : ''}
    <a class="btn" href="/d/${esc(file.token)}/download">Download file</a>
  `);
}

module.exports = { errorPage, downloadPage };
