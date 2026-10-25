# Responder vetting process (template — adapt, then have it reviewed)

Responders can see survivors' names, live locations, voice recordings and photos. "Approved" must therefore mean *a named person at SafeMesh checked this responder and can show how*. The app enforces the record; this document is the human process behind it.

## What the app enforces
* An admin cannot approve a responder unless three things are recorded: **ID checked against an original document**, **referee / employer / organisation contacted**, and a **clearance or accreditation reference**. Optional private notes.
* Nobody can vet or approve their own account.
* The approval is valid for **12 months** (`SAFEMESH_VETTING_DAYS`). At expiry the responder is suspended automatically, and loses access to alerts and evidence immediately, until an admin records fresh vetting (Admin → Team → *Renew vetting* / *Re-vet & reinstate*).
* Every approval, renewal, suspension and revocation is in the audit log; the reference and notes are never written to it. Every time a responder opens evidence is logged too.
* Responders approved before this feature get a 30-day grace period, after which they are suspended until vetted.

## Suggested steps (decide the details with your legal adviser)
1. **Application** — the person registers as a responder (name, organisation, role, town).
2. **Identity** — an admin sees the original ID document (in person or on a live video call, not a forwarded photo) and matches it to the applicant.
3. **Affiliation** — contact the applicant's employer, community policing forum, NPO, armed-response company or professional body *using contact details you looked up yourself*, not ones the applicant supplied. Ask: is this person currently with you, in good standing, and would you trust them with sensitive information about someone in danger?
4. **Clearance / accreditation** — record the reference of what you accepted, for example a SAPS police clearance certificate number, PSIRA registration, HPCSA/EMS registration, or a letter reference from the organisation. Decide in advance which are acceptable for which roles and how old a certificate may be.
5. **Decision by someone other than the applicant's sponsor** where possible; record notes on anything borderline.
6. **Briefing & agreement** — before the first shift the responder reads and accepts a short confidentiality / acceptable-use agreement (need-to-know access only, no screenshots or forwarding, no contacting survivors outside the app, report loss of phone). Have this agreement drafted by a lawyer.
7. **Renewal** — repeat steps 2–4 (lighter if nothing changed) before the 12 months end; the admin list shows *RE-VET IN n DAYS* from 30 days out.

## Suspend or revoke immediately when
* the responder leaves the organisation or loses their accreditation;
* the audit log shows evidence opened for incidents they had no part in (the entry says "not the acknowledging responder");
* a survivor, colleague or admin raises a conduct concern;
* a device is lost or an account may be compromised (also reset their password).

## Good practice
* Keep at least two active admins so that vetting never depends on one person, and so that nobody vets themselves.
* Review `evidence · opened_by_staff` entries on a schedule (e.g. weekly) — somebody must actually read them for the audit trail to protect anyone.
* Keep vetting documents out of SafeMesh; keep only the reference. Decide where copies (if any) are stored and for how long, and put that in your privacy notice.
