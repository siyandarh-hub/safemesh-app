# Brief for the legal review (POPIA notice, terms of service, operations)

This is a factual description of what SafeMesh does, written to hand to a South African attorney. It is **not legal advice** and draws no legal conclusions; the "questions for counsel" are suggestions. Texts to review are inside the app: *Privacy Notice (POPIA)* v1.0 and *Terms of Service* v1.0 (Create-account screen → the two links; text lives in `frontend/app.js`, version constants `POPIA_VERSION` / `TOS_VERSION`).

## 1. What personal information is processed
| Data | Whose | Why / where |
|---|---|---|
| Name, e-mail, cellphone, town, province, password (bcrypt) | all accounts | sign-in, password-reset codes (e-mail/SMS) |
| Stand-down and duress PINs (hashed) | users, health professionals | cancelling an alert; silently escalating one |
| Precise GPS position, and a live trail while an alert is active; optional "track my location" | survivors / users; responders and health professionals (live location) | dispatch and routing |
| Alert records: category, description, time, location, status, who responded | survivors | emergency response |
| Evidence: photos, video, audio recordings, PDFs | survivors | responders and admins can open it |
| Counselling chat messages | users ↔ verified health professionals | message *content* is not written to the audit log |
| Professional registration number, organisation, job role | responders, health professionals | verification / vetting |
| Responder vetting record: ID-checked flag, referee-contacted flag, clearance/accreditation reference, private notes, who vetted, expiry | responders | see `RESPONDER-VETTING.md` |
| Audit log: actor, role, action, IP address, device type, user-agent | everyone | security and accountability (up to 20,000 entries) |
| Safe-house details submitted by responders | third-party premises | shown to users after admin verification |

Likely **special personal information** or otherwise sensitive: location while in danger, voice/images of survivors, counselling content, information about abuse/violence, possible information about children. Anonymous reports and guest alerts carry no account, but still carry location/evidence.

## 2. Who gets it
* **Responders (approved and currently vetted) and admins** — alerts, locations, evidence; evidence opens are audit-logged.
* **Hosting provider** — wherever you deploy (country? sub-processors?).
* **E-mail / SMS provider** (Resend, SMTP host, Twilio or BulkSMS) — recipient address/number and the code.
* **OpenStreetMap services, called from the user's browser:** Nominatim (address ↔ coordinates; receives GPS coordinates and place searches), OSRM routing servers (receive the responder's and the survivor's coordinates to draw a route), and OSM tile servers (receive IP and map area). These are third parties outside South Africa. The current notice says data is not shared.
* Nobody receives data for marketing; there are no analytics or advertising scripts. Libraries are served from SafeMesh itself.

## 3. Where the notice and the system currently disagree  *(fix or reword before launch)*
1. **Retention is promised but not enforced.** The notice says active incidents are kept "resolved + 30 days", resolved incidents 12 months, audio evidence 7 days unless marked to keep, account data until the user deletes it. **No server job deletes anything.** (Evidence marked "keep" is a client-side notion; report evidence has no server-side keep control, so a blanket 7-day deletion would destroy survivors' evidence — decide the rule with counsel *before* building it.)
2. **"Delete your data" / "Access a copy of your data" are promised, but there is no server-side account deletion or data export.** The in-app "Delete all my data" button clears only the browser's local storage.
3. **"We do not sell or share your data"** — see the OpenStreetMap and e-mail/SMS processors above.
4. **"Location only during an active emergency"** — the app also offers optional live-location tracking, and responders' and health professionals' live locations are shared with admins/responders while on duty.
5. **"Responders in your town — only during an active incident. Nobody else."** — admins can see all alerts nationally, and the audit log holds IP addresses.
6. **Information Officer contact** (`privacy@safemesh.app`) must be a real, monitored address; check registration of the Information Officer with the Information Regulator.

## 4. Questions for counsel
* Which POPIA conditions and grounds apply (consent, legitimate interest, protection of the data subject's vital interests); is consent valid for people in crisis, for minors, for anonymous/guest use? Section 26–35 (special personal information) and the children provisions.
* Is SafeMesh (the operator/organisation) the responsible party, and are the hosting, SMS/e-mail providers and OSM services operators? What operator agreements and cross-border transfer safeguards (section 72) are needed?
* Retention schedule and the right to deletion where evidence may be needed in criminal or civil proceedings; how to reconcile "delete my data" with evidence preservation and the audit trail. Should evidence be hashed at upload for integrity / chain of custody (not implemented today)?
* Security-compromise notification duties (section 22) and an incident-response plan.
* Responder status: volunteers, contractors or employees of partner organisations? Confidentiality / acceptable-use agreement, vetting records (what may be kept, for how long), liability if a responder misuses data.
* Mandatory-reporting duties that may sit in tension with chat confidentiality (e.g. child abuse reporting) and professional-conduct rules for e-counselling by registered professionals.
* Terms of service: not a substitute for 10111/emergency services, no guarantee of response or response time, limitation of liability, acceptable use, admin powers (force-resolve, revoke), what happens to a false or malicious alert.
* Law-enforcement and court requests for data or evidence: who decides, how it is logged.
* Any need for prior authorisation or notification to the Information Regulator for the processing described.

## 5. Technical controls you can describe to counsel
Role-based access with server-side enforcement; vetting gate and 12-month expiry for responders; per-person signed, expiring evidence links; audit trail of staff opening evidence and of admin/responder actions; PINs and passwords hashed; HTTPS and HSTS in production; Content-Security-Policy; no third-party scripts; rate-limited sign-in and reset flows; guest alerts protected by a per-alert secret key; backups are the operator's responsibility (`docs/DEPLOYMENT.md`).
