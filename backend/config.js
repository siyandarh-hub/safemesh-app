/**
 * Server-only configuration.
 * ADMIN_MASTER_KEY is NEVER sent to the browser.
 *
 * Settings come from environment variables or a .env file
 * (see ../.env.example). No extra dependency needed — a tiny loader is built in.
 */
const fs = require('fs');
const path = require('path');

(function loadDotEnv() {
  const candidates = [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (!m || line.trim().startsWith('#')) return;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      });
    } catch { /* ignore unreadable .env */ }
  }
})();

const DEV_MASTER_KEY = 'dev-only-master-key-not-for-production';
// a missing value, the "change-me" placeholder from .env.example, or anything under 16 characters counts as NOT set
const isWeak = (v) => !v || String(v).trim().toLowerCase() === 'change-me' || String(v).trim().length < 16;
const DEV_JWT_SECRET = 'safemesh-dev-secret-change-in-production-2026';

module.exports = {
  // Master key for creating the first admin / resetting admin passwords.
  // Set SAFEMESH_ADMIN_KEY in .env (or the environment) before going live.
  ADMIN_MASTER_KEY: process.env.SAFEMESH_ADMIN_KEY || DEV_MASTER_KEY,
  USING_DEV_MASTER_KEY: isWeak(process.env.SAFEMESH_ADMIN_KEY),

  // JWT signing secret — override in production
  JWT_SECRET: process.env.SAFEMESH_JWT_SECRET || DEV_JWT_SECRET,
  USING_DEV_JWT_SECRET: isWeak(process.env.SAFEMESH_JWT_SECRET),

  JWT_EXPIRES: '7d',
  PORT: Number(process.env.PORT) || 3847,
  POPIA_VERSION: '1.0',
  TOS_VERSION: '1.0',
  APP_VERSION: '2.4.1',

  // bcrypt cost
  BCRYPT_ROUNDS: 10,

  // Max upload size for evidence (bytes)
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024, // 50 MB per file

  // Responder vetting: an approval is valid for this many days, then the responder is suspended until re-vetted.
  // 0 disables expiry (not recommended). Responders approved before vetting existed get the grace period below.
  VETTING_VALID_DAYS: process.env.SAFEMESH_VETTING_DAYS !== undefined ? Number(process.env.SAFEMESH_VETTING_DAYS) : 365,
  VETTING_LEGACY_GRACE_DAYS: 30,

  // Evidence audit: log each staff member opening a given file at most once per this many ms
  EVIDENCE_AUDIT_DEDUPE_MS: 5 * 60 * 1000,

  // Audit log: how many entries to keep on disk (oldest are dropped first)
  LOG_MAX_ENTRIES: Number(process.env.SAFEMESH_LOG_MAX) || 20000,
};
