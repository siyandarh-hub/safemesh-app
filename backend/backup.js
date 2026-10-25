/** Makes a safe copy of the database:  npm run backup   →  data/backups/safemesh-YYYY-MM-DD_HH-MM.db
 *  (Uploaded evidence files live in data/uploads — copy that folder too.) */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const dir = path.join(db.DATA_DIR, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
const file = path.join(dir, `safemesh-${stamp}.db`);
db.backupTo(file);
// keep the newest 30 backups
fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().reverse().slice(30).forEach(f => fs.unlinkSync(path.join(dir, f)));
console.log('Backup written to', path.relative(process.cwd(), file));
db.close();
