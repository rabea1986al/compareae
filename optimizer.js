const fs = require('fs');const path = require('path');

function analyzeClicks() {
  const logFile = 'clicks.log';
  const learningFile = 'learning.json';
  
  if (!fs.existsSync(logFile)) {
    console.log('No clicks.log found yet');
    return;
  }
  
  const logs = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const clicks = {};
  
  logs.forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (entry.page) {
        clicks[entry.page] = (clicks[entry.page] || 0) + 1;
      }
    } catch(e) {}
  });
  
  const sorted = Object.entries(clicks).sort((a,b) => b[1]-a[1]);
  console.log('Top pages by clicks:');
  sorted.slice(0,5).forEach(([page, count]) => {
    console.log(' -', page, ':', count, 'clicks');
  });
  
  let learning = {};
  if (fs.existsSync(learningFile)) {
    try { learning = JSON.parse(fs.readFileSync(learningFile,'utf8')); } catch(e) {}
  }
  
  learning.topPages = sorted.slice(0,5).map(([p]) => p);
  learning.lastAnalyzed = new Date().toISOString();
  learning.totalClicks = logs.length;
  
  fs.writeFileSync(learningFile, JSON.stringify(learning, null, 2));
  console.log('learning.json updated!');
}

analyzeClicks();
