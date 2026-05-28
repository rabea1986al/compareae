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

// BODY PARSING
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
    return res.sendFile(robotsPath);
  }
  res.status(404).send('Not Found');
});

// COMPLIANCE HEADERS
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

// BLOCK SENSITIVE EXTENSIONS
app.use((req, res, next) => {
  const blockedExtensions = ['.log', '.tmp', '.json'];
  const isBlocked = blockedExtensions.some(ext => req.path.endsWith(ext));
  if (isBlocked) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.status(404).send('Not Found');
  }
  next();
});

// CANONICAL ENFORCER
app.use((req, res, next) => {
  const host = req.headers['x-forwarded-host'] || req.get('host');
  let normalizedPath = req.originalUrl.split('?')[0];
  normalizedPath = normalizedPath.replace(/\/{2,}/g, '/').toLowerCase();
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  const cleanRequestPath = req.path.replace(/\/{2,}/g, '/').toLowerCase();
  const isWww = /^www\./i.test(host);
  const shouldRedirect = isWww || cleanRequestPath !== normalizedPath;
  if (shouldRedirect) {
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(301, `https://${BASE_DOMAIN}${normalizedPath}${queryString}`);
  }
  next();
});

// PAGE QUALITY VALIDATOR
function validatePageQuality(filePath, pageName) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    const criticalPages = ['privacy-policy','terms-and-conditions','contact','affiliate-disclosure','editorial-policy','about'];
    const minimumSize = criticalPages.includes(pageName) ? 200 : 500;
    if (stats.size < minimumSize) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('<title>') || !content.includes('description')) return false;
    return true;
  } catch (err) {
    console.error('[QUALITY VALIDATION ERROR]', err.message);
    return false;
  }
}

function getLastModified(filePath) {
  try { return fs.statSync(filePath).mtime.toISOString(); }
  catch { return new Date().toISOString(); }
}

function buildBreadcrumbSchema(cleanPath) {
  const slug = cleanPath.replace(/\//g, '').replace(/-/g, ' ');
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": BASE_URL },
      { "@type": "ListItem", "position": 2, "name": slug || "Home", "item": `${BASE_URL}${cleanPath}` }
    ]
  };
}

// SEO & TRUST INJECTION
function injectSEOInfrastructure(htmlContent, req, filePath) {
  const cleanPath = req.path.split('?')[0];
  const currentUrl = `${BASE_URL}${cleanPath}`;
  const modifiedDate = getLastModified(filePath);
  const hasQueryParams = Object.keys(req.query || {}).length > 0;

  let robotsDirective = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">';
  if (GLOBAL_NOINDEX || hasQueryParams || cleanPath.includes('/drafts')) {
    robotsDirective = '<meta name="robots" content="noindex, follow">';
  }

  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${BASE_URL}/#organization`, "name": "CompareAE", "url": BASE_URL, "logo": { "@type": "ImageObject", "url": `${BASE_URL}/assets/logo.png` } },
      { "@type": "WebSite", "@id": `${BASE_URL}/#website`, "url": BASE_URL, "name": "CompareAE", "publisher": { "@id": `${BASE_URL}/#organization` } },
      buildBreadcrumbSchema(cleanPath)
    ]
  };

  const TRUST_PAGES = ['/', '/about', '/contact', '/privacy-policy', '/terms-and-conditions', '/affiliate-disclosure', '/editorial-policy'];
  if (!TRUST_PAGES.includes(cleanPath)) {
    schemaGraph['@graph'].push({
      "@type": "Article",
      "headline": "CompareAE Insurance Article",
      "mainEntityOfPage": currentUrl,
      "author": { "@type": "Person", "name": "CompareAE Editorial Team" },
      "publisher": { "@id": `${BASE_URL}/#organization` },
      "dateModified": modifiedDate
    });
  }

  const schemaScript = `<script type="application/ld+json">${JSON.stringify(schemaGraph)}</script>`;
  const canonicalTag = `<link rel="canonical" href="${currentUrl}" />`;
  const authorMeta = `<meta name="author" content="CompareAE Editorial Team">`;
  const modifiedMeta = `<meta property="article:modified_time" content="${modifiedDate}">`;
  const reviewNotice = `<div class="editorial-review-notice" style="text-align:center;padding:15px;margin-top:30px;background:#f9f9f9;font-size:14px;border-top:1px solid #eee;color:#555;">Reviewed for factual consistency and UAE insurance relevance.</div>`;

  let injected = htmlContent.replace('</head>', `${robotsDirective}\n${canonicalTag}\n${authorMeta}\n${modifiedMeta}\n${schemaScript}\n</head>`);
  injected = injected.replace('</body>', `${reviewNotice}\n</body>`);
  return injected;
}

// TRACK ENDPOINT
app.post('/track', (req, res) => {
  try {
    const entry = {
      page: req.body.page || '/',
      type: req.body.type || 'view',
      company: req.body.company || '',
      lang: req.body.lang || 'en',
      dwellSeconds: req.body.dwellSeconds || 0,
      isAffiliate: req.body.isAffiliate || false,
      time: new Date().toISOString()
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {}
  res.status(200).json({ ok: true });
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).json({ status: 'ok', launch_phase: true, canonical_domain: BASE_DOMAIN });
});

// ROOT
app.get('/', (req, res) => {
  const filePath = path.join(PAGES_DIR, 'index.html');
  if (!validatePageQuality(filePath, 'home')) {
    const pages = fs.existsSync(PAGES_DIR)
      ? fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.html'))
          .map(f => `<li><a href="/${f.replace('.html','')}">${f.replace('.html','')}</a></li>`).join('')
      : '<li>No pages yet</li>';
    return res.send(`<!DOCTYPE html><html><body style="font-family:Arial;padding:30px"><h2 style="color:#0e7c7b">CompareAE</h2><ul style="line-height:2.5">${pages}</ul></body></html>`);
  }
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(503).send('Temporary rendering issue.');
    res.send(injectSEOInfrastructure(data, req, filePath));
  });
});

// DYNAMIC PAGE ROUTING
app.get('/:page', (req, res, next) => {
  const pageName = req.params.page;
  if (pageName.includes('.') || ['admin', 'api', 'drafts', 'health'].includes(pageName)) return next();
  const filePath = path.join(PAGES_DIR, `${pageName}.html`);
  if (!validatePageQuality(filePath, pageName)) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    const f404 = path.join(PAGES_DIR, '404.html');
    return fs.existsSync(f404) ? res.status(404).sendFile(f404) : res.status(404).send('404 - Page Not Found');
  }
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err || !data) return res.status(503).send('Temporary rendering issue.');
    try { res.send(injectSEOInfrastructure(data, req, filePath)); }
    catch (renderError) { res.status(503).send('Rendering validation failed.'); }
  });
});

// GLOBAL 404
app.use((req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const f404 = path.join(PAGES_DIR, '404.html');
  res.status(404);
  if (fs.existsSync(f404)) return res.sendFile(f404);
  res.send('404 - Resource Not Found.');
});

const server = app.listen(PORT, () => {
  console.log(`[LAUNCH PHASE ACTIVE] CompareAE running on port ${PORT}`);
  if (GLOBAL_NOINDEX) console.warn('[WARNING] GLOBAL_NOINDEX ENABLED');
});

server.timeout = 10000;
process.on('SIGTERM', () => { server.close(() => { process.exit(0); }); });
