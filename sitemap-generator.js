const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, 'pages');
const OUTPUT_FILE = path.join(__dirname, 'sitemap.xml');

function generateSitemap() {
  if (!fs.existsSync(PAGES_DIR)) {
    console.log('[SITEMAP] Pages directory not found. Skipping.');
    return;
  }

  const files = fs.readdirSync(PAGES_DIR);
  let urlBlocks = '';
  const uniqueSlugs = new Set();

  files.forEach(file => {
    if (!file.endsWith('.html')) return;
    const slug = file.replace('.html', '').toLowerCase();

    // Skip excluded pages
    if (['404', 'admin', 'temp', 'draft'].includes(slug)) return;

    const filePath = path.join(PAGES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Skip drafts and noindex pages
    if (
      content.includes('requires_human_review=true') ||
      content.includes('draft=true') ||
      content.includes('noindex')
    ) return;

    // Skip duplicates and non-lowercase filenames
    if (uniqueSlugs.has(slug) || file !== file.toLowerCase()) return;
    uniqueSlugs.add(slug);

    const loc = slug === 'index'
      ? 'https://compareae.com/'
      : `https://compareae.com/${slug}`;

    const stat = fs.statSync(filePath);
    const lastMod = stat.mtime.toISOString().split('T')[0];
    const priority = slug === 'index' ? '1.0' : '0.8';

    urlBlocks += `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlBlocks}</urlset>`;
  fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
  console.log(`[SITEMAP] Generated ${uniqueSlugs.size} canonical URLs → sitemap.xml`);
}

generateSitemap();
