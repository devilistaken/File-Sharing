const multer = require('multer');
const crypto = require('crypto');
const { UPLOAD_DIR, MAX_FILE_SIZE } = require('../config');
const { checkNameAndMime } = require('../utils/fileValidator');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // Random name, no extension: the original name is never used on disk
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const result = checkNameAndMime(file.originalname, file.mimetype);
    if (!result.ok) {
      const err = new Error(result.reason);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = upload.single('file');
