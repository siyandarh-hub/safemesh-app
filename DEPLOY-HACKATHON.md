# Deploy SafeMesh for the hackathon (Render, free)

## Before you push to GitHub
- This folder is already cleaned: no database, no private key, no real secrets, no node_modules.
- Never add a real `.env` to Git (it is ignored). Render keeps your secrets in its dashboard.

## Steps
1. In this folder: `git init && git add . && git commit -m "SafeMesh"`, then push to a new GitHub repo.
2. render.com -> sign in with GitHub -> New -> Blueprint -> pick the repo. Render reads `render.yaml` and builds the `Dockerfile`.
3. When it is live: Render dashboard -> your service -> Environment -> copy `SAFEMESH_ADMIN_KEY` (your master key).
4. Open the URL, Create Account -> Admin, enter the master key.
5. Create demo accounts: user, health professional, responder. Approve the health professional. Record vetting for the responder, then approve. Add a verified safe house. Trigger a test SOS.
6. Click through every screen, then Admin -> Logs -> Security: look for `csp_violation` entries.

## Judging day
- Free plan: data resets on restart/redeploy; the service sleeps after ~15 min idle. Open the link a few minutes before judging and do not redeploy after creating demo accounts.
- Password-reset codes are not delivered unless you add an e-mail/SMS provider (see `.env.example`). Give judges the demo logins instead.
- Do not share the master key. Tell judges to allow location access.
- Submit a short demo video as a backup.
