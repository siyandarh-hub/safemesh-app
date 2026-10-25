#!/usr/bin/env node
/**
 * Creates your .env with freshly generated secrets, on THIS machine (nothing is sent anywhere).
 *
 *   node tools/setup.js                       local / testing .env
 *   node tools/setup.js --production --domain safemesh.example.co.za --email you@example.co.za
 *   node tools/setup.js --force               regenerate (signs everyone out, old admin key stops working)
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env'), example = path.join(root, '.env.example');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const fail = (m) => { console.error('\n  ✖ ' + m + '\n'); process.exit(1); };

if (fs.existsSync(envFile) && !flag('force')) {
  console.log('\n  ✔ .env already exists — left untouched.');
  console.log('    (Use --force to regenerate. That signs everyone out and the old admin key stops working.)\n');
  process.exit(0);
}
if (!fs.existsSync(example)) fail('.env.example not found — run this from the SafeMesh folder.');

let text = fs.readFileSync(example, 'utf8');
const set = (key, val) => {
  const re = new RegExp('^#?[ \\t]*' + key + '=.*$', 'm');
  text = re.test(text) ? text.replace(re, () => key + '=' + val) : text.replace(/\s*$/, '\n') + key + '=' + val + '\n';
};

set('SAFEMESH_ADMIN_KEY', crypto.randomBytes(32).toString('hex'));
set('SAFEMESH_JWT_SECRET', crypto.randomBytes(48).toString('hex'));

if (flag('production')) {
  const domain = (opt('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const email = (opt('email') || '').trim();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) fail('Production needs --domain, e.g.  --domain safemesh.mycompany.co.za  (no https://)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Production needs --email, e.g.  --email you@mycompany.co.za  (an inbox you read)');
  set('NODE_ENV', 'production'); set('TRUST_PROXY', 'true'); set('FORCE_HTTPS', 'true');
  set('DOMAIN', domain); set('ACME_EMAIL', email); set('SAFEMESH_PUBLIC_HOST', domain);
  set('SAFEMESH_CSP', 'report-only');
}

fs.writeFileSync(envFile, text, { mode: 0o600 });
try { fs.chmodSync(envFile, 0o600); } catch { /* Windows */ }

console.log('\n  ✔ Created .env with new random SAFEMESH_ADMIN_KEY and SAFEMESH_JWT_SECRET.');
console.log('    • Open .env to copy the admin key into a password manager — you need it to create the FIRST admin.');
console.log('    • Never share, commit or paste .env anywhere.');
if (flag('production')) {
  console.log('    • Production values set (domain, HTTPS redirect, proxy trust). CSP starts in report-only: after your smoke test delete the SAFEMESH_CSP line.');
  console.log('    • Still to add yourself: an SMS and/or e-mail provider (see the "Password-reset codes" section of .env).');
}
console.log('');
