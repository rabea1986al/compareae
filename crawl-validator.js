const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, 'pages');

function validateSiteStructure() {
  console.log('=== STARTING PRE-CRAWL CONSISTENCY VALIDATION ===');

  if (!fs.existsSync(PAGES_DIR)) {
    return console.error('[ERROR] Pages directory not found.');
  }

  const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.html'));
  let errorsFound = 0;

  files.forEach(file => {
    const filePath = path.join(PAGES_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const slug = file.replace('.html', '');

    if (!html.includes('rel="canonical"') && slug !== '404') {
      console.error(`❌ Missing Canonical Tag: /${slug}`);
      errorsFound++;
    }

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);

    if (!titleMatch) { console.error(`❌ Missing <title>: /${slug}`); errorsFound++; }
    if (!descMatch)  { console.error(`❌ Missing meta description: /${slug}`); errorsFound++; }

    // Check for minimum word count (estimate)
    const wordCount = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    if (wordCount < 150 && !['about','contact','privacy-policy','terms-and-conditions','affiliate-disclosure','editorial-policy','404'].includes(slug)) {
      console.warn(`⚠️  Low word count (${wordCount}): /${slug}`);
    }

    if (titleMatch && titleMatch[1].length < 20) {
      console.warn(`⚠️  Short title (${titleMatch[1].length} chars): /${slug}`);
    }
  });

  console.log(`\n=== VALIDATION COMPLETE: ${errorsFound} ERROR(S) | ${files.length} PAGE(S) SCANNED ===`);
  process.exit(errorsFound > 0 ? 1 : 0);
}

validateSiteStructure();
