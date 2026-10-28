require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const config = require('./config');
const cors = require('./middleware/cors');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const publicRoutes = require('./routes/public');
const publicApiRoutes = require('./routes/publicApi');
const { startCleanupJob } = require('./utils/cleanup');
const { errorPage } = require('./utils/pages');

const app = express();
app.use(cookieParser());
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

app.set('trust proxy', 1); // correct client IPs behind ngrok / a hosting proxy
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors);
app.use(express.json({ limit: '10kb' }));

// The website (landing, dashboard, download page) is served from /public
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/public', publicApiRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// File download + old-style links
app.use('/d', publicRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  const page = errorPage('unavailable');
  res.status(page.status).send(page.html);
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Server error.' });
  const page = errorPage('server');
  res.status(page.status).send(page.html);
});

mongoose
  .connect(config.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('MongoDB connected');
    app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`Website + API running at ${config.BASE_URL}`);
      console.log(`Links will look like: ${config.FRONTEND_URL}/download.html?t=...`);
    });
    startCleanupJob();
  })
  .catch((err) => {
    console.error('\nMongoDB connection failed:', err.message);
    console.error('Start MongoDB, or put a MongoDB Atlas connection string in MONGO_URI inside .env\n');
    process.exit(1);
  });
