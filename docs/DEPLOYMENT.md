# Deploying SafeMesh

## Option A — Docker + automatic HTTPS (recommended)
1. A small VPS (or any server with ports 80 and 443 open) and a domain name whose DNS points at it.
2. `cp .env.example .env` and set at least `SAFEMESH_ADMIN_KEY`, `SAFEMESH_JWT_SECRET` (generate long random values), `DOMAIN`, `ACME_EMAIL`, plus an e-mail/SMS provider (password-reset codes cannot be delivered without one).
3. `docker compose -f docker-compose.https.yml up -d` — Caddy fetches and renews the certificate; SafeMesh is not exposed directly.
4. Open `https://your-domain`, create the first admin with the master key, then check **Admin → Logs → Security** for any `csp_violation` entries after clicking through every screen once.

## Option B — a hosting platform (Render, Railway, Fly.io …)
Set `NODE_ENV=production`, `SAFEMESH_ADMIN_KEY`, `SAFEMESH_JWT_SECRET`, `TRUST_PROXY=true`, make `data/` a **persistent volume**. The platform provides HTTPS; SafeMesh then redirects any plain-HTTP request to HTTPS and sends HSTS.

## Option C — your own certificate, no proxy
`SAFEMESH_TLS_CERT` and `SAFEMESH_TLS_KEY` point at PEM files (e.g. from Let's Encrypt/certbot); optionally `SAFEMESH_HTTP_REDIRECT_PORT=80`. Remember to reload SafeMesh after the certificate renews.

## Testing on phones before you have a domain
`npm run start:https` serves a self-signed certificate valid for localhost and your LAN IPs. Open the `https://192.168…` address on the phone and accept the one-time warning: GPS, microphone and notifications then work. (HSTS is never sent for this certificate.) Or use a tunnel such as `cloudflared tunnel --url http://localhost:3847`.

## What the server enforces in production (`NODE_ENV=production`)
* Refuses to start on the built-in development secrets.
* Redirects http→https (`FORCE_HTTPS`), sends HSTS, `upgrade-insecure-requests`.
* **Content-Security-Policy in enforce mode**: `script-src 'self'` (no inline scripts, no `eval`, no third-party scripts), stylesheets only from this server, network calls only to this server and OpenStreetMap's geocoding/routing/tiles. Set `SAFEMESH_CSP=report-only` to trial a change; violations land in the audit log.
* CORS is off (the app and API share one origin).

## Rebuilding the CSS
`frontend/tailwind.css` is pre-built and committed. Only if you add or change Tailwind classes in `frontend/index.html` or `frontend/app.js`: `npm install` (root) then `npm run build:css`.

## Backups
Copy `data/safemesh.db` (use `npm run backup` for a consistent copy) **and** `data/uploads/` off the server on a schedule, and test a restore. Evidence is only as safe as its backups.

## Before real users
Read `SECURITY-CHECKLIST.md`, `RESPONDER-VETTING.md` and `LEGAL-REVIEW-BRIEF.md`.
