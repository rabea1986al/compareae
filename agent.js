// agent.js — CompareAE Page Generator with Safety Hardening
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LIVE_PAGES_DIR  = path.join(__dirname, 'pages');
const SAFE_DRAFTS_DIR = path.join(__dirname, 'drafts');

if (!fs.existsSync(LIVE_PAGES_DIR))  fs.mkdirSync(LIVE_PAGES_DIR);
if (!fs.existsSync(SAFE_DRAFTS_DIR)) fs.mkdirSync(SAFE_DRAFTS_DIR);

// ── SAFETY LAYER: Sensitive topic triggers → drafts folder (requires human review)
const SENSITIVE_TOPIC_TRIGGERS = [
  'legal interpretation', 'claims disputes', 'pricing advice', 'liability',
  'flood', 'storm', 'denied claims', 'accident fault', 'total loss',
  'uninsured driver', 'regulatory guidance', 'insurer comparisons',
  'مطالبات', 'سيول', 'أمطار', 'قانون', 'تعويض', 'حادث'
];

// ── SAFETY LAYER: Banned unsupported phrases (block publication)
const BANNED_UNSUPPORTED_PHRASES = [
  'best insurer', 'cheapest policy', 'guaranteed claims', 'guaranteed savings',
  'أرخص تأمين مطلق', 'أفضل شركة تأمين'
];

// ── Pre-publish quality gate
function runPrePublishQualityGate(draftHtml) {
  const wordCount = draftHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (wordCount < 600) {
    console.warn(`  ⚠️ REJECTED: Word count too low (${wordCount} < 600)`);
    return false;
  }
  const htmlLower = draftHtml.toLowerCase();
  const hasBannedPhrase = BANNED_UNSUPPORTED_PHRASES.some(p => htmlLower.includes(p.toLowerCase()));
  if (hasBannedPhrase) {
    console.warn('  ⚠️ REJECTED: Contains banned unsupported phrase');
    return false;
  }
  // Block generic AI filler patterns
  if (draftHtml.includes('In conclusion') || draftHtml.includes('Furthermore, it is important')) {
    console.warn('  ⚠️ REJECTED: Contains generic AI filler phrases');
    return false;
  }
  return true;
}

// ── Route page to live or drafts based on sensitivity
function processAgentGeneratedOutput(slug, rawHtmlContent) {
  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9؀-ۿ-]/g, '-');
  const contentLower = rawHtmlContent.toLowerCase();

  const requiresHumanReview = SENSITIVE_TOPIC_TRIGGERS.some(
    trigger => cleanSlug.includes(trigger.toLowerCase()) || contentLower.includes(trigger.toLowerCase())
  );

  if (!runPrePublishQualityGate(rawHtmlContent)) {
    return { status: 'rejected', slug: cleanSlug };
  }

  if (requiresHumanReview) {
    const draftPath = path.join(SAFE_DRAFTS_DIR, `${cleanSlug}.html`);
    fs.writeFileSync(draftPath, `<!-- requires_human_review=true -->\n${rawHtmlContent}`, 'utf8');
    console.log(`  📋 DRAFT SAVED (requires review): drafts/${cleanSlug}.html`);
    return { status: 'draft_saved', slug: cleanSlug };
  }

  const livePath = path.join(LIVE_PAGES_DIR, `${cleanSlug}.html`);
  fs.writeFileSync(livePath, rawHtmlContent, 'utf8');
  console.log(`  ✅ PUBLISHED: pages/${cleanSlug}.html`);
  return { status: 'published', slug: cleanSlug };
}

// ── Load keyword targets
function loadTargets() {
  const base = [
    { keyword: 'Toyota Corolla insurance Dubai',             lang: 'en', city: 'Dubai',      intent: 'expat_value' },
    { keyword: 'Nissan Sunny insurance Abu Dhabi',           lang: 'en', city: 'Abu Dhabi',  intent: 'budget_comparison' },
    { keyword: 'car insurance UAE expats comprehensive',     lang: 'en', city: 'UAE',        intent: 'expat_guide' },
    { keyword: 'third party car insurance Dubai young driver',lang: 'en', city: 'Dubai',     intent: 'young_driver' },
    { keyword: 'EV Tesla car insurance UAE agency repair',   lang: 'en', city: 'UAE',        intent: 'ev_specialist' },
    { keyword: 'تأمين تويوتا كورولا دبي ضد الغير',          lang: 'ar', city: 'دبي',        intent: 'tpl_savings' },
    { keyword: 'تأمين شامل أبوظبي سائق جديد',              lang: 'ar', city: 'أبوظبي',     intent: 'new_driver' },
    { keyword: 'تأمين سيارة رخيص الشارقة إصلاح وكالة',    lang: 'ar', city: 'الشارقة',    intent: 'agency_repair' },
    { keyword: 'تأمين ضد الغير دبي نقاط سوداء',            lang: 'ar', city: 'دبي',        intent: 'black_points' },
    { keyword: 'تأمين سيارات كهربائية الإمارات BYD تسلا',  lang: 'ar', city: 'الإمارات',   intent: 'ev_arabic' },
  ];

  const learnFile = path.join(__dirname, 'learning.json');
  if (fs.existsSync(learnFile)) {
    try {
      const learning = JSON.parse(fs.readFileSync(learnFile, 'utf8'));
      const newKeywords = (learning.topAffiliateSlugs || [])
        .filter(k => !base.find(b => b.keyword === k))
        .map(k => ({
          keyword: k,
          lang: /[؀-ۿ]/.test(k) ? 'ar' : 'en',
          city: /[؀-ۿ]/.test(k) ? 'الإمارات' : 'UAE',
          intent: 'data_driven'
        }));
      return [...base, ...newKeywords];
    } catch (e) {}
  }
  return base;
}

// ── GPT-4o research with enforced prompt constraints
async function researchData(keyword, city, lang, intent) {
  console.log(`  🔍 Researching: "${keyword}" [intent: ${intent}]`);
  const isAr = lang === 'ar';

  const systemPrompt = `You are a UAE car insurance data analyst. Return ONLY valid JSON.

STRICT RULES YOU MUST FOLLOW:
1. ZERO PRICING POLICY: Never write specific AED amounts (e.g., "AED 1200"). Use ONLY underwriting factors and broad indicative ranges like "typically starts from a lower range for standard sedans" or "generally higher for agency repair coverage".
2. CONDITIONAL WORDING ONLY: Use "may cover", "typically structures", "varies by insurer", "subject to policy terms". Never use definitive assertions.
3. UAE TERMINOLOGY: Always use "Agency Repair vs Non-Agency Repair", "Black Points", "Salik", "RTA inspection", "GCC coverage", "Comprehensive (Shaamil)", "Third Party Liability (Ded Al-Ghair)".
4. LANGUAGE INTENT: ${isAr ? 'Arabic pages must address regulatory savings, local pain points, Black Points impact, and UAE-specific concerns. Do NOT translate from English — write natively.' : 'English pages must focus on expat requirements, agency repair concerns, EV policies, and premium comparison factors.'}
5. No "best insurer" or "cheapest policy" absolute claims.`;

  const userPrompt = `Generate car insurance comparison data for the UAE market.
Keyword: "${keyword}"
City/Region: ${city}
User Intent: ${intent}
Language: ${isAr ? 'Arabic' : 'English'}

Return this exact JSON structure:
{
  "pageTitle": "specific title targeting the keyword (under 65 chars)",
  "heroText": "one compelling line addressing the user's real concern (not generic)",
  "metaDescription": "unique meta description under 155 chars",
  "intentSummary": "2-sentence explanation of what the user is looking for",
  "companies": [
    {
      "name": "Real UAE insurer name",
      "logo": "🏢",
      "priceRange": "${isAr ? 'نطاق سعري تقريبي بدون أرقام محددة' : 'indicative range description without specific AED'}",
      "currency": "${isAr ? 'د.إ' : 'AED'}",
      "type": "${isAr ? 'شامل أو ضد الغير' : 'Comprehensive or TPL'}",
      "gcc": true,
      "agencyRepair": true,
      "replacement": false,
      "roadside": true,
      "rating": 4.3,
      "badge": "",
      "affiliateUrl": "https://yallacompare.com/ae/en-us/products/motor",
      "intentFit": "why this insurer suits the user's specific intent"
    }
  ],
  "localInsight": "1-2 sentences of UAE-specific insight relevant to this keyword (e.g., Black Points impact, RTA requirements, flood extension relevance)",
  "faqItems": [
    { "q": "intent-specific question", "a": "conditional, factual answer using UAE terminology" }
  ]
}
Return 5 real UAE insurers. Mark one as badge = "${isAr ? 'الأكثر ملاءمة' : 'Best Fit'}".`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 1600,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(res.choices[0].message.content);
}

// ── Build hardened HTML page
function buildPage(data, lang, keyword) {
  const isAr       = lang === 'ar';
  const dir        = isAr ? 'rtl' : 'ltr';
  const fontFamily = isAr ? "'Tajawal', sans-serif" : "'Inter', sans-serif";
  const googleFont = isAr
    ? 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap'
    : 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap';

  const t = {
    sectionTitle:  isAr ? 'قارن خياراتك — مقارنة مباشرة'            : 'Compare Your Options',
    perYear:       isAr ? '/سنة (تقديري)'                             : '/year (indicative)',
    gcc:           isAr ? 'تغطية GCC'                                : 'GCC Cover',
    agency:        isAr ? 'إصلاح وكالة (Agency Repair)'              : 'Agency Repair',
    replacement:   isAr ? 'سيارة بديلة'                              : 'Replacement Car',
    roadside:      isAr ? 'مساعدة الطريق'                            : 'Roadside Assist',
    ctaBtn:        isAr ? 'احصل على عرض السعر ←'                     : 'Get a Quote →',
    pill1:         isAr ? '✅ مقارنة مجانية'                          : '✅ Free Comparison',
    pill2:         isAr ? '⚡ بدون التزام'                            : '⚡ No Obligation',
    pill3:         isAr ? '🏆 شركات مرخصة في الإمارات'               : '🏆 UAE Licensed Insurers',
    pill4:         isAr ? '🔒 بياناتك محمية'                          : '🔒 Data Protected',
    disclaimer:    isAr
      ? '<strong>⚠️ إشعار مهم:</strong> المعلومات على هذا الموقع لأغراض <strong>المقارنة فقط</strong>. نحن لسنا وسيطاً أو وكيل تأمين مرخصاً. جميع الأسعار تقديرية وقد تختلف بناءً على بياناتك الشخصية وشروط الاكتتاب. القرار النهائي يعود لك ولشركة التأمين.'
      : '<strong>⚠️ Important:</strong> Information on this site is for <strong>comparison purposes only</strong>. We are not a licensed insurance broker. All pricing is indicative and varies based on your personal underwriting profile. Always verify directly with the insurer.',
    faqTitle:      isAr ? 'أسئلة شائعة'                              : 'Frequently Asked Questions',
    pricesNote:    isAr ? 'الأسعار تقديرية لأغراض المقارنة فقط'      : 'Prices are indicative for comparison purposes only',
    lastUpdate:    isAr ? 'آخر مراجعة'                               : 'Last reviewed',
    localInsightLabel: isAr ? '📍 نصيحة محلية للإمارات'             : '📍 UAE Local Insight',
    intentFitLabel:    isAr ? 'لماذا يناسبك؟'                        : 'Why it fits your needs',
  };

  const FOOTER_LINKS = `
    <a href="/about">${isAr ? 'من نحن' : 'About'}</a>
    <a href="/contact">${isAr ? 'تواصل معنا' : 'Contact'}</a>
    <a href="/privacy-policy">${isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</a>
    <a href="/terms-and-conditions">${isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}</a>
    <a href="/affiliate-disclosure">${isAr ? 'إفصاح الأفلييت' : 'Affiliate Disclosure'}</a>
    <a href="/editorial-policy">${isAr ? 'السياسة التحريرية' : 'Editorial Policy'}</a>`;

  const companiesHTML = (data.companies || []).map(c => `
    <div class="card ${c.badge ? 'featured' : ''}">
      ${c.badge ? `<div class="badge">${c.badge}</div>` : ''}
      <div class="company-logo">${c.logo || '🏢'}</div>
      <div class="company-name">${c.name}</div>
      <div class="price-range">${c.priceRange}</div>
      <div class="stars">${'★'.repeat(Math.floor(c.rating || 4))}${'☆'.repeat(5 - Math.floor(c.rating || 4))}</div>
      <ul class="features">
        <li>${c.gcc          ? '✅' : '❌'} ${t.gcc}</li>
        <li>${c.agencyRepair ? '✅' : '❌'} ${t.agency}</li>
        <li>${c.replacement  ? '✅' : '❌'} ${t.replacement}</li>
        <li>${c.roadside     ? '✅' : '❌'} ${t.roadside}</li>
      </ul>
      ${c.intentFit ? `<p class="intent-fit"><em>${t.intentFitLabel}:</em> ${c.intentFit}</p>` : ''}
      <a class="cta-btn" href="${c.affiliateUrl}" target="_blank" rel="sponsored noopener">
        ${t.ctaBtn}
      </a>
    </div>`).join('');

  const faqHTML = (data.faqItems || []).map(f =>
    `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('');

  const localInsightHTML = data.localInsight
    ? `<div class="local-insight"><strong>${t.localInsightLabel}:</strong> ${data.localInsight}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.pageTitle}</title>
  <meta name="description" content="${data.metaDescription || data.heroText}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="${googleFont}" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${fontFamily};background:#f4f6fb;color:#1a1a2e}
    nav{background:white;padding:15px 40px;display:flex;align-items:center;
        justify-content:space-between;box-shadow:0 2px 10px rgba(0,0,0,.08);
        position:sticky;top:0;z-index:100}
    .logo{font-size:1.4em;font-weight:900;color:#0e7c7b;text-decoration:none}
    .logo span{color:#f72585}
    .nav-links a{margin:0 10px;color:#444;text-decoration:none;font-size:.9em}
    .nav-links a:hover{color:#0e7c7b}
    .hero{background:linear-gradient(135deg,#0e7c7b,#0a5c5b);color:white;
          padding:60px 20px;text-align:center;position:relative;overflow:hidden}
    .hero h1{font-size:2em;font-weight:900;margin-bottom:12px;line-height:1.3}
    .hero p{font-size:1.05em;opacity:.9;margin-bottom:25px;max-width:650px;margin-left:auto;margin-right:auto}
    .trust-pills{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
    .pill{background:rgba(255,255,255,.15);padding:6px 16px;border-radius:20px;font-size:.85em}
    .section-title{text-align:center;padding:40px 20px 20px;font-size:1.4em;font-weight:700}
    .cards-wrapper{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;
                   padding:10px 20px 40px;max-width:1200px;margin:0 auto}
    .card{background:white;border-radius:16px;padding:28px 22px;width:215px;
          text-align:center;position:relative;box-shadow:0 4px 20px rgba(0,0,0,.08);
          transition:transform .2s,box-shadow .2s;border:2px solid transparent}
    .card:hover{transform:translateY(-5px);box-shadow:0 8px 30px rgba(0,0,0,.15)}
    .card.featured{border-color:#f72585;transform:scale(1.05)}
    .badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
           background:#f72585;color:white;padding:4px 14px;border-radius:20px;
           font-size:.78em;font-weight:700;white-space:nowrap}
    .company-logo{font-size:2.2em;margin-bottom:6px}
    .company-name{font-size:1em;font-weight:700;margin-bottom:8px}
    .price-range{font-size:.82em;color:#666;margin-bottom:8px;font-style:italic;line-height:1.4}
    .stars{color:#ffc107;font-size:1em;margin-bottom:14px}
    .features{list-style:none;margin-bottom:14px;text-align:${isAr ? 'right' : 'left'}}
    .features li{padding:5px 0;font-size:.83em;border-bottom:1px solid #f0f0f0;color:#444}
    .features li:last-child{border-bottom:none}
    .intent-fit{font-size:.78em;color:#666;margin-bottom:12px;line-height:1.5;text-align:${isAr?'right':'left'}}
    .cta-btn{display:block;background:linear-gradient(135deg,#f72585,#d61a6e);
             color:white;padding:12px;border-radius:10px;text-decoration:none;
             font-weight:700;font-size:.9em;transition:opacity .2s}
    .cta-btn:hover{opacity:.88}
    .local-insight{background:#e8f5e9;border-${isAr?'right':'left'}:4px solid #2e7d32;
                   max-width:900px;margin:0 auto 25px;padding:15px 20px;
                   border-radius:8px;font-size:.88em;color:#1b5e20;line-height:1.7}
    .disclaimer{background:#fff8e1;border-${isAr?'right':'left'}:4px solid #ffc107;
                max-width:900px;margin:0 auto 40px;padding:16px 20px;
                border-radius:8px;font-size:.85em;color:#555;line-height:1.7}
    .faq-section