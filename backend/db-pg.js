/**
 * SafeMesh database — Supabase / PostgreSQL (used when DATABASE_URL is set)
 *
 * Same design as db-sqlite.js: each collection lives in its own table, the server keeps a working
 * copy in memory, and persist(key) writes ONLY the rows that changed. index.js does not change.
 * Tables live in their own schema ("safemesh") with Row Level Security switched on, so they are
 * NOT reachable through Supabase's public REST API. Only this server (direct connection) can read them.
 *
 * Differences from SQLite: writes are asynchronous but kept in order (a single queue), and the
 * data is loaded before the server starts (see boot.js -> db.ready).
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const S = 'safemesh';
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
const KEYS = Object.keys(SCHEMA);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX) || 5,
  connectionTimeoutMillis: 15000,
});
pool.on('error', (e) => console.warn('  ⚠ database pool error:', e.message));

const store = {};
KEYS.forEach((k) => { store[k] = SCHEMA[k].kind === 'map' ? {} : []; });
const snap = {};              // key -> Map(id -> json) of what is currently saved
const logSaved = new Set();   // ids of log entries already written

function takeSnapshot(k) {
  const spec = SCHEMA[k], m = new Map();
  if (spec.kind === 'map') Object.keys(store[k]).forEach((id) => m.set(id, JSON.stringify(store[k][id])));
  else if (!spec.append) store[k].forEach((o) => m.set(spec.id(o), JSON.stringify(o)));
  snap[k] = m;
}

/* ---------- ordered write queue ---------- */
let chain = Promise.resolve();
function enqueue(fn, onFail) {
  const run = chain.then(fn);
  chain = run.catch((e) => { console.error('  ✖ database write failed:', e.message); if (onFail) { try { onFail(e); } catch {} } });
  return chain;
}
async function withTx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally { c.release(); }
}

/* ---------- start-up: create tables (first run) and load everything ---------- */
async function init() {
  const c = await pool.connect();
  try {
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${S}`);
    for (const k of KEYS) {
      if (k === 'logs') {
        await c.query(`CREATE TABLE IF NOT EXISTS ${S}.logs (id TEXT PRIMARY KEY, at BIGINT NOT NULL, category TEXT, data TEXT NOT NULL)`);
        await c.query(`CREATE INDEX IF NOT EXISTS logs_at ON ${S}.logs(at)`);
        await c.query(`CREATE INDEX IF NOT EXISTS logs_cat ON ${S}.logs(category)`);
      } else {
        await c.query(`CREATE TABLE IF NOT EXISTS ${S}.${k} (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at BIGINT NOT NULL)`);
      }
      await c.query(`ALTER TABLE ${S}.${k} ENABLE ROW LEVEL SECURITY`);   // no policies = closed to the public API
    }
    for (const k of KEYS) {
      const { rows } = await c.query(`SELECT id, data FROM ${S}.${k}${k === 'logs' ? ' ORDER BY at ASC, id ASC' : ''}`);
      if (SCHEMA[k].kind === 'map') {
        Object.keys(store[k]).forEach((id) => delete store[k][id]);
        rows.forEach((r) => { try { store[k][r.id] = JSON.parse(r.data); } catch {} });
      } else {
        store[k].length = 0;
        rows.forEach((r) => { try { store[k].push(JSON.parse(r.data)); } catch {} });
      }
      takeSnapshot(k);
    }
    store.logs.forEach((o) => logSaved.add(SCHEMA.logs.id(o)));
  } finally { c.release(); }
}
const ready = init().then(() => {
  console.log('  ✔ Connected to Supabase (PostgreSQL). Loaded: ' + KEYS.map((k) => `${k} ${SCHEMA[k].kind === 'map' ? Object.keys(store[k]).length : store[k].length}`).join(', '));
}).catch((e) => {
  throw new Error('Cannot connect to the database (' + e.message + '). Check DATABASE_URL: use the Supabase "Session pooler" connection string and the correct password.');
});

/* ---------- saving ---------- */
function persist(k) {
  const spec = SCHEMA[k];
  if (!spec) throw new Error('Unknown collection ' + k);

  if (spec.append) {                                   // logs: insert only new rows, trim old ones
    const arr = store[k];
    const ids = [], ats = [], cats = [], datas = [];
    arr.forEach((o) => {
      const id = spec.id(o);
      if (!logSaved.has(id)) { ids.push(id); ats.push(Number(o.at) || Date.now()); cats.push(o.category || ''); datas.push(JSON.stringify(o)); }
    });
    if (!ids.length) return;
    ids.forEach((id) => logSaved.add(id));
    const first = arr[0];
    if (logSaved.size > arr.length * 2 + 1000) { logSaved.clear(); arr.forEach((o) => logSaved.add(spec.id(o))); }
    enqueue(() => withTx(async (c) => {
      await c.query(`INSERT INTO ${S}.logs (id, at, category, data) SELECT * FROM unnest($1::text[], $2::bigint[], $3::text[], $4::text[]) ON CONFLICT (id) DO NOTHING`, [ids, ats, cats, datas]);
      if (first) await c.query(`DELETE FROM ${S}.logs WHERE at < $1 OR (at = $1 AND id < $2)`, [Number(first.at) || 0, spec.id(first)]);
    }), () => { ids.forEach((id) => logSaved.delete(id)); persistLater(k, 5000); });
    return;
  }

  const next = new Map(), prev = snap[k], now = Date.now();
  if (spec.kind === 'map') Object.keys(store[k]).forEach((id) => next.set(id, JSON.stringify(store[k][id])));
  else store[k].forEach((o) => next.set(spec.id(o), JSON.stringify(o)));
  const upIds = [], upData = [], delIds = [];
  next.forEach((json, id) => { if (prev.get(id) !== json) { upIds.push(id); upData.push(json); } });
  prev.forEach((_j, id) => { if (!next.has(id)) delIds.push(id); });
  snap[k] = next;
  if (!upIds.length && !delIds.length) return;
  enqueue(() => withTx(async (c) => {
    if (upIds.length) await c.query(`INSERT INTO ${S}.${k} (id, data, updated_at) SELECT x.id, x.data, $3::bigint FROM unnest($1::text[], $2::text[]) AS x(id, data) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [upIds, upData, now]);
    if (delIds.length) await c.query(`DELETE FROM ${S}.${k} WHERE id = ANY($1::text[])`, [delIds]);
  }), () => { snap[k] = new Map(); persistLater(k, 5000); });   // on failure: re-save everything shortly
}

/** Debounced persist — used for the audit log, which can be written many times a second. */
const timers = {};
function persistLater(key, ms = 600) {
  if (timers[key]) return;
  timers[key] = setTimeout(() => { timers[key] = null; try { persist(key); } catch (e) { console.warn('persistLater', key, e.message); } }, ms);
}
function flushAll() {
  Object.keys(timers).forEach((k) => { if (timers[k]) { clearTimeout(timers[k]); timers[k] = null; try { persist(k); } catch {} } });
  return chain;
}
/** Simple JSON export of everything (used by `npm run backup`). Supabase also keeps its own backups. */
function backupTo(file) { fs.writeFileSync(file, JSON.stringify(Object.assign({ exportedAt: new Date().toISOString() }, store))); }
function close() { return flushAll().then(() => pool.end()).catch(() => {}); }
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => { close().finally(() => process.exit(0)); }));

module.exports = { store, persist, persistLater, flushAll, close, backupTo, ready, DATA_DIR, DB_FILE: path.join(process.cwd(), 'supabase'), FILES: {}, driver: 'PostgreSQL/Supabase' };
