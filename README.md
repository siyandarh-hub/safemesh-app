# SafeMesh — Full Stack (v2.4)

**New here? Read `docs/GETTING-STARTED.md`** — run it locally, on phones, or on the internet.

Privacy-first community safety web app for South Africa.

```
safemesh/
├── frontend/            index.html, app.js, app.css, tailwind.css (pre-built), vendor/ (Leaflet), manifest.json, sw.js, offline.html, icons/
├── backend/             index.js (API + static server), config.js, db.js, package.json
├── data/                created at runtime: safemesh.db (SQLite), uploads/, backups/
├── docs/                DEPLOYMENT.md, SECURITY-CHECKLIST.md, RESPONDER-VETTING.md, LEGAL-REVIEW-BRIEF.md, API.md
├── .env.example         copy to .env and set your own secrets
├── start.bat / start.sh one-click start (Windows / macOS-Linux)
├── Dockerfile, docker-compose.yml, docker-compose.https.yml + Caddyfile (automatic HTTPS), .dockerignore
├── tools/               Tailwind build config (only needed if you change CSS classes)
├── package.json         root shortcuts: npm run setup / npm start
└── CHANGELOG.md
```

## Run it

You need **Node.js 18+** (https://nodejs.org, LTS) and a modern browser.

**Easiest:** double-click `start.bat` (Windows) or run `./start.sh` (macOS/Linux).

**Or manually:**
```bash
cd backend
npm install
npm start
```
Open **http://localhost:3847**.

### Set your own secrets (do this before showing it to anyone)
1. Copy `.env.example` to `.env`
2. Change `SAFEMESH_ADMIN_KEY` and `SAFEMESH_JWT_SECRET`
3. Restart the server

If you skip this the server still starts, but prints a warning because it is using built-in development secrets.

### Password-reset codes (e-mail / SMS)
Open `.env` and uncomment ONE e-mail provider (Resend or SMTP) and/or ONE SMS provider (Twilio or BulkSMS), then restart.
Until you do, codes are printed in the server console (development only). On a live server set `NODE_ENV=production` so they are never printed.

### Database & backups
Everything is stored in `data/safemesh.db` (SQLite). Old JSON data from earlier versions is imported automatically the first time.
Back up with `npm run backup` (writes `data/backups/…db`) and copy `data/uploads/` as well.

### Self-hosted libraries
Leaflet is shipped in `frontend/vendor/` and Tailwind is pre-built into `frontend/tailwind.css`, so the app loads nothing from third-party CDNs (required by the Content-Security-Policy). Changing Tailwind classes? Run `npm install` then `npm run build:css` in the project root.

### First admin
Create Account → **Admin** → enter the master key from your `.env` (or the development key in `backend/config.js` if you have not set one). The key is only ever checked on the server.

## Using it on a phone (important for GPS)
Browsers only give out GPS on **HTTPS** or **localhost**. `http://192.168.x.x:3847` on a phone will NOT get a location.
Easiest: run **`npm run start:https`** (from the project root or `backend/`), open the `https://192.168…` address it prints on the phone and accept the one-time certificate warning. For real use deploy behind a real certificate (see `docs/DEPLOYMENT.md`).

## What's new in 2.4
Alerts are now private to approved responders (a serious leak in 2.3 is fixed), responders must be vetted before approval and re-vetted yearly, every staff opening of survivor evidence is audit-logged, HTTPS and a Content-Security-Policy are built in. See `CHANGELOG.md` and `docs/SECURITY-CHECKLIST.md`.

## What's new in 2.3
SQLite database, protected evidence links, guest SOS sync, emailed/SMS reset codes, self-hosted libraries — see `CHANGELOG.md`.

## What's new in 2.2
See `CHANGELOG.md`. Highlights: real GPS-based town/province detection, working counselling chat for health professionals, health-pro SOS tab and live location, emergency PINs at sign-up, safe-house verification for admins, responder route map, full audit log, and layouts that adapt to phone / tablet / laptop.

## Quick test checklist
| Role | Try |
|------|-----|
| User | Register (set both PINs) → allow location → SOS hold → stand-down PIN / duress PIN |
| Health pro | Register → admin approves → Clients, **SOS** tab, Settings → Live Location |
| Responder | Register → admin records vetting and approves → sign in → Feed → Acknowledge → route map appears |
| Admin | Monitor, Pending, Safe Houses (verify/reject), Logs |

Data lives in `data/`. Delete that folder to reset everything.
