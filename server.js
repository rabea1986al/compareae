// server.js — خادم يقدم الصفحات ويتتبع النقرات
const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOG_FILE  = path.join(__dirname, 'clicks.log');
const PAGES_DIR = path.join(__dirname, 'pages');
const PORT      = 3000;

http.createServer((req, res) => {

  // تتبع النقرات
  if (req.method === 'POST' && req.url === '/track') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { fs.appendFileSync(LOG_FILE, body + '\n'); } catch(e){}
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // تقديم الصفحات
  let name = req.url.replace(/^\//, '') || '';
  let filePath = name
    ? path.join(PAGES_DIR, name.endsWith('.html') ? name : name + '.html')
    : null;

  if (filePath && fs.existsSync(filePath)) {
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    res.end(fs.readFileSync(filePath));
    return;
  }

  // قائمة الصفحات
  const pages = fs.readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => `<li><a href="/${f}">${f.replace('.html','')}</a></li>`)
    .join('');

  res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
  res.end(`<!DOCTYPE html><html dir="rtl"><body style="font-family:Arial;padding:30px;direction:rtl">
    <h2 style="color:#0e7c7b">📄 صفحات المقارنة الجاهزة</h2>
    <ul style="margin-top:20px;line-height:2.5">${pages}</ul>
  </body></html>`);

}).listen(PORT, () => {
  console.log(`✅ الخادم يعمل: http://localhost:${PORT}`);
});