/**
 * SafeMesh database — SQLite (single file: data/safemesh.db)
 *
 * Why this is better than the old JSON files:
 *  - every change is a small transaction (no more rewriting whole files)
 *  - WAL mode + atomic commits: a crash or power cut cannot corrupt your data
 *  - you can open data/safemesh.db with any SQLite tool to inspect or back it up
 *
 * How it works: each collection (accounts, incidents, …) lives in its own table.
 * The server keeps a working copy in memory for speed and `persist(key)` writes ONLY the rows
 * that changed. The route code in index.js did not have to change.
 *
 * Driver: uses `better-sqlite3` when installed (npm install does this), otherwise Node's
 * built-in `node:sqlite` (Node 22.5+). Old data/*.json files are imported automatically on first run.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.SAFEMESH_DB_FILE || path.join(DATA_DIR, 'safemesh.db');

/* ---------- driver (better-sqlite3 → node:sqlite) ---------- */
function openDriver(file) {
  try {
    const Better = require('better-sqlite3');
    const db = new Better(file);
    return { name: 'better-sqlite3', db, exec: (sql) => db.exec(sql), prepare: (sql) => db.prepare(sql) };
  } catch (e1) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(file);
      return { name: 'node:sqlite', db, exec: (sql) => db.exec(sql), prepare: (sql) => db.prepare(sql) };
    } catch (e2) {
      console.error('\n  ✖ No SQLite driver available.\n    Run "npm install" inside the backend folder (installs better-sqlite3),\n    or use Node 22.5+ which has SQLite built in.\n');
      throw e2;
    }
  }
}
const drv = openDriver(DB_FILE);
drv.exec('PRAGMA journal_mode = WAL;');
drv.exec('PRAGMA synchronous = NORMAL;');
drv.exec('PRAGMA busy_timeout = 5000;');

/* ---------- schema ---------- */
// kind 'array' = list of objects keyed by `id(obj)`;  'map' = object of key → value
const SCHEMA = {
  accounts:   { kind: 'array', id: (o) => String(o.email || '').toLowerCase() },
  incidents:  { kind: 'array', id: (o) => String(o.id) },
  chats:      { kind: 'array', id: (o) => String(o.id) },
  evidence:   { kind: 'array', id: (o) => String(o.id) },
  safehouses: { kind: 'array', id: (o) => String(o.id) },
  logs:       { kind: 'array', id: (o) => String(o.id), append: true },
  bulletins:  { kind: 'map' },
  duty:       { kind: 'map' },
};
Object.keys(SCHEMA).forEach((k) => {
  if (k === 'logs') {
    drv.exec(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, at INTEGER NOT NULL, category TEXT, data TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS logs_at ON logs(at);
              CREATE INDEX IF NOT EXISTS logs_cat ON logs(category);`);
  } else {
    drv.exec(`CREATE TABLE IF NOT EXISTS ${k} (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  }
});
drv.exec(`CREATE INDEX IF NOT EXISTS incidents_created ON incidents(updated_at);`);

/* ---------- load ---------- */
const FILES = {};
Object.keys(SCHEMA).forEach((k) => { FILES[k] = path.join(DATA_DIR, k + '.json'); });

function tableCount(k) { return drv.prepare(`SELECT COUNT(*) AS n FROM ${k}`).get().n; }

function loadFromDb(k) {
  const spec = SCHEMA[k];
  const rows = drv.prepare(`SELECT id, data FROM ${k}${k === 'logs' ? ' ORDER BY at ASC, id ASC' : ''}`).all();
  if (spec.kind === 'map') {
    const o = {}; rows.forEach((r) => { try { o[r.id] = JSON.parse(r.data); } catch {} }); return o;
  }
  const arr = [];
  rows.forEach((r) => { try { arr.push(JSON.parse(r.data)); } catch {} });
  return arr;
}

const store = {};
const snap = {};      // key -> Map(id -> json string) of what is currently saved
const logSaved = new Set();   // ids of log entries already written

function takeSnapshot(k) {
  const spec = SCHEMA[k], m = new Map();
  if (spec.kind === 'map') Object.keys(store[k]).forEach((id) => m.set(id, JSON.stringify(store[k][id])));
  else if (!spec.append) store[k].forEach((o) => m.set(spec.id(o), JSON.stringify(o)));
  snap[k] = m;
}

/* ---------- one-time import of the old JSON files ---------- */
function migrateJson() {
  const imported = [];
  Object.keys(SCHEMA).forEach((k) => {
    const f = FILES[k];
    if (!fs.existsSync(f) || tableCount(k) > 0) return;
    let data; try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.warn('  skip', f, e.message); return; }
    const spec = SCHEMA[k];
    const items = spec.kind === 'map' ? Object.entries(data || {}) : (Array.isArray(data) ? data : []);
    if (!items.length) { fs.renameSync(f, f + '.migrated'); return; }
    drv.exec('BEGIN');
    try {
      const now = Date.now();
      if (spec.kind === 'map') {
        const ins = drv.prepare(`INSERT OR REPLACE INTO ${k} (id, data, updated_at) VALUES (?, ?, ?)`);
        items.forEach(([id, v]) => ins.run(String(id), JSON.stringify(v), now));
      } else if (k === 'logs') {
        const ins = drv.prepare(`INSERT OR REPLACE INTO logs (id, at, category, data) VALUES (?, ?, ?, ?)`);
        items.forEach((o) => ins.run(spec.id(o), Number(o.at) || now, o.category || '', JSON.stringify(o)));
      } else {
        const ins = drv.prepare(`INSERT OR REPLACE INTO ${k} (id, data, updated_at) VALUES (?, ?, ?)`);
        items.forEach((o) => ins.run(spec.id(o), JSON.stringify(o), now));
      }
      drv.exec('COMMIT');
      fs.renameSync(f, f + '.migrated');           // keep a copy, but never import twice
      imported.push(`${k} (${items.length})`);
    } catch (e) { drv.exec('ROLLBACK'); console.warn('  migration failed for', k, e.message); }
  });
  if (imported.length) console.log('  ✔ Imported old JSON data into SQLite:', imported.join(', '));
}
migrateJson();

Object.keys(SCHEMA).forEach((k) => {
  store[k] = loadFromDb(k);
  takeSnapshot(k);
});
store.logs.forEach((o) => logSaved.add(SCHEMA.logs.id(o)));

/* ---------- saving ---------- */
function persist(k) {
  const spec = SCHEMA[k];
  if (!spec) throw new Error('Unknown collection ' + k);

  if (spec.append) {                                   // logs: insert only new rows, trim old ones
    const arr = store[k];
    drv.exec('BEGIN');
    try {
      const ins = drv.prepare(`INSERT OR REPLACE INTO logs (id, at, category, data) VALUES (?, ?, ?, ?)`);
      const fresh = [];
      arr.forEach((o) => { const id = spec.id(o); if (!logSaved.has(id)) { ins.run(id, Number(o.at) || Date.now(), o.category || '', JSON.stringify(o)); fresh.push(id); } });
      if (arr.length) {                                 // anything older than the oldest kept entry was trimmed in memory
        const first = arr[0];
        drv.prepare(`DELETE FROM logs WHERE at < ? OR (at = ? AND id < ?)`).run(Number(first.at) || 0, Number(first.at) || 0, spec.id(first));
      }
      drv.exec('COMMIT');
      fresh.forEach((id) => logSaved.add(id));
      if (logSaved.size > arr.length * 2 + 1000) { logSaved.clear(); arr.forEach((o) => logSaved.add(spec.id(o))); }
    } catch (e) { drv.exec('ROLLBACK'); throw e; }
    return;
  }

  const next = new Map(), prev = snap[k], now = Date.now();
  if (spec.kind === 'map') Object.keys(store[k]).forEach((id) => next.set(id, JSON.stringify(store[k][id])));
  else store[k].forEach((o) => next.set(spec.id(o), JSON.stringify(o)));

  const up = drv.prepare(`INSERT INTO ${k} (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const del = drv.prepare(`DELETE FROM ${k} WHERE id = ?`);
  drv.exec('BEGIN');
  try {
    next.forEach((json, id) => { if (prev.get(id) !== json) up.run(id, json, now); });
    prev.forEach((_j, id) => { if (!next.has(id)) del.run(id); });
    drv.exec('COMMIT');
    snap[k] = next;
  } catch (e) { drv.exec('ROLLBACK'); throw e; }
}

/** Debounced persist — used for the audit log, which can be written many times a second. */
const timers = {};
function persistLater(key, ms = 600) {
  if (timers[key]) return;
  timers[key] = setTimeout(() => { timers[key] = null; try { persist(key); } catch (e) { console.warn('persistLater', key, e.message); } }, ms);
}
function flushAll() {
  Object.keys(timers).forEach((k) => { if (timers[k]) { clearTimeout(timers[k]); timers[k] = null; try { persist(k); } catch {} } });
}
/** Consistent online backup (safe while the server is running). */
function backupTo(file) { drv.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`); }
function close() { try { flushAll(); drv.db.close(); } catch {} }
process.on('exit', flushAll);
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => { close(); process.exit(0); }));

module.exports = { store, persist, persistLater, flushAll, close, backupTo, DATA_DIR, DB_FILE, FILES, driver: drv.name };
