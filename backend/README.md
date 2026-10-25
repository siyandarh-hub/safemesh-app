# SafeMesh Backend (v2.3)

| File | Purpose |
|------|---------|
| `index.js` | All `/api/*` routes, audit logging, serves `../frontend` |
| `config.js` | Settings; reads environment variables or `../.env` |
| `db.js` | SQLite database (`../data/safemesh.db`), imports old JSON files automatically |
| `mailer.js` | Sends password-reset codes (Resend / SMTP e-mail, Twilio / BulkSMS text) |
| `vendor.js` | Downloads Tailwind + Leaflet into `../frontend/vendor` (`npm run vendor`) |
| `backup.js` | Safe database copy (`npm run backup`) |

```bash
cd backend
npm install
npm start      # http://localhost:3847
```
Secrets and providers are set in `../.env` (see `../.env.example`). They are never sent to the browser.
