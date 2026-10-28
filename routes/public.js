const express = require('express');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const File = require('../models/File');
const { errorPage } = require('../utils/pages');
const { FRONTEND_URL } = require('../config');
const { diskPath, deleteFromDisk } = require('../utils/storage');

const router = express.Router();

const TOKEN_RE = /^[a-f0-9]{64}$/;

// Slows down anyone trying to guess tokens
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const p = errorPage('server');
    res.status(429).send(p.html);
  },
});

router.use(publicLimiter);

function sendError(res, kind) {
  const page = errorPage(kind);
  res.set('Cache-Control', 'no-store');
  return res.status(page.status).send(page.html);
}

/** Decide which error page applies to a token that cannot be downloaded. */
async function explainFailure(token) {
  if (!TOKEN_RE.test(token)) return 'unavailable';
  const file = await File.findOne({ token });
  if (!file) return 'unavailable';
  if (file.status === 'revoked') return 'revoked';
  if (file.status === 'consumed') return 'consumed';
  return 'unavailable'; // expired (or about to be purged) looks the same as not found
}

// GET /d/:token  -> old-style link; send the visitor to the recipient page
router.get('/:token', (req, res) => {
  const { token } = req.params;
  if (!TOKEN_RE.test(token)) return sendError(res, 'unavailable');
  res.redirect(`${FRONTEND_URL}/download.html?t=${token}`);
});

// GET /d/:token/download  -> the real download (atomic counter)
router.get('/:token/download', async (req, res) => {
  try {
    const { token } = req.params;
    if (!TOKEN_RE.test(token)) return sendError(res, 'unavailable');

    /**
     * ATOMIC: find + check + increment in ONE database operation.
     * If two requests race for the last download, only one matches the filter.
     */
    const file = await File.findOneAndUpdate(
      {
        token,
        status: 'active',
        expiresAt: { $gt: new Date() },
        $expr: {
          $or: [
            { $eq: ['$maxDownloads', 0] },
            { $lt: ['$downloadCount', '$maxDownloads'] },
          ],
        },
      },
      { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } },
      { new: true }
    );

    if (!file) return sendError(res, await explainFailure(token));

    const path = diskPath(file.storedName);
    let stat;
    try {
      stat = await fs.promises.stat(path);
    } catch (e) {
      // Disk file vanished: close the record so the link dies cleanly
      await File.updateOne({ _id: file._id }, { $set: { status: 'expired', purgedAt: new Date() } });
      return sendError(res, 'unavailable');
    }

    const limitReached = file.maxDownloads > 0 && file.downloadCount >= file.maxDownloads;

    // Safe headers: always a download, never rendered/executed by the browser
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.attachment(file.originalName); // sets Content-Disposition: attachment; filename=...

    const stream = fs.createReadStream(path);
    stream.on('error', (err) => {
      console.error('stream error', err.message);
      if (!res.headersSent) sendError(res, 'server'); else res.destroy();
    });

    // Purge immediately once the response is finished (or the connection closes)
    res.on('close', async () => {
      if (limitReached) {
        await deleteFromDisk(file.storedName);
        await File.updateOne(
          { _id: file._id, status: 'active' },
          { $set: { status: 'consumed', purgedAt: new Date() } }
        );
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error(err);
    sendError(res, 'server');
  }
});

module.exports = router;
