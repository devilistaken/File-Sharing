const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/one_off_transfer',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // Public address of THIS server. Used to build the links the owner shares.
  // For sharing outside your laptop, set it to your LAN IP, ngrok URL, or deployed URL.
  BASE_URL: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  // Where the recipient page (download.html) lives. Same server by default.
  FRONTEND_URL: (process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  // Which website origins may call the API from a browser ('*' = any).
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  UPLOAD_DIR: path.join(__dirname, 'uploads'),

  MAX_FILE_SIZE: 10 * 1024 * 1024,        // 10 MB per file
  USER_QUOTA: 50 * 1024 * 1024,           // 50 MB total of ACTIVE files per owner

  DEFAULT_EXPIRY_MINUTES: 60,             // 1 hour default
  MAX_EXPIRY_MINUTES: 7 * 24 * 60,        // 7 days max
  MAX_DOWNLOADS_LIMIT: 100,               // upper bound for the download limit

  CLEANUP_CRON: '* * * * *',              // every minute
};
