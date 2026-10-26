/**
 * Start-up wrapper: wait until the database has been loaded into memory, then start the server.
 * (index.js is unchanged; it simply runs after the data is ready.)
 */
const db = require('./db');
Promise.resolve(db.ready)
  .then(() => require('./index.js'))
  .catch((e) => {
    console.error('\n  ✖ SafeMesh could not start:', e && e.message ? e.message : e, '\n');
    process.exit(1);
  });
