// scheduler.js — يشغّل المنظومة كل 24 ساعة تلقائياً
const { execSync } = require('child_process');

function log(msg) {
  const t = new Date().toLocaleString('ar-AE');
  const line = `[${t}] ${msg}`;
  console.log(line);
  require('fs').appendFileSync('scheduler.log', line + '\n');
}

async function dailyRun() {
  log('🌅 بدء الجولة اليومية...');

  try {
    log('📊 تشغيل Optimizer...');
    execSync('node optimizer.js', { stdio: 'inherit' });
    log('✅ Optimizer اكتمل');
  } catch(e) {
    log('⚠️ خطأ في Optimizer: ' + e.message);
  }

  log('✅ اكتملت الجولة — القادمة بعد 24 ساعة\n');
}

dailyRun();
setInterval(dailyRun, 24 * 60 * 60 * 1000);
log('🚀 Scheduler يعمل في الخلفية...');