const fs = require('fs');
const cron = require('node-cron');
const File = require('../models/File');
const { deleteFromDisk } = require('./storage');
const { UPLOAD_DIR, CLEANUP_CRON } = require('../config');

/** 1) Active files whose time ran out: mark expired and purge from disk. */
async function purgeExpired() {
  const expired = await File.find({ status: 'active', expiresAt: { $lte: new Date() } });
  for (const f of expired) {
    await deleteFromDisk(f.storedName);
    f.status = 'expired';
    f.purgedAt = new Date();
    await f.save();
  }
  return expired.length;
}

/** 2) Safety net: non-active records whose disk file was never removed. */
async function purgeLeftovers() {
  const leftovers = await File.find({ status: { $ne: 'active' }, purgedAt: null });
  for (const f of leftovers) {
    if (await deleteFromDisk(f.storedName)) {
      f.purgedAt = new Date();
      await f.save();
    }
  }
}

/** 3) Orphans: disk files with no matching DB record (e.g. crash during upload). */
async function purgeOrphans() {
  const names = await fs.promises.readdir(UPLOAD_DIR);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const name of names) {
    if (name === '.gitkeep') continue;
    const full = `${UPLOAD_DIR}/${name}`;
    const stat = await fs.promises.stat(full);
    if (!stat.isFile() || stat.mtimeMs > oneHourAgo) continue;
    const record = await File.exists({ storedName: name, status: 'active' });
    if (!record) await deleteFromDisk(name);
  }
}

async function runCleanup() {
  try {
    const n = await purgeExpired();
    await purgeLeftovers();
    await purgeOrphans();
    if (n) console.log(`[cleanup] expired and purged ${n} file(s)`);
  } catch (err) {
    console.error('[cleanup] error:', err.message);
  }
}

function startCleanupJob() {
  runCleanup(); // run once on boot
  cron.schedule(CLEANUP_CRON, runCleanup);
  console.log('[cleanup] background job scheduled:', CLEANUP_CRON);
}

module.exports = { startCleanupJob, runCleanup };
