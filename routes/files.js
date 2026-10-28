const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const File = require('../models/File');
const requireAuth = require('../middleware/auth');
const uploadMiddleware = require('../middleware/upload');
const { verifyMagicBytes, sanitizeFilename } = require('../utils/fileValidator');
const { diskPath, deleteFromDisk } = require('../utils/storage');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

async function usedBytes(ownerId) {
  const result = await File.aggregate([
    { $match: { ownerId: new mongoose.Types.ObjectId(ownerId), status: 'active' } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  return result.length ? result[0].total : 0;
}

/** The shareable link. It is generated on the server so it always points at a real, reachable page. */
function buildLink(token) {
  return `${config.FRONTEND_URL}/download.html?t=${token}`;
}

function toDto(f) {
  return {
    id: f._id,
    token: f.token,
    originalName: f.originalName,
    size: f.size,
    status: f.status,
    expiresAt: f.expiresAt,
    maxDownloads: f.maxDownloads,
    downloadCount: f.downloadCount,
    lastDownloadedAt: f.lastDownloadedAt,
    createdAt: f.createdAt,
    link: f.status === 'active' ? buildLink(f.token) : null,
  };
}

// POST /api/files  (multipart: file, expiresInMinutes, maxDownloads)
router.post('/', (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File is too large. Maximum size is ${config.MAX_FILE_SIZE / 1024 / 1024} MB.` });
    }
    if (err.code === 'INVALID_FILE_TYPE') return res.status(415).json({ error: err.message });
    console.error(err);
    return res.status(400).json({ error: 'Upload failed.' });
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a file to upload.' });

  // Helper: reject and remove the file that multer already wrote
  const reject = async (status, error) => {
    await deleteFromDisk(file.filename);
    return res.status(status).json({ error });
  };

  try {
    // 1. Validate expiry (server-side, never trust the client)
    let expiresInMinutes = parseInt(req.body.expiresInMinutes, 10);
    if (Number.isNaN(expiresInMinutes)) expiresInMinutes = config.DEFAULT_EXPIRY_MINUTES;
    if (expiresInMinutes < 1 || expiresInMinutes > config.MAX_EXPIRY_MINUTES) {
      return reject(400, 'Expiry must be between 1 minute and 7 days.');
    }

    // 2. Validate download limit (0 or empty = unlimited until expiry)
    let maxDownloads = parseInt(req.body.maxDownloads, 10);
    if (Number.isNaN(maxDownloads)) maxDownloads = 0;
    if (maxDownloads < 0 || maxDownloads > config.MAX_DOWNLOADS_LIMIT) {
      return reject(400, `Download limit must be between 1 and ${config.MAX_DOWNLOADS_LIMIT}.`);
    }

    // 3. Magic-byte check: the content must really match the extension
    const originalName = sanitizeFilename(file.originalname);
    const genuine = await verifyMagicBytes(diskPath(file.filename), originalName);
    if (!genuine) return reject(415, 'The file content does not match its type, or it is not allowed.');

    // 4. Storage quota
    const used = await usedBytes(req.user.id);
    if (used + file.size > config.USER_QUOTA) {
      const left = Math.max(config.USER_QUOTA - used, 0);
      return reject(413, `Storage quota exceeded. You have ${(left / 1024 / 1024).toFixed(1)} MB left of ${config.USER_QUOTA / 1024 / 1024} MB.`);
    }

    // 5. Save the record with an unguessable token
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    console.log('DB:', mongoose.connection.name);
    console.log('Saving file metadata...');
    const record = await File.create({
      token,
      ownerId: req.user.id,
      originalName,
      storedName: file.filename,
      size: file.size,
      mimeType: file.mimetype,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      maxDownloads,
    });
    console.log('SAVED FILE:', record._id);
    res.status(201).json({ file: toDto(record) });
  } catch (err) {
    console.error(err);
    await deleteFromDisk(file.filename);
    res.status(500).json({ error: 'Could not save the file.' });
  }
});

// GET /api/files  -> owner's files + quota usage + stats
router.get('/', async (req, res) => {
  try {
    const files = await File.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).limit(200);
    const used = await usedBytes(req.user.id);
    res.json({
      files: files.map(toDto),
      quota: { used, total: config.USER_QUOTA, maxFileSize: config.MAX_FILE_SIZE },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your files.' });
  }
});

// POST /api/files/:id/revoke  -> kill the link now, keep the record for stats
router.post('/:id/revoke', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'File not found.' });

    // Only the owner can revoke, and only active files
    const file = await File.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id, status: 'active' },
      { $set: { status: 'revoked' } },
      { new: true }
    );
    if (!file) return res.status(404).json({ error: 'File not found or already inactive.' });

    await deleteFromDisk(file.storedName);   // immediate purge
    file.purgedAt = new Date();
    await file.save();
    res.json({ file: toDto(file) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not revoke the link.' });
  }
});

// DELETE /api/files/:id  -> delete record AND disk file
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'File not found.' });

    const file = await File.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!file) return res.status(404).json({ error: 'File not found.' });

    await deleteFromDisk(file.storedName);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete the file.' });
  }
});

module.exports = router;
