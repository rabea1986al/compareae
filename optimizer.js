// optimizer.js — Smart Feedback Loop (Dwell Time + Affiliate Clicks)
const fs   = require('fs');
const path = require('path');

const LOG_FILE      = path.join(__dirname, 'clicks.log');
const LEARNING_FILE = path.join(__dirname, 'learning.json');

function analyzeEngagement() {
  console.log('[OPTIMIZER] Starting engagement analysis...');

  if (!fs.existsSync(LOG_FILE)) {
    console.log('[OPTIMIZER] No clicks.log yet — skipping.');
    return;
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const pageStats = {};

  lines.forEach(line => {
    try {
      const entry = JSON.parse(line);
      const page = entry.page || '/';

      if (!pageStats[page]) {
        pageStats[page] = {
          views: 0,
          affiliateClicks: 0,
          dwellEvents: 0,       // users who stayed 45s+
          totalDwellSeconds: 0,
          companies: {}
        };
      }

      if (entry.type === 'view')            pageStats[page].views++;
      if (entry.type === 'dwell_45s')       pageStats[page].dwellEvents++;
      if (entry.type === 'affiliate_click') {
        pageStats[page].affiliateClicks++;
        if (entry.company) {
          p