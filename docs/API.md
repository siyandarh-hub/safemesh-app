# API overview (all JSON, Bearer token unless stated)

| Method | Path | Who |
|--------|------|-----|
| POST | /api/auth/register · /login · /logout · /change-password | public / signed-in |
| POST | /api/auth/forgot/request · /api/auth/forgot/confirm | public (6-digit code by e-mail/SMS) |
| GET | /api/auth/me | signed-in |
| POST | /api/pins · /api/pins/verify | signed-in (hashes on server) |
| GET | /api/incidents | **approved, currently-vetted responders and admins** get alerts by `province`/`town`. Everyone else gets only their own (`?mine=1`; guests send their alerts' secret keys in `X-Guest-Keys`). Never a duress alert to its sender. |
| POST/PATCH/DELETE | /api/incidents | PATCH: owner, approved responder, admin — or a guest with the `X-Guest-Key` returned when the alert was created. `acknowledgedBy`/`dispatchedBy` are stamped by the server |
| GET/POST | /api/bulletins · /api/duty | approved responders, admin (duty list is empty for everyone else) |
| GET/POST | /api/chats · POST /api/chats/read | users + verified professionals |
| GET/POST/PATCH/DELETE | /api/safehouses | admin verifies; responders submit |
| POST/GET/DELETE | /api/evidence | owner / approved responder / admin; file links are signed, expire after ~10–20 min and are **bound to the person they were issued to**. Every time staff open a file an `evidence · opened_by_staff` audit entry is written (once per person per file per 5 min); rejected links are logged as `security · evidence_denied` |
| POST | /api/accounts/:email/approve-responder | admin; **requires a vetting record** (`idVerified`, `refereeContacted`, `reference`, optional `notes`) — otherwise 422 |
| POST | /api/accounts/:email/revet | admin; renew vetting or reinstate a responder suspended for expired vetting |
| POST | /api/csp-report | browsers (CSP violation reports → audit log) |
| GET | /api/geo/reverse?lat&lng | GPS → address (cached, server-side) |
| POST | /api/logs/event | whitelisted client events |
| GET | /api/logs?category&q&limit | **admin only** audit log |
