const { CORS_ORIGIN } = require('../config');

// Tiny CORS handler (no extra dependency). The API uses Bearer tokens, not cookies,
// so it is safe to answer cross-origin requests.
module.exports = function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && (CORS_ORIGIN === '*' || CORS_ORIGIN.split(',').map((s) => s.trim()).includes(origin))) {
    res.set('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
