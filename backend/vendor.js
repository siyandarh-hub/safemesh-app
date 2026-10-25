/**
 * Self-hosts the front-end libraries (Leaflet + heat plugin; Tailwind is pre-built into frontend/tailwind.css) under frontend/vendor/ so the app does
 * not depend on third-party CDNs at run time (privacy: users' IPs are not sent to unpkg / tailwindcss.com;
 * reliability: works when those CDNs are blocked or down; the service worker can cache them for offline use).
 *
 * Runs automatically when the server starts (needs internet once) or manually:  npm run vendor
 * Leaflet files are checked against the same SHA-256 hashes the old CDN tags used.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'frontend', 'vendor');
const L = 'https://unpkg.com/leaflet@1.9.4/dist/';
const FILES = [
  { name: 'leaflet.js', url: L + 'leaflet.js', sri: '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' },
  { name: 'leaflet.css', url: L + 'leaflet.css', sri: 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' },
  { name: 'leaflet-heat.js', url: 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js', min: 1000 },
  ...['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png']
    .map((n) => ({ name: 'images/' + n, url: L + 'images/' + n, min: 200 })),
];

const missing = () => FILES.filter((f) => !fs.existsSync(path.join(DIR, f.name)));

async function download(f) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(f.url, { signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (f.min && buf.length < f.min) throw new Error('file too small — download looks wrong');
    if (f.sri) {
      const got = crypto.createHash('sha256').update(buf).digest('base64');
      if (got !== f.sri) throw new Error('hash mismatch (file was changed in transit)');
    }
    const dest = path.join(DIR, f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest + '.part', buf);
    fs.renameSync(dest + '.part', dest);
    return true;
  } finally { clearTimeout(tm); }
}

async function ensureVendor({ quiet = false } = {}) {
  const todo = missing();
  if (!todo.length) { if (!quiet) console.log('  ✔ Front-end libraries are self-hosted (frontend/vendor)'); return true; }
  if (!quiet) console.log(`  ↓ Downloading ${todo.length} front-end file(s) to frontend/vendor …`);
  let ok = true;
  for (const f of todo) {
    try { await download(f); }
    catch (e) { ok = false; console.warn(`  ✖ ${f.name}: ${e.message}`); }
  }
  if (ok && !quiet) console.log('  ✔ Front-end libraries downloaded — the app no longer needs the CDNs');
  if (!ok && !quiet) console.warn('  ⚠ Some files could not be downloaded. The app falls back to the CDNs until you run "npm run vendor" with internet access.');
  return ok;
}

module.exports = { ensureVendor, missing };
if (require.main === module) ensureVendor().then((ok) => process.exit(ok ? 0 : 1));
