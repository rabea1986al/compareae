const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_DOMAIN = 'compareae.com';
const BASE_URL = `https://${BASE_DOMAIN}`;
const GLOBAL_NOINDEX = process.env.GLOBAL_NOINDEX === 'true';

const LOG_FILE = path.join(__dirname, 'clicks.log');
const PAGES_DIR = path.join(__dirname, 'pages');

// RENDER SAFE PROXY HANDLING
app.enable('trust proxy');

// SECURITY + PERFORMANCE
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));

// RATE LIMITING
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// BODY PARSING (for /track endpoint)
app.use(express.json({ limit: '10kb' }));

// STATIC ASSETS
app.use(express.static(path.join(__dirname, 'public')));

// SERVE sitemap.xml & robots.txt from root
app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    res.setHeader('Content-Type', 'application/xml');
    return res.sendFile(sitemapPath);
  }
  res.status(404).send('Sitemap not generated yet.');
});

app.get('/robots.txt', (req, res) => {
  const robotsPath = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.s