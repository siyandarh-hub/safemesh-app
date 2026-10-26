/**
 * Storage selector.
 *  - DATABASE_URL set  -> Supabase / PostgreSQL (data survives redeploys)   [db-pg.js]
 *  - otherwise         -> local SQLite file in data/                       [db-sqlite.js]
 * Both expose the same API, so index.js does not change.
 */
const impl = process.env.DATABASE_URL ? require('./db-pg') : require('./db-sqlite');
if (!impl.ready) impl.ready = Promise.resolve();
module.exports = impl;
