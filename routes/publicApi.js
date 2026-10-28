const express = require('express');
const rateLimit = require('express-rate-limit');
const File = require('../models/File');

const router = express.Router();
const TOKEN_RE = /^[a-f0-9]{64}$/;

router.use(rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests.', code: 'unavailable' },
}));

const UNAVAILABLE = { error: 'This link is no longer available.', code: 'unavailable' };

// GET /api/public/:token  -> info for the recipient page. Does NOT count as a download.
router.get('/:token', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { token } = req.params;
    if (!TOKEN_RE.test(token)) return res.status(404).json(UNAVAILABLE);

    const f = await File.findOne({ token });
    if (!f) return res.status(404).json(UNAVAILABLE);
    if (f.status === 'revoked') return res.status(410).json({ error: 'Revoked.', code: 'revoked' });
    if (f.status === 'consumed') return res.status(410).json({ error: 'Limit reached.', code: 'consumed' });

    // Server-side expiry check; expired and not-found look identical on purpose
    if (f.status !== 'active' || f.expiresAt <= new Date()) return res.status(404).json(UNAVAILABLE);
    if (f.maxDownloads > 0 && f.downloadCount >= f.maxDownloads) {
      return res.status(410).json({ error: 'Limit reached.', code: 'consumed' });
    }

    res.json({
      file: {
        originalName: f.originalName,
        size: f.size,
        createdAt: f.createdAt,
        expiresAt: f.expiresAt,
        maxDownloads: f.maxDownloads,
        downloadCount: f.downloadCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.', code: 'error' });
  }
});

module.exports = router;
