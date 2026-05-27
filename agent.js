// agent.js — يبني صفحات المقارنة (عربي + إنجليزي)
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const OpenAI    = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OUTPUT_DIR = path.join(__dirname, 'pages');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// ── تحميل الكلمات المفتاحية من learning.json إن وجدت
function loadTargets() {
  const base = [
    { keyword: 'Toyota Corolla insurance Dubai',      lang: 'en', city: 'Dubai'      },
    { keyword: 'Nissan Sunny insurance Abu Dhabi',    lang: 'en', city: 'Abu Dhabi'  },
    { keyword: 'cheap car insurance UAE expats',      lang: 'en', city: 'UAE'        },
    { keyword: 'third party car insurance Dubai',     lang: 'en', city: 'Dubai'      },
    { keyword: 'best car insurance Sharjah',          lang: 'en', city: 'Sharjah'    },
    { keyword: 'تأمين تويوتا كورولا دبي',             lang: 'ar', city: 'دبي'        },
    { keyword: 'تأمين نيسان صني أبوظبي',              lang: 'ar', city: 'أبوظبي'     },
    { keyword: 'تأمين سيارة رخيص للمقيمين الإمارات', lang: 'ar', city: 'الإمارات'   },
    { keyword: 'تأمين ضد الغير دبي رخيص',             lang: 'ar', city: 'دبي'        },
    { keyword: 'أفضل تأمين سيارة الشارقة',             lang: 'ar', city: 'الشارقة'    },
  ];

  const learnFile = path.join(__dirname, 'learning.json');
  if (fs.existsSync(learnFile)) {
    const learning = JSON.parse(fs.readFileSync(learnFile, 'utf8'));
    const newKeywords = learning.history
      .flatMap(h => h.newKeywords || [])
      .filter(k => !base.find(b => b.keyword === k))
      .map(k => ({
        keyword: k,
        lang: /[\u0600-\u06FF]/.test(k) ? 'ar' : 'en',
        city: /[\u0600-\u06FF]/.test(k) ? 'الإمارات' : 'UAE'
      }));
    return [...base, ...newKeywords];
  }
  return base;
}

// ── GPT يجمع بيانات المقارنة (5 شركات)
async function researchData(keyword, city, lang) {
  console.log(`  🔍 GPT يبحث: "${keyword}"`);
  const isAr = lang === 'ar';

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'أنت محلل بيانات تأمين متخصص في سوق الإمارات. أرجع JSON فقط بدون أي نص إضافي.'
    }, {
      role: 'user',
      content: `أعطني بيانات مقارنة تأمين السيارة في ${city} للكلمة: "${keyword}".
اللغة: ${isAr ? 'العربية' : 'الإنجليزية'}.

أرجع JSON بهذا الشكل:
{
  "pageTitle": "عنوان الصفحة",
  "heroText": "نص جذاب سطر واحد",
  "companies": [
    {
      "name": "اسم الشركة",
      "logo": "🏢",
      "priceFrom": "750",
      "currency": "${isAr ? 'د.إ' : 'AED'}",
      "type": "${isAr ? 'شامل أو ضد الغير' : 'Comprehensive or TPL'}",
      "gcc": true,
      "agencyRepair": true,
      "replacement": true,
      "roadside": true,
      "rating": 4.5,
      "badge": "",
      "affiliateUrl": "https://yallacompare.com/ae/en-us/products/motor"
    }
  ]
}
أعطني 5 شركات حقيقية تعمل في الإمارات مرتبة من الأرخص للأغلى.
الشركة الثانية أو الثالثة ضعها badge = "${isAr ? 'الأكثر شعبية' : 'Most Popular'}"`
    }],
    max_tokens: 1200,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(res.choices[0].message.content);
}

// ── بناء صفحة HTML احترافية
function buildPage(data, lang) {
  console.log(`  🎨 بناء الصفحة...`);
  const isAr       = lang === 'ar';
  const dir        = isAr ? 'rtl' : 'ltr';
  const fontFamily = isAr ? "'Tajawal', sans-serif" : "'Inter', sans-serif";
  const googleFont = isAr
    ? 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap'
    : 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap';

  const t = {
    sectionTitle: isAr ? 'اختر عرضك — مقارنة مباشرة'        : 'Choose Your Plan — Direct Comparison',
    perYear:      isAr ? '/سنة'                               : '/year',
    gcc:          isAr ? 'تغطية GCC'                         : 'GCC Cover',
    agency:       isAr ? 'إصلاح وكالة'                       : 'Agency Repair',
    replacement:  isAr ? 'سيارة بديلة'                       : 'Replacement Car',
    roadside:     isAr ? 'مساعدة الطريق'                     : 'Roadside Assist',
    ctaBtn:       isAr ? 'شوف سعرك ←'                        : 'See Your Price →',
    pill1:        isAr ? '✅ بدون رسوم'                       : '✅ No Hidden Fees',
    pill2:        isAr ? '⚡ نتائج فورية'                     : '⚡ Instant Results',
    pill3:        isAr ? '🏆 شركات معتمدة'                   : '🏆 Licensed Companies',
    pill4:        isAr ? '🔒 بياناتك آمنة'                   : '🔒 Your Data is Safe',
    disclaimer:   isAr
      ? '<strong>⚠️ إشعار مهم:</strong> المعلومات المعروضة هي لأغراض <strong>المقارنة فقط</strong>. نحن لسنا وسيطاً أو وكيل تأمين مرخصاً ولا نبيع أي منتج تأمين مباشرة. جميع الأسعار تقديرية وقد تتغير بناءً على بياناتك الشخصية. القرار النهائي بيدك أنت.'
      : '<strong>⚠️ Important Notice:</strong> Information on this site is for <strong>comparison purposes only</strong>. We are not a licensed insurance broker and do not sell insurance directly. All prices are estimates and may vary based on your personal details.',
    faqTitle:     isAr ? 'أسئلة شائعة' : 'Frequently Asked Questions',
    faq: isAr ? [
      { q: 'ما الفرق بين التأمين الشامل وضد الغير؟',
        a: 'الشامل يغطي سيارتك وسيارة الطرف الآخر. ضد الغير يغطي الطرف الآخر فقط وهو أرخص.' },
      { q: 'هل الأسعار المعروضة دقيقة؟',
        a: 'الأسعار تقديرية. السعر الفعلي يعتمد على سنة السيارة وعمرك وسجل القيادة.' },
      { q: 'هل تغطية GCC مهمة؟',
        a: 'نعم إذا كنت تسافر لدول الخليج. تأكد منها قبل السفر.' },
      { q: 'كم يستغرق الحصول على التأمين؟',
        a: 'أقل من 10 دقائق. البوليصة تُرسل على إيميلك فوراً.' },
    ] : [
      { q: 'What is the difference between Comprehensive and TPL?',
        a: 'Comprehensive covers your car and the other party. TPL covers only the other party and is cheaper.' },
      { q: 'Are the prices shown accurate?',
        a: 'Prices are estimates. The actual price depends on your car year, age, and driving history.' },
      { q: 'Is GCC cover important?',
        a: 'Yes if you travel to GCC countries. Make sure your policy includes it.' },
      { q: 'How long does it take to get insured?',
        a: 'Less than 10 minutes online. Policy is emailed immediately after payment.' },
    ],
    logoName:   isAr ? 'قارن<span>بلس</span>'  : 'Compare<span>Plus</span>',
    navBadge:   isAr ? '🔒 مقارنة مجانية 100%' : '🔒 100% Free Comparison',
    waText:     isAr ? '💬 تحتاج مساعدة؟'      : '💬 Need Help?',
    footerText: isAr
      ? '© 2025 قارن بلس — موقع مقارنة مستقل غير مرتبط بأي شركة تأمين'
      : '© 2025 ComparePlus — Independent comparison site, not affiliated with any insurer',
    privacy:    isAr ? 'سياسة الخصوصية' : 'Privacy Policy',
    terms:      isAr ? 'الشروط والأحكام' : 'Terms & Conditions',
    contact:    isAr ? 'تواصل معنا'      : 'Contact Us',
    lastUpdate: isAr ? 'آخر تحديث'       : 'Last updated',
    pricesNote: isAr ? 'الأسعار لأغراض المقارنة فقط' : 'Prices for comparison purposes only',
  };

  const companiesHTML = data.companies.map(c => `
    <div class="card ${c.badge ? 'featured' : ''}">
      ${c.badge ? `<div class="badge">${c.badge}</div>` : ''}
      <div class="company-logo">${c.logo}</div>
      <div class="company-name">${c.name}</div>
      <div class="price">${c.priceFrom} <span class="currency">${c.currency}${t.perYear}</span></div>
      <div class="stars">${'★'.repeat(Math.floor(c.rating))}${'☆'.repeat(5 - Math.floor(c.rating))}</div>
      <ul class="features">
        <li>${c.gcc          ? '✅' : '❌'} ${t.gcc}</li>
        <li>${c.agencyRepair ? '✅' : '❌'} ${t.agency}</li>
        <li>${c.replacement  ? '✅' : '❌'} ${t.replacement}</li>
        <li>${c.roadside     ? '✅' : '❌'} ${t.roadside}</li>
      </ul>
      <a class="cta-btn" href="${c.affiliateUrl}" target="_blank" rel="noopener">
        ${t.ctaBtn}
      </a>
    </div>`).join('');

  const faqHTML = t.faq.map(f =>
    `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.pageTitle}</title>
  <meta name="description" content="${data.heroText}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="${googleFont}" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${fontFamily};background:#f4f6fb;color:#1a1a2e}
    nav{background:white;padding:15px 40px;display:flex;align-items:center;
        justify-content:space-between;box-shadow:0 2px 10px rgba(0,0,0,.08);
        position:sticky;top:0;z-index:100}
    .logo{font-size:1.4em;font-weight:900;color:#0e7c7b}
    .logo span{color:#f72585}
    .nav-badge{background:#e8f5e9;color:#2e7d32;padding:5px 12px;
               border-radius:20px;font-size:.82em}
    .hero{background:linear-gradient(135deg,#0e7c7b,#0a5c5b);color:white;
          padding:60px 20px;text-align:center;position:relative;overflow:hidden}
    .hero::before{content:'🚗';font-size:120px;position:absolute;opacity:.07;
                  bottom:-20px;left:50%;transform:translateX(-50%)}
    .hero h1{font-size:2em;font-weight:900;margin-bottom:12px;line-height:1.3}
    .hero p{font-size:1.1em;opacity:.9;margin-bottom:25px}
    .trust-pills{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
    .pill{background:rgba(255,255,255,.15);padding:6px 16px;border-radius:20px;font-size:.85em}
    .section-title{text-align:center;padding:40px 20px 20px;font-size:1.4em;font-weight:700}
    .cards-wrapper{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;
                   padding:10px 20px 40px;max-width:1200px;margin:0 auto}
    .card{background:white;border-radius:16px;padding:28px 22px;width:210px;
          text-align:center;position:relative;box-shadow:0 4px 20px rgba(0,0,0,.08);
          transition:transform .2s,box-shadow .2s;border:2px solid transparent}
    .card:hover{transform:translateY(-5px);box-shadow:0 8px 30px rgba(0,0,0,.15)}
    .card.featured{border-color:#f72585;transform:scale(1.05)}
    .card.featured:hover{transform:scale(1.05) translateY(-5px)}
    .badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
           background:#f72585;color:white;padding:4px 14px;border-radius:20px;
           font-size:.78em;font-weight:700;white-space:nowrap}
    .company-logo{font-size:2.2em;margin-bottom:6px}
    .company-name{font-size:1em;font-weight:700;margin-bottom:10px}
    .price{font-size:1.7em;font-weight:900;color:#0e7c7b;margin-bottom:4px}
    .currency{font-size:.48em;color:#666}
    .stars{color:#ffc107;font-size:1em;margin-bottom:14px}
    .features{list-style:none;margin-bottom:18px;text-align:${isAr ? 'right' : 'left'}}
    .features li{padding:5px 0;font-size:.85em;border-bottom:1px solid #f0f0f0;color:#444}
    .features li:last-child{border-bottom:none}
    .cta-btn{display:block;background:linear-gradient(135deg,#f72585,#d61a6e);
             color:white;padding:12px;border-radius:10px;text-decoration:none;
             font-weight:700;font-size:.95em;transition:opacity .2s}
    .cta-btn:hover{opacity:.88}
    .disclaimer{background:#fff8e1;border-${isAr?'right':'left'}:4px solid #ffc107;
                margin:0 auto 40px;max-width:900px;padding:16px 20px;
                border-radius:8px;font-size:.85em;color:#555;line-height:1.7}
    .faq-section{max-width:900px;margin:0 auto 50px;padding:0 20px}
    .faq-section h2{font-size:1.3em;margin-bottom:20px;color:#0e7c7b}
    details{background:white;border-radius:10px;margin-bottom:10px;
            padding:16px 18px;box-shadow:0 2px 8px rgba(0,0,0,.06);cursor:pointer}
    summary{font-weight:700;color:#1a1a2e;list-style:none}
    summary::after{content:' ＋';float:${isAr?'left':'right'};color:#0e7c7b}
    details[open] summary::after{content:' −'}
    details p{margin-top:10px;color:#555;font-size:.92em;line-height:1.7}
    footer{background:#1a1a2e;color:#aaa;text-align:center;padding:25px;
           font-size:.82em;line-height:1.8}
    footer a{color:#0e7c7b;text-decoration:none}
    .wa-float{position:fixed;bottom:25px;${isAr?'left':'right'}:25px;
              background:#25d366;color:white;padding:14px 20px;border-radius:50px;
              text-decoration:none;font-weight:700;font-size:.95em;
              box-shadow:0 4px 15px rgba(37,211,102,.4);
              display:flex;align-items:center;gap:8px;z-index:999}
    @media(max-width:768px){
      .hero h1{font-size:1.4em}
      .card{width:100%;max-width:340px}
      .card.featured{transform:scale(1)}
    }
  </style>
</head>
<body>
<nav>
  <div class="logo">${t.logoName}</div>
  <div class="nav-badge">${t.navBadge}</div>
</nav>
<section class="hero">
  <h1>${data.pageTitle}</h1>
  <p>${data.heroText}</p>
  <div class="trust-pills">
    <span class="pill">${t.pill1}</span>
    <span class="pill">${t.pill2}</span>
    <span class="pill">${t.pill3}</span>
    <span class="pill">${t.pill4}</span>
  </div>
</section>
<p class="section-title">${t.sectionTitle}</p>
<div class="cards-wrapper">${companiesHTML}</div>
<div class="disclaimer">${t.disclaimer}</div>
<div class="faq-section">
  <h2>${t.faqTitle}</h2>
  ${faqHTML}
</div>
<footer>
  <p>${t.footerText}</p>
  <p style="margin-top:6px">
    <a href="#">${t.privacy}</a> | <a href="#">${t.terms}</a> | <a href="#">${t.contact}</a>
  </p>
  <p style="margin-top:8px;font-size:.78em">
    ${t.lastUpdate}: ${new Date().toLocaleDateString(isAr?'ar-AE':'en-AE')} | ${t.pricesNote}
  </p>
</footer>
<a class="wa-float" href="https://wa.me/" target="_blank">${t.waText}</a>
<script>
  document.querySelectorAll('.cta-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      fetch('/track', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          page: window.location.pathname,
          company: this.closest('.card').querySelector('.company-name').textContent,
          time: new Date().toISOString(),
          lang: document.documentElement.lang,
          type: 'click'
        })
      }).catch(()=>{});
    });
  });
  fetch('/track', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      page: window.location.pathname,
      company: 'PAGE_VIEW',
      time: new Date().toISOString(),
      lang: document.documentElement.lang,
      type: 'view'
    })
  }).catch(()=>{});
</script>
</body>
</html>`;
}

function validatePage(html) {
  return html.includes('cta-btn') &&
         html.includes('disclaimer') &&
         html.includes('yallacompare.com');
}

async function run() {
  console.log('🚀 بدء توليد الصفحات...\n');
  const targets = loadTargets();
  console.log(`📋 عدد الصفحات: ${targets.length}\n`);

  for (const target of targets) {
    console.log(`\n📄 "${target.keyword}" [${target.lang.toUpperCase()}]`);
    try {
      const data = await researchData(target.keyword, target.city, target.lang);
      const html = buildPage(data, target.lang);

      if (!validatePage(html)) {
        console.log(`  ⚠️ تحذير: الصفحة ناقصة عناصر مهمة`);
      }

      const filename = target.keyword
        .replace(/[^a-z0-9أ-ي\s]/gi, '')
        .trim().replace(/\s+/g, '-').toLowerCase() + '.html';

      fs.writeFileSync(path.join(OUTPUT_DIR, filename), html, 'utf8');
      console.log(`  ✅ محفوظ: pages/${filename}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch(err) {
      console.error(`  ❌ خطأ:`, err.message);
    }
  }
  console.log('\n🎉 اكتمل! الصفحات جاهزة في مجلد pages/');
}

run();