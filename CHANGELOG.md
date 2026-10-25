# Changelog

## 2.2.0
- **Chat:** counselling messages now reach the health professional (server is the single source of truth, unread badges, new-message alert, "seen" ticks); availability toggle now saved on the server.
- **Location:** town/province now come from the device's real GPS (reverse-geocoded); Osizweni/Madadeni map to the Newcastle feed; no more silent fallback to Johannesburg.
- **Health professional:** working live-location card with map; new SOS tab (SOS, Silent SOS, stand-down / duress PIN).
- **Safe houses:** admin has a Safe Houses tab (add, verify, reject, delete); pending items appear in Pending and in its badge.
- **Sign-up:** stand-down PIN + a different duress PIN required; both can be viewed (Show/Hide) and are hashed on the server.
- **Admin tabs:** Monitor first, Pending second; new Logs tab (audit log with filters + CSV export).
- **Responder:** after acknowledging, the feed shows a map with distance, direction and road route to the user.
- **Layouts:** automatic phone / tablet / laptop+PC views; scrollable bottom navigation on phones.
- "Track my location" only shows when signed in.
- **Security/robustness:** incident updates are permission-checked; login rate-limit; password reset also needs the account's cellphone number; responder approval status refreshes without re-login; admin emergency alerts and reassignments now reach the server; forms keep what you typed across auto-refresh; fixed a bug that stopped responder alert sounds.

## 2.3.0
- **Database:** SQLite replaces the JSON files (atomic, crash-safe, row-level saves). Old `data/*.json` import automatically on first start. `npm run backup` makes a safe copy.
- **Evidence:** signed expiring links, access limited to owner / approved responders / admins, file-type allowlist, Range support for audio/video. Evidence attached to a report is now uploaded so responders on other devices can open it.
- **Guest SOS:** guests can stand down or update their own alert from the same phone (secret key per alert).
- **Password reset:** emailed / SMS 6-digit code (Resend, SMTP, Twilio or BulkSMS); sessions issued before a reset are revoked.
- **Libraries:** Tailwind + Leaflet self-hosted under `frontend/vendor` (auto-downloaded; CDN fallback).
- Fixes: report attachments no longer vanish from the list after a sync.

## 2.4.0
- **Security fix — alerts are private.** Anyone (even signed out) could previously list a province's SOS alerts with name and GPS position, and responders still awaiting approval could read them. Now only approved, currently-vetted responders and admins see other people's alerts; users and guests see only their own (guests via their alerts' secret keys). Owner e-mail, status and the admin-alert category can no longer be spoofed at creation; who acknowledged/dispatched is stamped by the server; the duty list is staff-only; pending responders cannot broadcast.
- **Responder vetting.** Approval requires a recorded vetting checklist (ID checked, referee contacted, clearance/accreditation reference); valid 12 months (`SAFEMESH_VETTING_DAYS`), automatic suspension at expiry, Renew / Re-vet & reinstate in Admin → Team, 30-day grace for responders approved before this version, nobody can vet themselves. New `docs/RESPONDER-VETTING.md`.
- **Evidence audit trail.** Each time staff open a survivor's file an audit entry records who/what/need-to-know; signed links are bound to the person they were issued to and stop working when that person's access is revoked; rejected links are logged.
- **HTTPS.** Built-in TLS (own certificate or `npm run start:https` self-signed for phone testing), http→https redirect, HSTS, `upgrade-insecure-requests`, refusal to start in production with the built-in dev secrets, `docker-compose.https.yml` + `Caddyfile` for automatic certificates.
- **Content-Security-Policy.** `script-src 'self'`, enforced in production (report-only in development; `SAFEMESH_CSP`), violations reported to the audit log. To make that possible: the app script and styles moved out of `index.html` (`app.js`, `app.css`), the one `eval` was removed, Tailwind's in-browser compiler was replaced by a pre-built `frontend/tailwind.css` (`npm run build:css`), Leaflet is shipped in `frontend/vendor`, CDN fallbacks removed.
- CORS off by default, `X-Frame-Options`, cross-origin isolation headers, no-store caching for evidence.
- New docs: `LEGAL-REVIEW-BRIEF.md`; updated `SECURITY-CHECKLIST.md`, `DEPLOYMENT.md`, `API.md`.

## 2.4.1
- `node tools/setup.js` (also run automatically by `start.sh` / `start.bat` and `npm run setup`) creates `.env` with freshly generated secrets on your own machine; `--production --domain … --email …` fills in the production block.
- The `change-me` placeholder (and any secret shorter than 16 characters) now counts as "not set": production refuses to start with it.
- New `docs/GETTING-STARTED.md`.
