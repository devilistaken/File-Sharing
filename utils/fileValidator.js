const fs = require('fs');
const path = require('path');

/**
 * Allowlist approach. A file is accepted only if:
 *   1. its extension is allowed,
 *   2. its client-declared MIME type is allowed,
 *   3. its real content (magic bytes) matches the extension.
 * HTML, SVG, JS, etc. are never on the list (prevents stored XSS / script execution).
 */
const ALLOWED = {
  '.png':  { mimes: ['image/png'], kind: 'png' },
  '.jpg':  { mimes: ['image/jpeg'], kind: 'jpg' },
  '.jpeg': { mimes: ['image/jpeg'], kind: 'jpg' },
  '.gif':  { mimes: ['image/gif'], kind: 'gif' },
  '.pdf':  { mimes: ['application/pdf'], kind: 'pdf' },
  '.txt':  { mimes: ['text/plain'], kind: 'text' },
  '.zip':  { mimes: ['application/zip', 'application/x-zip-compressed'], kind: 'zip' },
  '.docx': { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], kind: 'zip' },
  '.xlsx': { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], kind: 'zip' },
  '.pptx': { mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], kind: 'zip' },
};

const BLOCKED_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.svg', '.js', '.mjs', '.exe', '.bat', '.cmd',
  '.sh', '.php', '.jsp', '.asp', '.aspx', '.msi', '.dll', '.jar', '.vbs', '.ps1',
]);

function getExtension(name) {
  return path.extname(name || '').toLowerCase();
}

/** Quick check used by multer's fileFilter (before the file is written). */
function checkNameAndMime(originalName, mimeType) {
  const ext = getExtension(originalName);
  if (BLOCKED_EXTENSIONS.has(ext)) return { ok: false, reason: `Files of type ${ext} are not allowed.` };
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, reason: 'This file type is not allowed.' };
  if (!rule.mimes.includes(mimeType)) return { ok: false, reason: 'File type does not match its extension.' };
  return { ok: true };
}

function matchesSignature(kind, buf) {
  switch (kind) {
    case 'png': return buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg': return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'gif': return buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.slice(0, 6).toString('latin1'));
    case 'pdf': return buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-';
    case 'zip': return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && [0x03, 0x05].includes(buf[2]);
    case 'text': {
      if (buf.includes(0x00)) return false; // binary data is not plain text
      const head = buf.toString('utf8').trimStart().toLowerCase();
      // Plain text that is really HTML/SVG/script is rejected
      return !/^(<!doctype|<html|<svg|<script|<\?xml|<iframe|<body)/.test(head) && !/<script[\s>]/.test(head);
    }
    default: return false;
  }
}

/** Deep check on the saved file: reads the first bytes and verifies magic numbers. */
async function verifyMagicBytes(filePath, originalName) {
  const rule = ALLOWED[getExtension(originalName)];
  if (!rule) return false;

  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(2048);
    const { bytesRead } = await fd.read(buf, 0, 2048, 0);
    return matchesSignature(rule.kind, buf.slice(0, bytesRead));
  } finally {
    await fd.close();
  }
}

/** Remove path parts / control chars and limit length so the name is safe to store and display. */
function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return (base || 'file').slice(0, 150);
}

module.exports = { checkNameAndMime, verifyMagicBytes, sanitizeFilename, ALLOWED };
