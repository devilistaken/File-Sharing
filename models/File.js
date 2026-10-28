const mongoose = require('mongoose');

/**
 * File lifecycle:
 *   active  -> consumed (download limit reached)
 *   active  -> expired  (time ran out)
 *   active  -> revoked  (owner revoked)
 * In every non-active state the disk file is purged.
 */
const fileSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },   // random name on disk
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },

  expiresAt: { type: Date, required: true, index: true },
  maxDownloads: { type: Number, default: 0 },      // 0 = unlimited (until expiry)
  downloadCount: { type: Number, default: 0 },
  lastDownloadedAt: { type: Date, default: null },

  status: {
    type: String,
    enum: ['active', 'consumed', 'expired', 'revoked'],
    default: 'active',
    index: true,
  },
  purgedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('File', fileSchema);
