/**
 * SafeMesh API Server  (v2.2)
 * Master key lives only here — never exposed to the frontend.
 *
 * 2.3: SQLite database, signed evidence links, guest SOS sync, emailed/SMS reset codes, self-hosted libraries.
 *
 * What's new in 2.2
 *  - Audit log of everything that happens (GET /api/logs, admin only)
 *  - Stand-down + duress PINs created at registration (hashed on the server)
 *  - Counselling chat: names, unread tracking, pro availability enforced server-side
 *  - Safe-house verification (approve / reject) visible to admins
 *  - Incident PATCH is now permission-checked (owner / responder / admin)
 *  - Reverse-geocoding proxy so the app can work out the REAL town & province from GPS
 */
const http = require('http');
const https = require('https');
const os = require('os');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { store, persist, persistLater, DATA_DIR } = require('./db');
const config = require('./config');
const mailer = require('./mailer');
const { ensureVendor } = require('./vendor');
const db = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && (config.USING_DEV_MASTER_KEY || config.USING_DEV_JWT_SECRET)) {
  console.error('\n  ✖ NODE_ENV=production but SAFEMESH_ADMIN_KEY / SAFEMESH_JWT_SECRET are not set.');
  console.error('    Refusing to start with the built-in development secrets. Set both in .env (see .env.example).\n');
  process.exit(1);
}

const app = express();
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);

// The app and API are served from the same origin, so CORS is OFF unless you list extra origins.
if (process.env.SAFEMESH_CORS_ORIGINS) {
  const allow = process.env.SAFEMESH_CORS_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean);
  app.use(cors({ origin: (o, cb) => cb(null, !o || allow.includes(o)), credentials: true }));
}
// (csp-report posts arrive as application/csp-report or application/reports+json)
app.use(express.json({ limit: '2mb', type: ['application/json', 'application/csp-report', 'application/reports+json'] }));
app.use(express.urlencoded({ extended: true }));

/* ---- HTTPS ---------------------------------------------------------------------------------
 * - FORCE_HTTPS (default: on when NODE_ENV=production) redirects http:// to https://.
 * - Behind Nginx/Caddy/Render/Railway set TRUST_PROXY=true so the proxy's X-Forwarded-Proto is believed.
 * - HSTS is sent only on real HTTPS with a real certificate (never for the local self-signed one).
 */
const FORCE_HTTPS = process.env.FORCE_HTTPS ? process.env.FORCE_HTTPS === 'true' : IS_PROD;
const wantTls = process.argv.includes('--https') || process.env.SAFEMESH_HTTPS === '1' || !!(process.env.SAFEMESH_TLS_CERT && process.env.SAFEMESH_TLS_KEY);
let usingSelfSigned = false;
const isSecureReq = (req) => !!(req.socket && req.socket.encrypted) || req.secure;
app.use((req, res, next) => {
  if (!FORCE_HTTPS || isSecureReq(req) || req.path === '/api/health') return next();
  // proxy told us it already terminated TLS but TRUST_PROXY is not set: do not redirect forever
  if (!process.env.TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') return next();
  const host = process.env.SAFEMESH_PUBLIC_HOST || req.headers.host || '';
  return res.redirect(308, 'https://' + host + req.originalUrl);
});

/* ---- Content-Security-Policy ---------------------------------------------------------------
 * script-src 'self'  -> no inline scripts, no eval, no third-party scripts (all libraries are self-hosted).
 * Inline style *attributes* are still allowed (style-src-attr) because the UI builds HTML with style="...";
 * <style> blocks and stylesheets must come from this server.
 * Mode: SAFEMESH_CSP=enforce | report-only | off   (default: enforce in production, report-only otherwise)
 * Violations are reported to /api/csp-report and appear in the admin Logs tab (category "security").
 */
const CSP_MODE = String(process.env.SAFEMESH_CSP || (IS_PROD ? 'enforce' : 'report-only')).toLowerCase();
function buildCsp(secure) {
  const d = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "media-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://router.project-osrm.org",
    "worker-src 'self'", "manifest-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    'report-uri /api/csp-report',
  ];
  if (secure) d.push('upgrade-insecure-requests');
  return d.join('; ');
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self)');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  const secure = isSecureReq(req);
  if (secure && !usingSelfSigned) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (CSP_MODE !== 'off') {
    res.setHeader(CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', buildCsp(secure));
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  setHeaders: (res, filePath) => {
    if (/(index\.html|sw\.js|manifest\.json)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}_${safe}`);
  },
});
// Only real media / PDFs are accepted as evidence (no HTML, SVG or scripts that could run in a browser)
const EV_ALLOWED = /^(image\/(png|jpe?g|gif|webp|bmp|heic|heif)|video\/(mp4|webm|quicktime|x-m4v)|audio\/(webm|ogg|mpeg|mp4|wav|x-wav|aac|x-m4a|m4a)|application\/pdf)(;.*)?$/i;
const upload = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (EV_ALLOWED.test(file.mimetype || '')) return cb(null, true);
    const err = new Error('This file type is not allowed as evidence (use photos, video, audio or PDF)'); err.status = 415; cb(err);
  },
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const lc = (v) => String(v || '').trim().toLowerCase();
const PIN_RE = /^\d{4,6}$/;
const DAY = 86400000;

/* "Approved" must mean something: an approved responder whose vetting has lapsed has NO staff access. */
const isAdminAcct = (u) => !!u && u.role === 'admin' && u.adminStatus === 'approved';
const vettingLapsed = (u) => !!(config.VETTING_VALID_DAYS && u && u.vetting && u.vetting.expiresAt && u.vetting.expiresAt <= Date.now());
const isApprovedResponder = (u) => !!u && u.role === 'responder' && u.responderStatus === 'approved' && !vettingLapsed(u);
const isStaff = (u) => isAdminAcct(u) || isApprovedResponder(u);

function signToken(account) {
  return jwt.sign({ sub: account.email, role: account.role, name: account.name }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES });
}

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: 'Sign in required' });
      req.user = null;
      return next();
    }
    try {
      const payload = jwt.verify(token, config.JWT_SECRET);
      const row = store.accounts.find(a => lc(a.email) === lc(payload.sub));
      if (row && row.passwordResetAt && payload.iat && payload.iat < Math.floor(row.passwordResetAt / 1000)) {
        if (required) return res.status(401).json({ error: 'Password was reset — please sign in again' });
        req.user = null; return next();
      }
      if (!row) {
        if (required) return res.status(401).json({ error: 'Account not found' });
        req.user = null;
        return next();
      }
      req.user = row;
      next();
    } catch {
      if (required) return res.status(401).json({ error: 'Invalid or expired session' });
      req.user = null;
      next();
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function publicIncident(i) { const { guestKeyHash, ...rest } = i; return rest; }
function guestKeyOk(req, row) {
  const k = req.headers['x-guest-key'];
  return !!(k && row && row.guestKeyHash && safeEq(sha256(k), row.guestKeyHash));
}

function normalizePhone(p) { return String(p || '').replace(/[\s\-()]/g, ''); }
function phoneTail(p) { return String(p || '').replace(/\D/g, '').slice(-9); }

function findAccountByLogin(loginId) {
  const id = String(loginId || '').trim().toLowerCase();
  if (!id) return null;
  let row = store.accounts.find(a => lc(a.email) === id);
  if (row) return row;
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 9) {
    row = store.accounts.find(a => {
      if (!a.phone) return false;
      const pd = normalizePhone(a.phone).replace(/\D/g, '');
      return pd === digits || pd.endsWith(digits) || digits.endsWith(pd);
    });
  }
  return row || null;
}

function accountPublic(row) {
  if (!row) return null;
  return {
    email: row.email, phone: row.phone, name: row.name, role: row.role,
    province: row.province, town: row.town, org: row.org, job: row.job,
    industry: row.industry, license: row.license,
    responderStatus: row.responderStatus, adminStatus: row.adminStatus, proStatus: row.proStatus,
    accepting: row.accepting !== false, createdAt: row.createdAt, approvedAt: row.approvedAt, approvedBy: row.approvedBy,
    lastLoginAt: row.lastLoginAt || null,
    hasPins: !!(row.pinHash && row.duressHash),
    vettedAt: row.vetting ? (row.vetting.vettedAt || null) : null,
    vettedBy: row.vetting ? (row.vetting.vettedBy || null) : null,
    vettingExpiresAt: row.vetting ? (row.vetting.expiresAt || null) : null,
    vettingLegacy: !!(row.vetting && row.vetting.legacy),
    suspendedReason: row.suspendedReason || null,
  };
}

function hasAdmin() {
  return store.accounts.some(a => a.role === 'admin' && a.adminStatus === 'approved');
}

function nameOf(email) {
  const a = store.accounts.find(x => lc(x.email) === lc(email));
  return a ? (a.name || a.email) : email;
}

/* ------------------------------------------------------------------ */
/*  Audit log                                                          */
/* ------------------------------------------------------------------ */
function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(s)) return 'phone';
  if (!s) return 'unknown';
  return 'computer';
}

/**
 * Record something that happened in the system.
 * category: auth | account | incident | safehouse | chat | evidence | duty | bulletin | security | system
 * Never put passwords, PINs, or chat contents in `details` (POPIA).
 */
function audit(req, category, action, summary, details = {}, actorOverride = null) {
  try {
    const u = req && req.user ? req.user : null;
    const entry = {
      id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      at: Date.now(),
      category, action,
      summary: String(summary || action).slice(0, 300),
      actor: actorOverride || (u ? u.email : 'anonymous'),
      actorName: u ? (u.name || u.email) : null,
      role: u ? u.role : 'guest',
      details,
      ip: req ? (req.ip || (req.socket && req.socket.remoteAddress) || '') : '',
      device: req ? deviceOf(req.headers && req.headers['user-agent']) : 'server',
      ua: req && req.headers ? String(req.headers['user-agent'] || '').slice(0, 160) : '',
    };
    store.logs.push(entry);
    if (store.logs.length > config.LOG_MAX_ENTRIES) store.logs.splice(0, store.logs.length - config.LOG_MAX_ENTRIES);
    persistLater('logs');
  } catch (e) {
    console.warn('audit failed', e.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Basic brute-force protection for sign-in / PIN checks              */
/* ------------------------------------------------------------------ */
const failBuckets = new Map(); // key -> { n, first }
function tooManyFails(key, max = 8, windowMs = 10 * 60 * 1000) {
  const b = failBuckets.get(key);
  if (!b) return false;
  if (Date.now() - b.first > windowMs) { failBuckets.delete(key); return false; }
  return b.n >= max;
}
function noteFail(key) {
  const b = failBuckets.get(key);
  if (!b || Date.now() - b.first > 10 * 60 * 1000) failBuckets.set(key, { n: 1, first: Date.now() });
  else b.n += 1;
}
function clearFails(key) { failBuckets.delete(key); }

/* ------------------------------------------------------------------ */
/*  Health / config                                                    */
/* ------------------------------------------------------------------ */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: config.APP_VERSION, time: Date.now(), hasAdmin: hasAdmin() });
});

app.get('/api/config', (_req, res) => {
  res.json({ popiaVersion: config.POPIA_VERSION, tosVersion: config.TOS_VERSION, appVersion: config.APP_VERSION, maxUploadBytes: config.MAX_UPLOAD_BYTES });
});

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, province, town, org, job, industry, license, adminKey, popiaAccepted, tosAccepted, standDownPin, duressPin } = req.body || {};
    const cleanEmail = lc(email);
    const cleanPhone = normalizePhone(phone);
    const cleanName = String(name || '').trim() || 'New User';
    const cleanRole = String(role || 'user');

    if (!cleanEmail) return res.status(400).json({ error: 'Email is required' });
    const phoneDigits = String(cleanPhone || '').replace(/\D/g, '');
    if (phoneDigits.length < 9 || phoneDigits.length > 15) return res.status(400).json({ error: 'Enter a valid cellphone number, e.g. 0821234567 or +27821234567' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!['user', 'responder', 'admin', 'professional'].includes(cleanRole)) return res.status(400).json({ error: 'Invalid role' });
    if (store.accounts.find(a => lc(a.email) === cleanEmail)) return res.status(409).json({ error: 'Account exists — please sign in' });

    // Users and health professionals get an SOS button, so they must set both PINs now.
    const needsPins = cleanRole === 'user' || cleanRole === 'professional';
    let pinHash = null, duressHash = null;
    if (needsPins) {
      if (!PIN_RE.test(String(standDownPin || ''))) return res.status(400).json({ error: 'Stand-down PIN must be 4–6 digits' });
      if (!PIN_RE.test(String(duressPin || ''))) return res.status(400).json({ error: 'Duress PIN must be 4–6 digits' });
      if (String(standDownPin) === String(duressPin)) return res.status(400).json({ error: 'Duress PIN must be different from your stand-down PIN' });
      pinHash = await bcrypt.hash(String(standDownPin), config.BCRYPT_ROUNDS);
      duressHash = await bcrypt.hash(String(duressPin), config.BCRYPT_ROUNDS);
    }

    const hash = await bcrypt.hash(String(password), config.BCRYPT_ROUNDS);
    const now = Date.now();

    if (cleanRole === 'admin') {
      const keyOk = String(adminKey || '') === config.ADMIN_MASTER_KEY;
      if (adminKey && !keyOk) {
        audit(req, 'security', 'admin_key_rejected', `Wrong admin master key used while registering ${cleanEmail}`, {}, cleanEmail);
        return res.status(403).json({ error: 'Invalid admin master key' });
      }
      if (!keyOk && !hasAdmin()) return res.status(403).json({ error: 'No admin exists yet — the master key is required for the first admin' });
      const account = {
        email: cleanEmail, phone: cleanPhone, passwordHash: hash, name: cleanName,
        role: 'admin', adminStatus: keyOk ? 'approved' : 'pending', createdAt: now,
      };
      store.accounts.push(account);
      persist('accounts');
      audit(req, 'account', 'register', `Admin account ${keyOk ? 'created' : 'requested (needs approval)'}: ${cleanEmail}`, { role: 'admin', approved: keyOk }, cleanEmail);
      if (!keyOk) return res.json({ ok: true, pending: true, message: 'Request sent — an existing admin must approve your account before you can sign in' });
      return res.json({ ok: true, token: signToken(account), user: accountPublic(account) });
    }

    if (!popiaAccepted) return res.status(400).json({ error: 'You must accept the privacy notice to continue' });
    if (!tosAccepted) return res.status(400).json({ error: 'You must accept the terms of service to continue' });
    if (!province || !town) return res.status(400).json({ error: 'Please select your province and town' });
    if (cleanRole === 'responder' && !job) return res.status(400).json({ error: 'Please select your job role' });
    if (cleanRole === 'professional' && !industry) return res.status(400).json({ error: 'Please select your industry / specialty' });
    if (cleanRole === 'professional' && !license) return res.status(400).json({ error: 'Professional registration number is required for verification' });

    const account = {
      email: cleanEmail, phone: cleanPhone, passwordHash: hash, name: cleanName, role: cleanRole,
      province, town, org: org || (cleanRole === 'responder' ? 'Community Watch' : null), job: job || null,
      industry: industry || null, license: license || null,
      responderStatus: cleanRole === 'responder' ? 'pending' : null,
      proStatus: cleanRole === 'professional' ? 'pending' : null,
      accepting: true, popiaVersion: config.POPIA_VERSION, popiaConsentAt: now,
      tosVersion: config.TOS_VERSION, tosConsentAt: now, createdAt: now,
      pinHash, duressHash, pinsSetAt: needsPins ? now : null,
    };
    store.accounts.push(account);
    persist('accounts');
    audit(req, 'account', 'register', `New ${cleanRole} account: ${cleanEmail} (${town}, ${province})`, { role: cleanRole, town, province }, cleanEmail);
    res.json({
      ok: true, token: signToken(account), user: accountPublic(account),
      message: cleanRole === 'responder' ? 'Responder account created — pending admin approval'
        : cleanRole === 'professional' ? 'Account created — awaiting admin verification'
        : `Account created — ${town}`,
    });
  } catch (err) {
    console.error('register', err);
    res.status(500).json({ error: 'Could not create account: ' + (err.message || 'server error') });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password, role, province, town } = req.body || {};
    if (!login) return res.status(400).json({ error: 'Email or phone is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const bucket = `login:${req.ip}:${lc(login)}`;
    if (tooManyFails(bucket)) {
      audit(req, 'security', 'login_blocked', `Sign-in blocked (too many failures) for ${lc(login)}`, {}, lc(login));
      return res.status(429).json({ error: 'Too many failed attempts. Wait a few minutes and try again.' });
    }
    const account = findAccountByLogin(login);
    if (!account) {
      noteFail(bucket);
      audit(req, 'auth', 'login_failed', `Sign-in failed — no account for "${lc(login)}"`, { reason: 'no_account' }, lc(login));
      return res.status(401).json({ error: 'No account found — create one first, or continue as guest' });
    }
    const ok = await bcrypt.compare(String(password), account.passwordHash);
    if (!ok) {
      noteFail(bucket);
      audit(req, 'auth', 'login_failed', `Sign-in failed — wrong password for ${account.email}`, { reason: 'bad_password', role: account.role }, account.email);
      return res.status(401).json({ error: 'Incorrect password' });
    }
    const wantRole = role || account.role;

    const done = (payload) => {
      clearFails(bucket);
      account.lastLoginAt = Date.now();
      persistLater('accounts');
      req.user = account;
      audit(req, 'auth', 'login', `${account.name || account.email} signed in as ${account.role}`, {
        role: account.role, town: payload.user && payload.user.town, province: payload.user && payload.user.province,
      });
      res.json(payload);
    };

    if (wantRole === 'admin' || account.role === 'admin') {
      if (account.role !== 'admin') return res.status(403).json({ error: 'Not an admin account' });
      if (account.adminStatus === 'pending') return res.status(403).json({ error: 'Your admin account is awaiting approval from another admin' });
      if (account.adminStatus === 'rejected') return res.status(403).json({ error: 'Your admin request was rejected' });
      return done({ ok: true, token: signToken(account), user: accountPublic(account) });
    }
    if (wantRole === 'professional') {
      if (account.role !== 'professional') return res.status(403).json({ error: 'This account is not registered as a mental health professional' });
      return done({ ok: true, token: signToken(account), user: accountPublic(account) });
    }
    if (wantRole === 'responder') {
      if (account.role !== 'responder') return res.status(403).json({ error: 'This account is not registered as a responder' });
      if (account.responderStatus === 'revoked') return res.status(403).json({ error: 'Your responder access has been revoked by an admin' });
    }
    if (account.role === 'admin') return res.status(403).json({ error: 'Use the Admin tab to sign in to this account' });
    if (wantRole !== 'professional' && (!province || !town)) return res.status(400).json({ error: 'Please select your province and town' });

    const user = accountPublic(account);
    if (province) user.province = province;
    if (town) user.town = town;
    done({
      ok: true, token: signToken(account), user,
      warn: account.role === 'responder' && account.responderStatus === 'pending' ? 'Your responder account is pending admin approval' : null,
    });
  } catch (err) {
    console.error('login', err);
    res.status(500).json({ error: 'Could not sign in' });
  }
});

app.post('/api/auth/logout', auth(false), (req, res) => {
  if (req.user) audit(req, 'auth', 'logout', `${req.user.name || req.user.email} signed out`);
  res.json({ ok: true });
});

/* Password reset: a 6-digit code is e-mailed / texted to the account (see mailer.js). */
const RESET_MINUTES = 10;
const resetHash = (email, code) => crypto.createHmac('sha256', config.JWT_SECRET).update(`${lc(email)}:${code}`).digest('hex');

app.post('/api/auth/forgot/request', async (req, res) => {
  const { email, role } = req.body || {};
  const cleanEmail = lc(email);
  const generic = { ok: true, message: `If an account matches, a 6-digit code was sent to its email / cellphone. It expires in ${RESET_MINUTES} minutes.` };
  if (!cleanEmail) return res.status(400).json({ error: 'Enter the account email' });
  const ipBucket = `forgotreq:${req.ip}`;
  if (tooManyFails(ipBucket, 12)) return res.status(429).json({ error: 'Too many requests. Wait a few minutes and try again.' });
  noteFail(ipBucket);   // every request counts, so this cannot be used to spam people

  const account = store.accounts.find(a => lc(a.email) === cleanEmail && a.role === (role || 'user'));
  if (!account) { audit(req, 'security', 'reset_requested_unknown', `Password-reset code requested for unknown account ${cleanEmail}`, {}, cleanEmail); return res.json(generic); }

  const now = Date.now(), prev = account.reset || {};
  if (prev.sentAt && now - prev.sentAt < 60000) return res.json(generic);               // 1 per minute
  const sameHour = prev.hourStart && now - prev.hourStart < 3600000;
  if (sameHour && (prev.hourCount || 0) >= 5) return res.json(generic);                 // 5 per hour
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  account.reset = { hash: resetHash(cleanEmail, code), expires: now + RESET_MINUTES * 60000, attempts: 0, sentAt: now, hourStart: sameHour ? prev.hourStart : now, hourCount: sameHour ? (prev.hourCount || 0) + 1 : 1 };
  persist('accounts');
  // fire-and-forget so the response time does not reveal whether the account exists
  mailer.sendResetCode({ email: account.email, phone: account.phone, code, name: account.name, minutes: RESET_MINUTES })
    .then((r) => audit(req, 'security', 'reset_code_sent', `Password-reset code sent to ${cleanEmail} via ${r.channels.join('+') || 'NO CHANNEL (provider not configured)'}`, { channels: r.channels }, cleanEmail))
    .catch(() => {});
  res.json(generic);
});

app.post('/api/auth/forgot/confirm', async (req, res) => {
  try {
    const { email, role, code, newPassword, adminKey } = req.body || {};
    const cleanEmail = lc(email);
    if (!cleanEmail || !code) return res.status(400).json({ error: 'Enter the email and the 6-digit code' });
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const bucket = `forgotconf:${req.ip}:${cleanEmail}`;
    if (tooManyFails(bucket, 8)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    const account = store.accounts.find(a => lc(a.email) === cleanEmail && a.role === (role || 'user'));
    const r = account && account.reset;
    const bad = () => { noteFail(bucket); return res.status(400).json({ error: 'That code is wrong or has expired. Request a new one.' }); };
    if (!r || Date.now() > r.expires) return bad();
    if ((r.attempts || 0) >= 5) { delete account.reset; persist('accounts'); return res.status(400).json({ error: 'Too many wrong codes — request a new one.' }); }
    if (!safeEq(resetHash(cleanEmail, String(code).trim()), r.hash)) {
      r.attempts = (r.attempts || 0) + 1; persist('accounts');
      audit(req, 'security', 'reset_code_wrong', `Wrong reset code entered for ${cleanEmail}`, {}, cleanEmail);
      return bad();
    }
    if (account.role === 'admin' && String(adminKey || '') !== config.ADMIN_MASTER_KEY) {
      audit(req, 'security', 'reset_denied', `Admin password reset denied for ${cleanEmail} (bad master key)`, {}, cleanEmail);
      return res.status(403).json({ error: 'Admin accounts also need the master key' });
    }
    account.passwordHash = await bcrypt.hash(String(newPassword), config.BCRYPT_ROUNDS);
    account.passwordResetAt = Date.now();
    delete account.reset;
    persist('accounts');
    clearFails(bucket);
    audit(req, 'security', 'password_reset', `Password reset with emailed code for ${cleanEmail}`, { role: account.role }, cleanEmail);
    res.json({ ok: true, message: 'Password updated — you can sign in now' });
  } catch (err) {
    console.error('forgot confirm', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

app.post('/api/auth/change-password', auth(true), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword) return res.status(400).json({ error: 'Enter your current password' });
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different from the current one' });
    const ok = await bcrypt.compare(String(currentPassword), req.user.passwordHash);
    if (!ok) {
      audit(req, 'security', 'password_change_failed', `${req.user.email} entered the wrong current password`);
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    req.user.passwordHash = await bcrypt.hash(String(newPassword), config.BCRYPT_ROUNDS);
    req.user.passwordChangedAt = Date.now();
    persist('accounts');
    audit(req, 'security', 'password_changed', `${req.user.email} changed their password`);
    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not change password' });
  }
});

app.get('/api/auth/me', auth(true), (req, res) => res.json({ user: accountPublic(req.user) }));

/* ------------------------------------------------------------------ */
/*  PINs (stand-down + duress)                                          */
/* ------------------------------------------------------------------ */
app.post('/api/pins', auth(true), async (req, res) => {
  try {
    const { standDownPin, duressPin } = req.body || {};
    if (standDownPin === undefined && duressPin === undefined) return res.status(400).json({ error: 'Nothing to update' });
    if (standDownPin !== undefined && !PIN_RE.test(String(standDownPin))) return res.status(400).json({ error: 'Stand-down PIN must be 4–6 digits' });
    if (duressPin !== undefined && !PIN_RE.test(String(duressPin))) return res.status(400).json({ error: 'Duress PIN must be 4–6 digits' });

    // Both PINs must always be different — also against the one that is NOT being changed.
    if (standDownPin !== undefined && duressPin !== undefined && String(standDownPin) === String(duressPin)) {
      return res.status(400).json({ error: 'Duress PIN must be different from your stand-down PIN' });
    }
    if (standDownPin !== undefined && duressPin === undefined && req.user.duressHash && await bcrypt.compare(String(standDownPin), req.user.duressHash)) {
      return res.status(400).json({ error: 'Stand-down PIN must be different from your duress PIN' });
    }
    if (duressPin !== undefined && standDownPin === undefined && req.user.pinHash && await bcrypt.compare(String(duressPin), req.user.pinHash)) {
      return res.status(400).json({ error: 'Duress PIN must be different from your stand-down PIN' });
    }
    if (standDownPin !== undefined) req.user.pinHash = await bcrypt.hash(String(standDownPin), config.BCRYPT_ROUNDS);
    if (duressPin !== undefined) req.user.duressHash = await bcrypt.hash(String(duressPin), config.BCRYPT_ROUNDS);
    req.user.pinsSetAt = Date.now();
    persist('accounts');
    audit(req, 'security', 'pins_updated', `${req.user.email} updated their ${[standDownPin !== undefined && 'stand-down', duressPin !== undefined && 'duress'].filter(Boolean).join(' + ')} PIN`);
    res.json({ ok: true, hasPins: !!(req.user.pinHash && req.user.duressHash) });
  } catch (err) {
    console.error('pins', err);
    res.status(500).json({ error: 'Could not save PIN' });
  }
});

/** Used when the device has no local copy of the PINs (new phone, cleared browser, …) */
app.post('/api/pins/verify', auth(true), async (req, res) => {
  try {
    const pin = String((req.body || {}).pin || '');
    const bucket = `pin:${req.user.email}`;
    if (tooManyFails(bucket, 10, 5 * 60 * 1000)) return res.status(429).json({ error: 'Too many wrong PINs. Wait a few minutes.' });
    if (req.user.duressHash && await bcrypt.compare(pin, req.user.duressHash)) { clearFails(bucket); return res.json({ result: 'duress' }); }
    if (req.user.pinHash && await bcrypt.compare(pin, req.user.pinHash)) { clearFails(bucket); return res.json({ result: 'normal' }); }
    noteFail(bucket);
    audit(req, 'security', 'pin_failed', `Wrong stand-down PIN entered by ${req.user.email}`);
    res.json({ result: 'wrong' });
  } catch { res.status(500).json({ error: 'Could not verify PIN' }); }
});

/* ------------------------------------------------------------------ */
/*  Accounts (admin)                                                    */
/* ------------------------------------------------------------------ */
app.get('/api/accounts', auth(true), requireRole('admin'), (_req, res) => {
  res.json({ accounts: store.accounts.map(accountPublic) });
});

/* ---- Responder vetting -------------------------------------------------------------------
 * An admin may only approve a responder after recording that:
 *   1. their identity was checked against an original document,
 *   2. a referee / employer / organisation was contacted, and
 *   3. a clearance or accreditation reference exists (SAPS clearance, PSIRA / HPCSA / EMS registration,
 *      NPO or community-policing-forum letter …).
 * The record expires (SAFEMESH_VETTING_DAYS, default 365). When it lapses the responder is suspended
 * automatically until an admin renews it. Reference + notes stay on the server and never go in the audit log. */
const yes = (v) => v === true || v === 1 || v === '1' || v === 'yes' || v === 'true';
const hasVettingFields = (b) => !!b && (b.idVerified !== undefined || b.refereeContacted !== undefined || b.reference !== undefined);
const readVetting = (b, admin) => ({
  idVerified: yes(b.idVerified), refereeContacted: yes(b.refereeContacted),
  reference: String(b.reference || '').trim().slice(0, 120), notes: String(b.notes || '').trim().slice(0, 500),
  vettedBy: admin.email, vettedAt: Date.now(),
});
const vettingComplete = (v) => !!(v && v.idVerified && v.refereeContacted && String(v.reference || '').trim().length >= 3);
const stampVetting = (v) => { v.legacy = false; v.expiresAt = config.VETTING_VALID_DAYS ? Date.now() + config.VETTING_VALID_DAYS * DAY : null; return v; };
const VETTING_ERR = 'Vetting incomplete — confirm the ID was checked, a referee/employer was contacted, and enter the clearance or accreditation reference.';

app.post('/api/accounts/:email/approve-responder', auth(true), requireRole('admin'), (req, res) => {
  if (!isAdminAcct(req.user)) return res.status(403).json({ error: 'Admin approval required' });
  const email = lc(decodeURIComponent(req.params.email));
  const row = store.accounts.find(a => lc(a.email) === email);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.role !== 'responder') return res.status(400).json({ error: 'Not a responder account' });
  if (lc(row.email) === lc(req.user.email)) return res.status(403).json({ error: 'You cannot approve your own account' });
  let v = null;
  if (hasVettingFields(req.body)) v = readVetting(req.body, req.user);
  else if (row.vetting && vettingComplete(row.vetting) && !row.vetting.legacy && !vettingLapsed(row)) v = row.vetting; // still-valid earlier vetting
  if (!vettingComplete(v)) return res.status(422).json({ error: VETTING_ERR, needsVetting: true });
  row.vetting = stampVetting(v);
  row.responderStatus = 'approved'; row.approvedAt = Date.now(); row.approvedBy = req.user.email; row.suspendedReason = null;
  persist('accounts');
  audit(req, 'account', 'responder_approved', `${req.user.email} approved responder ${row.email} after vetting${row.vetting.expiresAt ? ' (valid until ' + new Date(row.vetting.expiresAt).toISOString().slice(0, 10) + ')' : ''}`, { target: row.email, vettedBy: row.vetting.vettedBy, expiresAt: row.vetting.expiresAt });
  res.json({ ok: true, account: accountPublic(row) });
});

/** Renew vetting for a responder (or reinstate one suspended because vetting lapsed). */
app.post('/api/accounts/:email/revet', auth(true), requireRole('admin'), (req, res) => {
  if (!isAdminAcct(req.user)) return res.status(403).json({ error: 'Admin approval required' });
  const row = store.accounts.find(a => lc(a.email) === lc(decodeURIComponent(req.params.email)));
  if (!row || row.role !== 'responder') return res.status(404).json({ error: 'Responder not found' });
  const reinstating = row.responderStatus === 'revoked' && row.suspendedReason === 'vetting_expired';
  if (row.responderStatus !== 'approved' && !reinstating) return res.status(400).json({ error: 'Only approved responders (or ones suspended for expired vetting) can be re-vetted' });
  if (lc(row.email) === lc(req.user.email)) return res.status(403).json({ error: 'You cannot vet your own account' });
  const v = readVetting(req.body || {}, req.user);
  if (!vettingComplete(v)) return res.status(422).json({ error: VETTING_ERR, needsVetting: true });
  row.vetting = stampVetting(v);
  if (reinstating) { row.responderStatus = 'approved'; row.suspendedReason = null; row.approvedAt = Date.now(); row.approvedBy = req.user.email; }
  persist('accounts');
  audit(req, 'account', reinstating ? 'responder_reinstated' : 'responder_revetted', `${req.user.email} ${reinstating ? 'reinstated' : 're-vetted'} responder ${row.email}${row.vetting.expiresAt ? ' (valid until ' + new Date(row.vetting.expiresAt).toISOString().slice(0, 10) + ')' : ''}`, { target: row.email, expiresAt: row.vetting.expiresAt });
  res.json({ ok: true, account: accountPublic(row) });
});

app.post('/api/accounts/:email/reject-responder', auth(true), requireRole('admin'), (req, res) => {
  const email = lc(decodeURIComponent(req.params.email));
  const row = store.accounts.find(a => lc(a.email) === email);
  if (row) { row.responderStatus = 'rejected'; persist('accounts'); audit(req, 'account', 'responder_rejected', `${req.user.email} rejected responder ${row.email}`, { target: row.email }); }
  res.json({ ok: true });
});

app.post('/api/accounts/:email/revoke-responder', auth(true), requireRole('admin'), (req, res) => {
  const email = lc(decodeURIComponent(req.params.email));
  const row = store.accounts.find(a => lc(a.email) === email);
  if (row) { row.responderStatus = 'revoked'; row.suspendedReason = 'admin'; persist('accounts'); audit(req, 'account', 'responder_revoked', `${req.user.email} revoked responder ${row.email}`, { target: row.email }); }
  res.json({ ok: true });
});

app.post('/api/accounts/:email/set-status', auth(true), requireRole('admin'), (req, res) => {
  const email = lc(decodeURIComponent(req.params.email));
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (email === lc(req.user.email)) return res.status(400).json({ error: 'You cannot approve your own account' });
  const row = store.accounts.find(a => lc(a.email) === email);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.role === 'professional') row.proStatus = status;
  else if (row.role === 'admin') row.adminStatus = status;
  else return res.status(400).json({ error: 'Not applicable' });
  row.reviewedBy = req.user.email; row.reviewedAt = Date.now();
  persist('accounts');
  audit(req, 'account', `${row.role}_${status}`, `${req.user.email} ${status} ${row.role} ${row.email}`, { target: row.email, role: row.role });
  res.json({ ok: true });
});

app.post('/api/accounts/:email/reset-password', auth(true), requireRole('admin'), async (req, res) => {
  try {
    const email = lc(decodeURIComponent(req.params.email));
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const row = store.accounts.find(a => lc(a.email) === email);
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.passwordHash = await bcrypt.hash(String(newPassword), config.BCRYPT_ROUNDS);
    row.passwordResetAt = Date.now(); row.passwordResetBy = req.user.email;
    persist('accounts');
    audit(req, 'security', 'admin_password_reset', `${req.user.email} reset the password of ${row.email}`, { target: row.email });
    res.json({ ok: true, message: `Password reset for ${row.name || email}` });
  } catch { res.status(500).json({ error: 'Reset failed' }); }
});

app.post('/api/accounts/apply-responder', auth(true), (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot become responders' });
  if (req.user.role === 'responder' && req.user.responderStatus === 'approved') return res.status(400).json({ error: 'Already approved as a responder' });
  const { org, job } = req.body || {};
  if (!job) return res.status(400).json({ error: 'Please select your job role' });
  req.user.role = 'responder'; req.user.org = org || 'Community Watch'; req.user.job = job; req.user.responderStatus = 'pending';
  persist('accounts');
  audit(req, 'account', 'responder_applied', `${req.user.email} applied to become a responder (${job})`, { job, org: req.user.org });
  res.json({ ok: true, token: signToken(req.user), user: accountPublic(req.user) });
});

app.get('/api/professionals', auth(false), (_req, res) => {
  res.json({ professionals: store.accounts.filter(a => a.role === 'professional' && a.proStatus === 'approved').map(accountPublic) });
});

app.post('/api/accounts/accepting', auth(true), requireRole('professional'), (req, res) => {
  req.user.accepting = req.user.accepting === false;
  persist('accounts');
  audit(req, 'chat', 'availability', `${req.user.email} is now ${req.user.accepting ? 'accepting' : 'NOT accepting'} new chats`);
  res.json({ ok: true, accepting: req.user.accepting !== false });
});

/* ------------------------------------------------------------------ */
/*  Incidents                                                           */
/* ------------------------------------------------------------------ */
const INCIDENT_STATUSES = ['Pending', 'Acknowledged', 'Dispatched', 'Resolved', 'False Alarm', 'Escalated', 'Archived', 'Duress'];
const OWNER_FIELDS = ['status', 'resolution', 'confirmedByUser', 'isDuress', 'hiddenFromOwner', 'category', 'description', 'escalation'];
const STAFF_FIELDS = ['status', 'acknowledged', 'ackAt', 'acknowledgedBy', 'acknowledgedByName', 'acknowledgedByOrg', 'acknowledgedByJob', 'ackDeclinedAt',
  'dispatched', 'dispatchAt', 'dispatchUnit', 'dispatchedBy', 'responder', 'eta', 'resolution', 'confirmedByUser', 'escalation',
  'responderLat', 'responderLng', 'responderAt'];
const ADMIN_FIELDS = ['forcedBy', 'town', 'province', 'area', 'lat', 'lng', 'isDuress', 'hiddenFromOwner', 'category', 'description'];

app.get('/api/incidents', auth(false), (req, res) => {
  const { province, town, mine } = req.query;
  const u = req.user;
  // A guest (or anonymous reporter) proves ownership with the secret keys of their own alerts
  const keyHashes = new Set(String(req.headers['x-guest-keys'] || '').split(',').map(k => k.trim()).filter(Boolean).slice(0, 50).map(sha256));
  const isMine = (inc) => !!((u && inc.ownerEmail && lc(inc.ownerEmail) === lc(u.email)) || (inc.guestKeyHash && keyHashes.has(inc.guestKeyHash)));
  let list;
  if (isStaff(u) && mine !== '1') {
    list = store.incidents.slice();
    if (province) list = list.filter(i => lc(i.province) === lc(province));
    if (town) list = list.filter(i => lc(i.town) === lc(town));
    if (!province && !isAdminAcct(u)) list = [];
  } else {
    // Everyone else (signed-in users, guests, responders still awaiting approval) sees ONLY their own alerts,
    // and never a duress alert (to the sender it must look cancelled).
    list = store.incidents.filter(i => isMine(i) && !i.hiddenFromOwner && !i.isDuress);
  }
  list.sort((a, b) => b.id - a.id);
  res.json({ incidents: list.map(publicIncident) });
});

app.post('/api/incidents', auth(false), (req, res) => {
  const body = req.body || {};
  const inc = {
    id: (Number.isSafeInteger(Number(body.id)) && Number(body.id) > 0) ? Number(body.id) : Date.now(),
    user: body.user || (req.user && req.user.name) || 'Anonymous',
    // never trust an owner e-mail sent by the browser: it is the signed-in user, or nobody (guest / anonymous)
    ownerEmail: (body.ownerEmail === null || body.anonymous) ? null : (req.user ? req.user.email : null),
    reporterRole: req.user ? req.user.role : 'guest',
    town: body.town || (req.user && req.user.town) || '',
    province: body.province || (req.user && req.user.province) || '',
    area: body.area || '',
    approxLocation: !!body.approxLocation,
    category: (/^admin/i.test(String(body.category || '')) && !isAdminAcct(req.user)) ? 'SOS Emergency' : String(body.category || 'SOS Emergency').slice(0, 60),
    status: (body.status === 'Escalated' && isAdminAcct(req.user)) ? 'Escalated' : (body.status === 'Duress' ? 'Duress' : 'Pending'),
    time: body.time || new Date().toISOString(),
    lat: body.lat ?? null, lng: body.lng ?? null,
    description: String(body.description || '').slice(0, 2000),
    evidenceCount: body.evidenceCount || 0,
    isDuress: !!body.isDuress, hiddenFromOwner: !!body.hiddenFromOwner,
    acknowledged: false, dispatched: false, createdAt: Date.now(),
  };
  const clash = store.incidents.find(i => i.id === inc.id);
  if (clash) {
    // same client retrying (offline queue): answer with what we already stored instead of duplicating
    if (inc.ownerEmail && clash.ownerEmail && lc(clash.ownerEmail) === lc(inc.ownerEmail)) return res.status(200).json({ incident: publicIncident(clash), guestKey: null, duplicate: true });
    inc.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }
  // Incidents with no signed-in owner (guests, anonymous reports) get a secret key so ONLY the sender can stand down / update them
  let guestKey = null;
  if (!inc.ownerEmail) { guestKey = crypto.randomBytes(24).toString('hex'); inc.guestKeyHash = sha256(guestKey); }
  store.incidents.unshift(inc);
  persist('incidents');
  const kind = /silent/i.test(inc.category) ? 'silent_sos' : /sos/i.test(inc.category) ? 'sos' : /admin/i.test(inc.category) ? 'admin_alert' : 'report';
  audit(req, 'incident', kind, `${inc.category} raised by ${inc.user}${inc.reporterRole === 'professional' ? ' (health professional)' : ''} in ${inc.area ? inc.area + ', ' : ''}${inc.town}, ${inc.province}`, {
    incidentId: inc.id, town: inc.town, province: inc.province, hasLocation: inc.lat !== null, reporterRole: inc.reporterRole,
  });
  res.status(201).json({ incident: publicIncident(inc), guestKey });
});

app.patch('/api/incidents/:id', auth(false), (req, res) => {
  const id = Number(req.params.id);
  const row = store.incidents.find(i => i.id === id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const u = req.user;
  const role = u ? u.role : 'guest';
  const isOwner = (!!u && !!row.ownerEmail && lc(row.ownerEmail) === lc(u.email)) || guestKeyOk(req, row);
  const isAdmin = isAdminAcct(u);
  const staff = isStaff(u);
  if (!isOwner && !staff) return res.status(u ? 403 : 401).json({ error: 'You are not allowed to change this incident' });

  const allowed = new Set();
  if (isOwner) OWNER_FIELDS.forEach(f => allowed.add(f));
  if (staff) STAFF_FIELDS.forEach(f => allowed.add(f));
  if (isAdmin) ADMIN_FIELDS.forEach(f => allowed.add(f));

  const body = req.body || {};
  const before = { status: row.status, acknowledged: row.acknowledged, dispatched: row.dispatched, isDuress: row.isDuress };
  const patch = {};
  Object.keys(body).forEach(k => { if (allowed.has(k)) patch[k] = body[k]; });
  if (patch.status !== undefined && !INCIDENT_STATUSES.includes(patch.status)) return res.status(400).json({ error: 'Invalid status' });
  if (patch.description !== undefined) patch.description = String(patch.description).slice(0, 2000);
  Object.assign(row, patch);
  // Who acknowledged / dispatched is stamped by the server from the signed-in account, never taken from the browser
  // (the evidence audit trail relies on it to tell whether a responder has a need to know).
  if (staff && u) {
    if (patch.acknowledged === true && !before.acknowledged) { row.acknowledgedBy = u.email; row.acknowledgedByName = u.name || u.email; }
    if (patch.dispatched === true && !before.dispatched) row.dispatchedBy = u.email;
  }
  row.updatedAt = Date.now();
  persist('incidents');

  const who = u ? (u.name || u.email) : 'Guest';
  if (patch.isDuress && !before.isDuress) audit(req, 'incident', 'duress_escalation', `DURESS PIN used on incident #${id} — silently escalated`, { incidentId: id });
  else if (patch.acknowledged === true && !before.acknowledged) audit(req, 'incident', 'acknowledged', `${who} acknowledged incident #${id} (${row.town})`, { incidentId: id });
  else if (patch.dispatched === true && !before.dispatched) audit(req, 'incident', 'dispatched', `${who} dispatched (${row.dispatchUnit || 'unit'}) to incident #${id}`, { incidentId: id, unit: row.dispatchUnit, eta: row.eta });
  else if (patch.status && patch.status !== before.status) audit(req, 'incident', 'status_change', `${who} set incident #${id} to ${patch.status}${patch.forcedBy ? ' (forced by admin)' : ''}`, { incidentId: id, from: before.status, to: patch.status });
  else if (patch.town || patch.province) audit(req, 'incident', 'reassigned', `${who} reassigned incident #${id} to ${row.town}, ${row.province}`, { incidentId: id });
  // pure location pings (responderLat/Lng) are intentionally not logged — too noisy

  res.json({ incident: publicIncident(row) });
});

app.delete('/api/incidents/:id', auth(true), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  store.incidents = store.incidents.filter(i => i.id !== id);
  persist('incidents');
  audit(req, 'incident', 'deleted', `${req.user.email} deleted incident #${id}`, { incidentId: id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Bulletins & duty                                                    */
/* ------------------------------------------------------------------ */
app.get('/api/bulletins', (req, res) => {
  const { town, province } = req.query;
  if (town && province) {
    const key = `${String(town).toLowerCase()}|${String(province).toLowerCase()}`;
    return res.json({ bulletin: store.bulletins[key] || null });
  }
  res.json({ bulletins: store.bulletins });
});

app.post('/api/bulletins', auth(true), (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'Only approved responders and admins can broadcast' });
  const { town, province, message, kind } = req.body || {};
  if (!town || !province || !message) return res.status(400).json({ error: 'Fill all fields' });
  const key = `${town.toLowerCase()}|${province.toLowerCase()}`;
  const bulletin = { message, at: Date.now(), org: req.user.org || req.user.name || 'SafeMesh', town, province, kind: kind || 'community' };
  store.bulletins[key] = bulletin;
  persist('bulletins');
  audit(req, 'bulletin', kind === 'emergency' ? 'emergency_broadcast' : 'broadcast', `${req.user.email} broadcast to ${town}, ${province}`, { town, province, kind: bulletin.kind });
  res.json({ bulletin });
});

app.get('/api/duty', auth(true), (req, res) => res.json({ duty: isStaff(req.user) ? store.duty : {} }));

app.post('/api/duty', auth(true), (req, res) => {
  const { on, radiusKm, lat, lng, town, province } = req.body || {};
  const email = req.user.email;
  const existing = store.duty[email] || { on: false, radiusKm: 5 };
  const entry = {
    on: on !== undefined ? !!on : !!existing.on,
    radiusKm: radiusKm !== undefined ? Number(radiusKm) || 5 : (existing.radiusKm || 5),
    lat: lat !== undefined ? lat : (existing.lat ?? null),
    lng: lng !== undefined ? lng : (existing.lng ?? null),
    town: town || existing.town || req.user.town || '',
    province: province || existing.province || req.user.province || '',
    updatedAt: Date.now(),
  };
  store.duty[email] = entry;
  persist('duty');
  if (on !== undefined && !!on !== !!existing.on) audit(req, 'duty', on ? 'on_duty' : 'off_duty', `${req.user.email} went ${on ? 'ON' : 'OFF'} duty`, { town: entry.town, province: entry.province });
  res.json({ duty: entry });
});

/* ------------------------------------------------------------------ */
/*  Counselling chat                                                    */
/* ------------------------------------------------------------------ */
app.get('/api/chats', auth(true), (req, res) => {
  const withEmail = req.query.with;
  const me = lc(req.user.email);
  const isPro = req.user.role === 'professional';
  let rows = store.chats.filter(m => (isPro ? lc(m.p) : lc(m.u)) === me);
  if (withEmail) rows = rows.filter(m => (isPro ? lc(m.u) : lc(m.p)) === lc(withEmail));
  rows = rows.slice().sort((a, b) => a.at - b.at).map(m => ({
    ...m,
    uName: m.uName || nameOf(m.u),
    pName: m.pName || nameOf(m.p),
  }));
  res.json({ messages: rows });
});

app.post('/api/chats', auth(true), (req, res) => {
  const { text, proEmail, userEmail } = req.body || {};
  const t = String(text || '').trim().slice(0, 2000);
  if (!t) return res.status(400).json({ error: 'Empty message' });
  const isPro = req.user.role === 'professional';
  if (req.user.role === 'admin' || req.user.role === 'responder') return res.status(403).json({ error: 'Only users and health professionals can use chat' });
  const u = lc(isPro ? userEmail : req.user.email);
  const p = lc(isPro ? req.user.email : proEmail);
  if (!u || !p) return res.status(400).json({ error: 'Missing chat participants' });
  if (u === p) return res.status(400).json({ error: 'You cannot message yourself' });

  const proRow = store.accounts.find(a => lc(a.email) === p && a.role === 'professional');
  const userRow = store.accounts.find(a => lc(a.email) === u);
  if (!proRow || proRow.proStatus !== 'approved') return res.status(404).json({ error: 'That professional is not verified yet' });
  if (!userRow) return res.status(404).json({ error: 'Client account not found' });

  const hasThread = store.chats.some(m => lc(m.u) === u && lc(m.p) === p);
  if (isPro && !hasThread) return res.status(403).json({ error: 'A client must message you first' });
  if (!isPro && proRow.accepting === false && !hasThread) return res.status(403).json({ error: 'This professional is not accepting new chats right now' });

  const msg = {
    id: Date.now() + Math.random(), u, p, from: isPro ? 'pro' : 'user', text: t, at: Date.now(),
    uName: userRow.name || userRow.email, pName: proRow.name || proRow.email, readAt: null,
  };
  store.chats.push(msg);
  persist('chats');
  audit(req, 'chat', 'message_sent', `${isPro ? 'Professional' : 'User'} ${req.user.email} sent a counselling message (content not logged)`, { thread: `${u} ⇄ ${p}`, from: msg.from });
  res.status(201).json({ message: msg });
});

/** Marks the other side's messages in a thread as read (powers the unread badge). */
app.post('/api/chats/read', auth(true), (req, res) => {
  const withEmail = lc((req.body || {}).with);
  if (!withEmail) return res.status(400).json({ error: 'Missing thread' });
  const me = lc(req.user.email);
  const isPro = req.user.role === 'professional';
  let n = 0;
  store.chats.forEach(m => {
    const mine = isPro ? lc(m.p) === me && lc(m.u) === withEmail : lc(m.u) === me && lc(m.p) === withEmail;
    if (mine && m.from !== (isPro ? 'pro' : 'user') && !m.readAt) { m.readAt = Date.now(); n += 1; }
  });
  if (n) persistLater('chats');
  res.json({ ok: true, marked: n });
});

/* ------------------------------------------------------------------ */
/*  Evidence  (protected: owner, approved responders and admins only)   */
/* ------------------------------------------------------------------ */
// File links are signed: /api/evidence/:id/file?t=…  The token is only handed out by the list endpoint
// to people who are allowed to see the file, and it expires after 10–20 minutes. <img>/<audio> tags
// cannot send an Authorization header, which is why a short-lived signed link is used.
const EV_BUCKET_MS = 10 * 60 * 1000;
const b64u = (v) => Buffer.from(String(v || '')).toString('base64url');
/** Signed link = <10-minute bucket>.<who it was issued to>.<signature>. Binding the link to a person means the
 *  audit trail names the right staff member even though <audio>/<img> tags cannot send a login header. */
function evToken(id, who, bucket = Math.floor(Date.now() / EV_BUCKET_MS)) {
  const w = b64u(who);
  const sig = crypto.createHmac('sha256', config.JWT_SECRET).update(`ev:${id}:${bucket}:${w}`).digest('hex').slice(0, 40);
  return `${bucket}.${w}.${sig}`;
}
function evTokenCheck(id, tok) {
  const [b, w, sig] = String(tok || '').split('.');
  const bucket = Number(b), cur = Math.floor(Date.now() / EV_BUCKET_MS);
  if (!Number.isFinite(bucket) || !sig || w === undefined || bucket > cur || cur - bucket > 1) return null;
  const who = Buffer.from(w, 'base64url').toString();
  return safeEq(evToken(id, who, bucket), `${b}.${w}.${sig}`) ? { who } : null;
}
const evUrl = (ev, who) => `/api/evidence/${ev.id}/file?t=${evToken(ev.id, who)}`;
const incidentOf = (ev) => (ev.incidentId ? store.incidents.find(i => i.id === ev.incidentId) : null);
/** 'owner' | 'staff' | null  (staff = admin, or an approved + currently-vetted responder, for evidence tied to an incident) */
function evAccess(req, ev) {
  const u = req.user, inc = incidentOf(ev);
  if (u && lc(ev.ownerEmail) === lc(u.email)) return 'owner';
  if (inc && guestKeyOk(req, inc)) return 'owner';
  if (isAdminAcct(u)) return 'staff';
  if (isApprovedResponder(u) && inc) return 'staff';
  return null;
}
const evPublic = (e, viewer) => ({
  id: e.id, incidentId: e.incidentId, ownerEmail: isStaff(viewer) ? undefined : e.ownerEmail, fileName: e.fileName,
  mimeType: e.mimeType, kind: e.kind, size: e.size, duration: e.duration, keep: !!e.keep, url: evUrl(e, viewer ? viewer.email : ''),
});

/* ---- Audit trail: every time STAFF open a survivor's evidence --------------------------------
 * One entry per person per file per 5 minutes (audio/video players re-request the file while seeking).
 * The entry records who, which file/incident, and whether they are the responder who acknowledged the alert. */
const evOpenSeen = new Map(), evDeniedSeen = new Map();
function pruneSeen(m, ms) { if (m.size < 2000) return; const cut = Date.now() - ms; for (const [k, t] of m) if (t < cut) m.delete(k); }
function auditEvidenceOpened(req, actor, row, via) {
  const key = lc(actor.email) + '|' + row.id, now = Date.now();
  if ((evOpenSeen.get(key) || 0) > now - config.EVIDENCE_AUDIT_DEDUPE_MS) return;
  evOpenSeen.set(key, now); pruneSeen(evOpenSeen, config.EVIDENCE_AUDIT_DEDUPE_MS);
  const inc = incidentOf(row);
  const assigned = !!(inc && inc.acknowledgedBy && lc(inc.acknowledgedBy) === lc(actor.email));
  const note = actor.role === 'admin' || assigned ? '' : ' — not the acknowledging responder';
  const prev = req.user; req.user = actor;
  audit(req, 'evidence', 'opened_by_staff', `${actor.name || actor.email} (${actor.role}) opened ${row.kind || 'file'} evidence${inc ? ' for incident #' + inc.id : ''}${note}`,
    { evidenceId: row.id, incidentId: row.incidentId, kind: row.kind, via, acknowledgingResponder: assigned });
  req.user = prev;
}
function auditEvidenceDenied(req, row) {
  const key = (req.ip || '') + '|' + row.id, now = Date.now();
  if ((evDeniedSeen.get(key) || 0) > now - 10 * 60 * 1000) return;
  evDeniedSeen.set(key, now); pruneSeen(evDeniedSeen, 10 * 60 * 1000);
  audit(req, 'security', 'evidence_denied', `Evidence link rejected (expired or not allowed) for file ${String(row.id).slice(0, 8)}…`, { evidenceId: row.id, incidentId: row.incidentId });
}

app.post('/api/evidence', auth(false), upload.single('file'), (req, res) => {
  const drop = () => { try { if (req.file) fs.unlinkSync(req.file.path); } catch {} };
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const incidentId = req.body.incidentId ? Number(req.body.incidentId) : null;
    const inc = incidentId ? store.incidents.find(i => i.id === incidentId) : null;
    let ownerEmail = null;
    if (inc) {
      if (req.user && inc.ownerEmail && lc(inc.ownerEmail) === lc(req.user.email)) ownerEmail = req.user.email;
      else if (guestKeyOk(req, inc)) ownerEmail = inc.ownerEmail || 'guest-session';
    } else if (req.user && !incidentId) {
      ownerEmail = req.user.email;
    }
    if (!ownerEmail) { drop(); return res.status(req.user ? 403 : 401).json({ error: 'You can only add evidence to your own report' }); }
    const id = uuidv4();
    const kind = String(req.body.kind || 'file').slice(0, 20);
    const ev = {
      id, incidentId, ownerEmail, fileName: String(req.file.originalname || 'file').slice(0, 120), mimeType: req.file.mimetype,
      kind, size: req.file.size, duration: Number(req.body.duration) || null, keep: false, createdAt: Date.now(), storagePath: req.file.filename,
    };
    store.evidence.push(ev);
    persist('evidence');
    if (inc) { inc.evidenceCount = (inc.evidenceCount || 0) + 1; persist('incidents'); }
    audit(req, 'evidence', 'uploaded', `Evidence uploaded (${kind}, ${Math.round(ev.size / 1024)} KB)${incidentId ? ' for incident #' + incidentId : ''}`, { evidenceId: id, incidentId, kind, size: ev.size });
    res.status(201).json({ evidence: evPublic(ev, req.user) });
  } catch (err) {
    drop();
    console.error('upload', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/evidence', auth(false), (req, res) => {
  const { incidentId, mine, province, town, all } = req.query;
  const u = req.user;
  let rows = [];
  if (incidentId) rows = store.evidence.filter(e => e.incidentId === Number(incidentId));
  else if (mine === '1' && u) rows = store.evidence.filter(e => lc(e.ownerEmail) === lc(u.email));
  else if (isAdminAcct(u) && all === '1') rows = store.evidence.slice();
  else if (isStaff(u) && province) {
    const ids = new Set(store.incidents.filter(i => lc(i.province) === lc(province) && (!town || lc(i.town) === lc(town))).map(i => i.id));
    rows = store.evidence.filter(e => e.incidentId && ids.has(e.incidentId));
  }
  res.json({ evidence: rows.filter(e => evAccess(req, e)).map(e => evPublic(e, u)) });
});

app.get('/api/evidence/:id/file', auth(false), (req, res) => {
  const row = store.evidence.find(e => e.id === req.params.id);
  if (!row || !row.storagePath) return res.status(404).json({ error: 'Not found' });

  let access = null, actor = null, via = 'session';
  if (req.user) { access = evAccess(req, row); actor = req.user; }
  if (!access) {
    const t = evTokenCheck(row.id, req.query.t);
    if (t) {
      via = 'signed_link';
      if (t.who) {
        // re-check the person the link was issued to: if their access was revoked since, the link stops working
        const holder = store.accounts.find(a => lc(a.email) === lc(t.who));
        const a2 = holder ? evAccess({ user: holder, headers: req.headers }, row) : null;
        if (a2) { access = a2; actor = holder; }
      } else { access = 'owner'; }    // link issued to a guest who holds the alert's secret key
    }
  }
  if (!access) { auditEvidenceDenied(req, row); return res.status(401).json({ error: 'This link has expired or you do not have access' }); }
  if (access === 'staff') auditEvidenceOpened(req, actor, row, via);

  const fp = path.join(UPLOAD_DIR, path.basename(row.storagePath));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', EV_ALLOWED.test(row.mimeType || '') ? row.mimeType : 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.fileName || 'file')}"`);
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');   // do not leave survivor evidence in shared caches
  res.sendFile(fp);   // supports Range requests (audio/video seeking on iPhone needs this)
});

app.delete('/api/evidence/:id', auth(false), (req, res) => {
  const row = store.evidence.find(e => e.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (evAccess(req, row) !== 'owner') return res.status(req.user ? 403 : 401).json({ error: 'Only the owner may delete evidence' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(row.storagePath || ''))); } catch {}
  store.evidence = store.evidence.filter(e => e.id !== row.id);
  persist('evidence');
  audit(req, 'evidence', 'deleted', `${req.user ? req.user.email : 'A guest'} deleted an evidence file`, { evidenceId: row.id, incidentId: row.incidentId });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Safe houses                                                         */
/* ------------------------------------------------------------------ */
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

app.get('/api/safehouses', auth(false), (req, res) => {
  const { province, town } = req.query;
  let list = store.safehouses.slice();
  if (province) list = list.filter(s => lc(s.province) === lc(province));
  if (town) list = list.filter(s => lc(s.town) === lc(town));
  const isAdmin = req.user && req.user.role === 'admin';
  const isResponder = req.user && req.user.role === 'responder';
  if (!isAdmin) {
    list = list.filter(s => {
      const approved = s.status === 'approved' || (s.verified === true && s.status !== 'rejected' && s.status !== 'pending');
      if (approved) return true;
      // responders also see their own pending/rejected submissions
      return isResponder && lc(s.createdBy) === lc(req.user.email);
    });
  }
  res.json({ safehouses: list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) });
});

app.post('/api/safehouses', auth(true), (req, res) => {
  if (!['responder', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only responders or admins can add safe houses' });
  if (req.user.role === 'responder' && !isApprovedResponder(req.user)) {
    return res.status(403).json({ error: 'Responder account must be approved (and vetting current) first' });
  }
  const { name, address, town, province, lat, lng, notes, phone } = req.body || {};
  if (!name || !town || !province) return res.status(400).json({ error: 'Name, town and province are required' });
  const isAdmin = req.user.role === 'admin';
  const row = {
    id: Date.now() + Math.random(),
    name: String(name).trim().slice(0, 120),
    address: String(address || '').trim().slice(0, 200),
    town: String(town).trim(),
    province: String(province).trim(),
    lat: num(lat), lng: num(lng),
    notes: String(notes || '').trim().slice(0, 500),
    phone: String(phone || '').trim().slice(0, 30),
    verified: isAdmin,
    status: isAdmin ? 'approved' : 'pending',
    verifiedBy: isAdmin ? req.user.email : null,
    verifiedAt: isAdmin ? Date.now() : null,
    createdBy: req.user.email,
    createdByName: req.user.name,
    createdByRole: req.user.role,
    createdAt: Date.now(),
  };
  store.safehouses.unshift(row);
  persist('safehouses');
  audit(req, 'safehouse', 'created', `${req.user.email} added safe house "${row.name}" in ${row.town} (${isAdmin ? 'auto-verified' : 'awaiting verification'})`, { safehouseId: row.id, status: row.status });
  res.status(201).json({ safehouse: row });
});

app.patch('/api/safehouses/:id', auth(true), (req, res) => {
  const id = Number(req.params.id);
  const row = store.safehouses.find(s => Number(s.id) === id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const isAdmin = req.user.role === 'admin';
  const isOwner = lc(row.createdBy) === lc(req.user.email);
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed' });
  const body = req.body || {};
  if (isAdmin) {
    if (body.status !== undefined) {
      if (!['approved', 'pending', 'rejected'].includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
      row.status = body.status;
      row.verified = body.status === 'approved';
      row.verifiedBy = body.status === 'approved' ? req.user.email : null;
      row.verifiedAt = body.status === 'approved' ? Date.now() : null;
      audit(req, 'safehouse', body.status === 'approved' ? 'verified' : body.status, `${req.user.email} set safe house "${row.name}" to ${body.status}`, { safehouseId: row.id });
    } else if (body.verified !== undefined) {
      row.verified = !!body.verified;
      if (row.verified) { row.status = 'approved'; row.verifiedBy = req.user.email; row.verifiedAt = Date.now(); }
      audit(req, 'safehouse', row.verified ? 'verified' : 'unverified', `${req.user.email} ${row.verified ? 'verified' : 'unverified'} safe house "${row.name}"`, { safehouseId: row.id });
    }
  }
  ['name', 'address', 'town', 'province', 'notes', 'phone'].forEach(k => {
    if (body[k] !== undefined) row[k] = String(body[k]).trim();
  });
  if (body.lat !== undefined) row.lat = num(body.lat);
  if (body.lng !== undefined) row.lng = num(body.lng);
  row.updatedAt = Date.now();
  persist('safehouses');
  res.json({ safehouse: row });
});

app.delete('/api/safehouses/:id', auth(true), (req, res) => {
  const id = Number(req.params.id);
  const row = store.safehouses.find(s => Number(s.id) === id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const isAdmin = req.user.role === 'admin';
  const isOwner = lc(row.createdBy) === lc(req.user.email);
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed' });
  store.safehouses = store.safehouses.filter(s => Number(s.id) !== id);
  persist('safehouses');
  audit(req, 'safehouse', 'deleted', `${req.user.email} deleted safe house "${row.name}"`, { safehouseId: row.id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Reverse geocoding (GPS → real town / province)                      */
/* ------------------------------------------------------------------ */
const geoCache = new Map();
let lastGeoCall = 0;
app.get('/api/geo/reverse', auth(false), async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Bad coordinates' });
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return res.json(hit.data);
  const wait = 1100 - (Date.now() - lastGeoCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));   // Nominatim policy: max 1 request / second
  lastGeoCall = Date.now();
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`, {
      signal: ctl.signal,
      headers: { 'User-Agent': `SafeMesh/${config.APP_VERSION} (community safety app)`, Accept: 'application/json' },
    });
    clearTimeout(tm);
    if (!r.ok) return res.status(502).json({ error: 'Geocoder unavailable' });
    const j = await r.json();
    const data = { address: j.address || {}, display_name: j.display_name || '' };
    geoCache.set(key, { at: Date.now(), data });
    if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Geocoder unavailable' });
  }
});

/* ------------------------------------------------------------------ */
/*  Client-side events worth recording (whitelisted, rate-limited)      */
/* ------------------------------------------------------------------ */
const CLIENT_EVENTS = {
  tracking_on: ['duty', 'Live location tracking switched ON'],
  tracking_off: ['duty', 'Live location tracking switched OFF'],
  location_detected: ['system', 'Location detected from GPS'],
  gps_denied: ['system', 'Location permission denied / unavailable'],
  quick_exit: ['security', 'Quick Exit button used'],
  fake_call: ['security', 'Fake call started'],
  checkin_started: ['security', 'Check-in timer started'],
  checkin_missed: ['incident', 'Check-in timer expired without confirmation'],
  recording_started: ['evidence', 'Audio recording started'],
};
const eventBuckets = new Map();
app.post('/api/logs/event', auth(false), (req, res) => {
  const { type, detail } = req.body || {};
  const def = CLIENT_EVENTS[type];
  if (!def) return res.status(400).json({ error: 'Unknown event' });
  const key = (req.user ? req.user.email : req.ip);
  const b = eventBuckets.get(key) || { n: 0, at: Date.now() };
  if (Date.now() - b.at > 60000) { b.n = 0; b.at = Date.now(); }
  b.n += 1; eventBuckets.set(key, b);
  if (b.n > 30) return res.status(429).json({ error: 'Slow down' });
  const who = req.user ? (req.user.name || req.user.email) : 'A guest';
  audit(req, def[0], type, `${who}: ${def[1]}${detail ? ' — ' + String(detail).slice(0, 120) : ''}`);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Audit log (admin only)                                              */
/* ------------------------------------------------------------------ */
app.get('/api/logs', auth(true), requireRole('admin'), (req, res) => {
  const { category, q, actor, since } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 5000);
  let rows = store.logs;
  if (category && category !== 'all') rows = rows.filter(l => l.category === category);
  if (actor) rows = rows.filter(l => lc(l.actor).includes(lc(actor)));
  if (since) rows = rows.filter(l => l.at >= Number(since));
  if (q) {
    const needle = lc(q);
    rows = rows.filter(l => lc(`${l.summary} ${l.actor} ${l.action} ${l.ip}`).includes(needle));
  }
  const total = rows.length;
  const out = rows.slice(-limit).reverse();
  const counts = {};
  store.logs.forEach(l => { counts[l.category] = (counts[l.category] || 0) + 1; });
  res.json({ logs: out, total, counts, all: store.logs.length });
});

/* ------------------------------------------------------------------ */
/*  CSP violation reports (browsers send these automatically)           */
/* ------------------------------------------------------------------ */
const cspSeen = new Map(); const cspPerIp = new Map();
app.post('/api/csp-report', (req, res) => {
  res.status(204).end();
  try {
    const now = Date.now(), ip = req.ip || '';
    const c = (cspPerIp.get(ip) || []).filter(t => now - t < 3600000);
    if (c.length >= 30) return; c.push(now); cspPerIp.set(ip, c);
    const b = req.body || {};
    const r = b['csp-report'] || (Array.isArray(b) && b[0] && b[0].body) || b;
    const directive = String(r['violated-directive'] || r.effectiveDirective || r['effective-directive'] || '').slice(0, 60);
    const blocked = String(r['blocked-uri'] || r.blockedURL || '').slice(0, 100);
    const source = String(r['source-file'] || r.sourceFile || r['document-uri'] || r.documentURL || '').replace(/[?#].*$/, '').slice(0, 100);
    const key = directive + '|' + blocked + '|' + source;
    if ((cspSeen.get(key) || 0) > now - 3600000) return;
    cspSeen.set(key, now); pruneSeen(cspSeen, 3600000);
    audit(req, 'security', 'csp_violation', `CSP ${CSP_MODE === 'enforce' ? 'blocked' : 'would block'}: ${directive || 'unknown'} — ${blocked || 'inline'} (${source || 'page'})`, { directive, blocked, source, mode: CSP_MODE });
  } catch { /* never let a bad report break anything */ }
});

/* ------------------------------------------------------------------ */
/*  Responder vetting expiry                                            */
/* ------------------------------------------------------------------ */
function enforceVetting() {
  if (!config.VETTING_VALID_DAYS) return;
  const now = Date.now(); let changed = false;
  for (const a of store.accounts) {
    if (a.role !== 'responder' || a.responderStatus !== 'approved') continue;
    if (!a.vetting) {
      // approved before vetting existed: grace period, then they must be vetted
      a.vetting = { legacy: true, vettedAt: null, vettedBy: null, expiresAt: now + config.VETTING_LEGACY_GRACE_DAYS * DAY };
      changed = true;
      audit(null, 'account', 'vetting_grace_started', `${a.email} was approved before vetting existed — must be vetted within ${config.VETTING_LEGACY_GRACE_DAYS} days`, { target: a.email });
    } else if (a.vetting.expiresAt && a.vetting.expiresAt <= now) {
      a.responderStatus = 'revoked'; a.suspendedReason = 'vetting_expired'; changed = true;
      audit(null, 'account', 'responder_vetting_expired', `Responder ${a.email} suspended — vetting expired`, { target: a.email });
    }
  }
  if (changed) persist('accounts');
}
enforceVetting();
setInterval(enforceVetting, 60 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (path.extname(req.path)) return res.status(404).send('Not found');   // missing file, not an app route
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message });
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: 'Server error' });
});

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

/** Real certificate from SAFEMESH_TLS_CERT / SAFEMESH_TLS_KEY, or a self-signed one for local testing (--https). */
function loadTls() {
  const certFile = process.env.SAFEMESH_TLS_CERT, keyFile = process.env.SAFEMESH_TLS_KEY;
  if (certFile && keyFile) return { opts: { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, selfSigned: false };
  if (!wantTls) return null;
  try {
    const dir = path.join(DATA_DIR, 'certs'), k = path.join(dir, 'key.pem'), c = path.join(dir, 'cert.pem'), sig = path.join(dir, 'hosts.txt');
    const ips = lanIPs(), hosts = ips.join(',');
    if (!(fs.existsSync(k) && fs.existsSync(c) && fs.existsSync(sig) && fs.readFileSync(sig, 'utf8') === hosts)) {
      const selfsigned = require('selfsigned');
      const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...ips.map((ip) => ({ type: 7, ip }))];
      const pems = selfsigned.generate([{ name: 'commonName', value: 'SafeMesh (local test certificate)' }], { days: 365, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }] });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(k, pems.private, { mode: 0o600 }); fs.writeFileSync(c, pems.cert); fs.writeFileSync(sig, hosts);
    }
    return { opts: { cert: fs.readFileSync(c), key: fs.readFileSync(k) }, selfSigned: true };
  } catch (e) {
    console.error('  ✖ Could not start HTTPS: ' + e.message + ' (run "npm install" in backend/). Starting with plain HTTP.');
    return null;
  }
}

const tls = loadTls();
usingSelfSigned = !!(tls && tls.selfSigned);
const server = tls ? https.createServer(tls.opts, app) : http.createServer(app);
const scheme = tls ? 'https' : 'http';

server.listen(config.PORT, () => {
  audit(null, 'system', 'server_start', `SafeMesh server v${config.APP_VERSION} started on port ${config.PORT} (${scheme.toUpperCase()}${usingSelfSigned ? ', self-signed' : ''}, CSP ${CSP_MODE})`);
  console.log('');
  console.log('  SafeMesh API + frontend  v' + config.APP_VERSION);
  console.log(`  → ${scheme}://localhost:${config.PORT}`);
  if (tls) lanIPs().forEach((ip) => console.log(`  → ${scheme}://${ip}:${config.PORT}   (other devices on your network)`));
  console.log('  Database: SQLite (' + db.driver + ') → ' + path.relative(process.cwd(), db.DB_FILE));
  console.log(`  Security: ${tls ? (usingSelfSigned ? 'HTTPS with a self-signed TEST certificate (browsers show a one-time warning)' : 'HTTPS with your certificate') : 'plain HTTP'} · CSP ${CSP_MODE}${FORCE_HTTPS ? ' · redirecting http→https' : ''}`);
  if (!tls && !FORCE_HTTPS) console.log('  ⚠  Not using HTTPS. GPS, microphone and install only work on localhost or HTTPS. Use "npm run start:https" to test, or put a TLS proxy (Caddy) in front — see docs/DEPLOYMENT.md.');
  if (FORCE_HTTPS && !tls && !process.env.TRUST_PROXY) console.log('  ⚠  FORCE_HTTPS is on without TLS here. Behind a reverse proxy? Set TRUST_PROXY=true so its X-Forwarded-Proto is trusted.');
  if (!mailer.isConfigured()) console.log('  ⚠  No e-mail/SMS provider set — password-reset codes ' + (IS_PROD ? 'CANNOT be delivered' : 'print in this console (dev only)') + '. See .env.example.');
  ensureVendor().catch(() => {});
  if (config.USING_DEV_MASTER_KEY) console.log('  ⚠  Using the built-in DEV master key. Set SAFEMESH_ADMIN_KEY in .env before going live.');
  if (config.USING_DEV_JWT_SECRET) console.log('  ⚠  Using the built-in DEV JWT secret. Set SAFEMESH_JWT_SECRET in .env before going live.');
  console.log('  First admin: Create Account → Admin → enter the master key.');
  console.log('');
});

// optional: also listen on plain HTTP just to redirect to HTTPS (e.g. SAFEMESH_HTTP_REDIRECT_PORT=80)
if (tls && process.env.SAFEMESH_HTTP_REDIRECT_PORT) {
  http.createServer((req, res) => {
    const host = process.env.SAFEMESH_PUBLIC_HOST || String(req.headers.host || '').replace(/:\d+$/, '') + (config.PORT === 443 ? '' : ':' + config.PORT);
    res.writeHead(308, { Location: 'https://' + host + req.url }); res.end();
  }).listen(Number(process.env.SAFEMESH_HTTP_REDIRECT_PORT));
}
