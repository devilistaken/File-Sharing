const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../config');

// path.basename prevents any path traversal even if a DB value is tampered with
function diskPath(storedName) {
  return path.join(UPLOAD_DIR, path.basename(storedName));
}

async function deleteFromDisk(storedName) {
  try {
    await fs.promises.unlink(diskPath(storedName));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return true; // already gone
    console.error('Failed to delete file from disk:', err.message);
    return false;
  }
}

module.exports = { diskPath, deleteFromDisk };
