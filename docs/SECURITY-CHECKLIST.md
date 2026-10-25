# Security checklist

## Done in 2.3
- [x] Evidence files need a signed, expiring link (or sign-in); only the owner, approved responders and admins can get one. Only photos/video/audio/PDF are accepted, files are served sandboxed.
- [x] Guest SOS stand-down / updates sync to the server using a per-alert secret key (only its hash is stored).
- [x] Password reset uses a 6-digit code sent by e-mail and/or SMS (10-minute expiry, 5 tries, rate-limited, old sessions revoked). Admin resets also need the master key.
- [x] Data is in SQLite (WAL, atomic writes) with `npm run backup`.
- [x] Own `SAFEMESH_ADMIN_KEY` / `SAFEMESH_JWT_SECRET` in `.env` (never commit `.env`).

## Done in 2.4
- [x] **Alerts are private.** Before 2.4 *anyone* — even signed out — could list a province's SOS alerts with the person's name and GPS position, and a responder still awaiting approval could read them all. Now only approved, currently-vetted responders and admins receive other people's alerts; users and guests get only their own.
- [x] **Approval means something.** A responder must pass the in-app vetting checklist (ID checked, referee/employer contacted, clearance or accreditation reference) before an admin can approve them. Approval expires after 12 months and the responder is suspended automatically until re-vetted; responders approved before 2.4 get a 30-day grace period. Pending, rejected, revoked or expired responders have **no** access to alerts, evidence, broadcasts or the duty list (including with sessions issued earlier).
- [x] **Audit trail for evidence.** Every time staff open a survivor's file an `evidence · opened_by_staff` entry records who, which file/incident, and whether they are the responder who acknowledged the alert. Signed links are now bound to the person they were issued to, so the entry names the right person, and a revoked responder's old links stop working at once. Rejected links are logged as `security · evidence_denied`. (One entry per person per file per 5 minutes, because audio/video players re-request the file while seeking.)
- [x] Who acknowledged or dispatched an alert is stamped by the server, not taken from the browser; owner e-mail, status and the "Admin Emergency Alert" category can no longer be spoofed when creating an alert.
- [x] **HTTPS support built in** (own certificate, or `npm run start:https` self-signed for phone testing), http→https redirect, HSTS (never with the self-signed test certificate), refuses to start in production on the built-in dev secrets, ready-made Caddy + Docker file for automatic certificates.
- [x] **Content-Security-Policy** (`script-src 'self'`: no inline scripts, no `eval`, no third-party scripts; stylesheets only from this server). Enforced in production, report-only otherwise; violations are reported to `/api/csp-report` and appear in Logs → security. Tailwind's in-browser compiler is gone (pre-built `frontend/tailwind.css`), Leaflet is shipped in `frontend/vendor`, the app script/styles moved out of `index.html`.
- [x] CORS off by default (single origin), `X-Frame-Options: DENY`, cross-origin isolation headers.

## Still to do before real users
**Needs you (not code)**
- [ ] **Rotate the secrets** in `.env` if they were ever pasted into chat, e-mail, a ticket or a zip you shared (generate fresh ones, restart). The `.env` from the 2.3 package was *not* copied into 2.4.
- [ ] Deploy behind a real certificate on your domain (`docs/DEPLOYMENT.md`) and set `NODE_ENV=production`.
- [ ] **Browser smoke test of the CSP.** It was verified by static analysis and header tests, not in a live browser. Run the app once with `SAFEMESH_CSP=report-only`, click through every role and screen, then check Admin → Logs → security for `csp_violation` entries before switching to enforce.
- [ ] Choose and configure an e-mail/SMS provider.
- [ ] Scheduled backups of `data/` (database **and** `data/uploads`) kept off the server; test a restore.
- [ ] **Run the responder vetting process** (`docs/RESPONDER-VETTING.md`): decide who may vet, what documents count, and re-vet every responder (the 30-day grace for existing ones is ticking).
- [ ] **Legal review** of the POPIA notice and terms — start from `docs/LEGAL-REVIEW-BRIEF.md`, which also lists where the notice currently promises more than the system does.

**Needs code, after the policy decisions above**
- [ ] Retention job + server-side account deletion/export (the notice promises both; see the brief — do not auto-delete evidence until the "keep" rules are agreed).
- [ ] Move to PostgreSQL if you run more than one server or expect thousands of active users (SQLite is single-server).
- [ ] Tamper-evident audit log (hash chain) and a longer retention for `evidence` audit entries than the general 20,000-entry cap (`SAFEMESH_LOG_MAX`).
- [ ] Let survivors see who opened their evidence (the data is now there).
- [ ] Replace `multer` 1.x (upgrade notice from npm) and add dependency scanning.
