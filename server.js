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

app.enable('trust proxy');
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/sitemap.xml', (req, res) => {
  const p = path.join(__dirname, 'sitemap.xml');
  if (fs.existsSync(p)) { res.setHeader('Content-Type', 'application/xml'); return res.sendFile(p); }
  res.status(404).send('Sitemap not generated yet.');
});

app.get('/robots.txt', (req, res) => {
  const p = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(p)) { res.setHeader('Content-Type', 'text/plain'); return res.sendFile(p); }
  res.status(404).send('Not Found');
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

app.use((req, res, next) => {
  const blocked = ['.log', '.tmp', '.json'];
  if (blocked.some(ext => req.path.endsWith(ext))) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.status(404).send('Not Found');
  }
  next();
});

app.use((req, res, next) => {
  const host = req.headers['x-forwarded-host'] || req.get('host');
  let norm = req.originalUrl.split('?')[0].replace(/\/{2,}/g, '/').toLowerCase();
  if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, -1);
  const isWww = /^www\./i.test(host);
  const clean = req.path.replace(/\/{2,}/g, '/').toLowerCase();
  if (isWww || clean !== norm) {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(301, `https://${BASE_DOMAIN}${norm}${qs}`);
  }
  next();
});

function validatePageQuality(filePath, pageName) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    const critical = ['privacy-policy','terms-and-conditions','contact','affiliate-disclosure','editorial-policy','about'];
    const minSize = critical.includes(pageName) ? 200 : 500;
    if (stats.size < minSize) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('<title>') || !content.includes('description')) return false;
    return true;
  } catch (e) { return false; }
}

function getLastModified(fp) {
  try { return fs.statSync(fp).mtime.toISOString(); } catch { return new Date().toISOString(); }
}

function buildBreadcrumb(cleanPath) {
  const slug = cleanPath.replace(/\//g, '').replace(/-/g, ' ');
  return { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":BASE_URL},
    {"@type":"ListItem","position":2,"name":slug||"Home","item":`${BASE_URL}${cleanPath}`}
  ]};
}

function injectSEO(html, req, fp) {
  const cleanPath = req.path.split('?')[0];
  const url = `${BASE_URL}${cleanPath}`;
  const mod = getLastModified(fp);
  const hasQuery = Object.keys(req.query||{}).length > 0;

  let robots = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">';
  if (GLOBAL_NOINDEX || hasQuery || cleanPath.includes('/drafts')) {
    robots = '<meta name="robots" content="noindex, follow">';
  }

  const graph = {"@context":"https://schema.org","@graph":[
    {"@type":"Organization","@id":`${BASE_URL}/#organization`,"name":"CompareAE","url":BASE_URL,"logo":{"@type":"ImageObject","url":`${BASE_URL}/assets/logo.png`}},
    {"@type":"WebSite","@id":`${BASE_URL}/#website`,"url":BASE_URL,"name":"CompareAE","publisher":{"@id":`${BASE_URL}/#organization`}},
    buildBreadcrumb(cleanPath)
  ]};

  const trustPages = ['/','about','contact','privacy-policy','terms-and-conditions','affiliate-disclosure','editorial-policy'];
  if (!trustPages.includes(cleanPath.replace('/',''))){
    graph['@graph'].push({"@type":"Article","headline":"CompareAE Insurance Article","mainEntityOfPage":url,
      "author":{"@type":"Person","name":"CompareAE Editorial Team"},
      "publisher":{"@id":`${BASE_URL}/#organization`},"dateModified":mod});
  }

  const schema = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
  const notice = `<div style="text-align:center;padding:15px;margin-top:30px;background:#f9f9f9;font-size:14px;border-top:1px solid #eee;color:#555;">Reviewed for factual consistency and UAE insurance relevance.</div>`;

  let out = html.replace('</head>', `${robots}\n<link rel="canonical" href="${url}" />\n<meta name="author" content="CompareAE Editorial Team">\n<meta property="article:modified_time" content="${mod}">\n${schema}\n</head>`);
  out = out.replace('</body>', `${notice}\n</body>`);
  return out;
}

app.post('/track', (req, res) => {
  try {
    const e = { page:req.body.page||'/', type:req.body.type||'view', company:req.body.company||'',
      lang:req.body.lang||'en', dwellSeconds:req.body.dwellSeconds||0,
      isAffiliate:req.body.isAffiliate||false, time:new Date().toISOString() };
    fs.appendFileSync(LOG_FILE, JSON.stringify(e)+'\n');
  } catch(e){}
  res.status(200).json({ok:true});
});

app.get('/health', (req, res) => {
  res.set('X-Robots-Tag','noindex, nofollow');
  res.status(200).json({status:'ok', launch_phase:true, canonical_domain:BASE_DOMAIN});
});

app.get('/', (req, res) => {
  const fp = path.join(PAGES_DIR,'index.html');
  if (!validatePageQuality(fp,'home')) {
    const pages = fs.existsSync(PAGES_DIR)
      ? fs.readdirSync(PAGES_DIR).filter(f=>f.endsWith('.html'))
          .map(f=>`<li><a href="/${f.replace('.html','')}">${f.replace('.html','')}</a></li>`).join('')
      : '<li>No pages yet</li>';
    return res.send(`<!DOCTYPE html><html><body style="font-family:Arial;padding:30px"><h2 style="color:#0e7c7b">CompareAE</h2><ul style="line-height:2.5">${pages}</ul></body></html>`);
  }
  fs.readFile(fp,'utf8',(err,data)=>{
    if(err) return res.status(503).send('Temporary rendering issue.');
    res.send(injectSEO(data,req,fp));
  });
});

app.get('/:page', (req, res, next) => {
  const name = req.params.page;
  if (name.includes('.') || ['admin','api','drafts','health'].includes(name)) return next();
  const fp = path.join(PAGES_DIR, `${name}.html`);
  if (!validatePageQuality(fp, name)) {
    res.set('X-Robots-Tag','noindex, nofollow');
    const f404 = path.join(PAGES_DIR,'404.html');
    return fs.existsSync(f404) ? res.status(404).sendFile(f404) : res.status(404).send('404 - Page Not Found');
  }
  fs.readFile(fp,'utf8',(err,data)=>{
    if(err||!data) return res.status(503).send('Temporary rendering issue.');
    try { res.send(injectSEO(data,req,fp)); } catch(e){ res.status(503).send('Rendering error.'); }
  });
});

app.use((req, res) => {
  res.set('X-Robots-Tag','noindex, nofollow');
  const f404 = path.join(PAGES_DIR,'404.html');
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
