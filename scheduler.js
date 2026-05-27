// scheduler.js — Launch Freeze Mode (max 1 page per 24h during indexing phase)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LAUNCH_FREEZE_MODE = true; // Set to false after first 4 weeks of indexing
const STATE_FILE = path.join(__dirname, 'scheduler_state.json');
const LOG_FILE = path.join(__dirname, 'scheduler.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

function getLastPublishTimestamp() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return data.last_publish_at ? new Date(data.last_publish_at).getTime() : 0;
    }
  } catch (e) { co