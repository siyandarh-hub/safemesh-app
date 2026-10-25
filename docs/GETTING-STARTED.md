# Getting started — running SafeMesh

You need: **Node.js 20 or newer** (download the LTS version from nodejs.org). Nothing else for steps 1 and 2.

## 1. Try it on this computer (2 minutes)
1. Unzip the project.
2. **Windows:** double-click `start.bat`. **Mac/Linux:** open a terminal in the folder and run `./start.sh`.
   * First run installs what it needs and **creates your `.env` with freshly generated secrets** (nothing is sent anywhere).
3. Open **http://localhost:3847**.
4. Open the new `.env` file, copy the value of `SAFEMESH_ADMIN_KEY` into a password manager, then in the app choose **Create Account → Admin** and paste it. That creates the first admin.
5. Create a **second** admin the same way (nobody should be the only person who can approve others).

Generate secrets by hand any time: `node tools/setup.js` (only creates `.env` if it doesn't exist; `--force` replaces it and signs everyone out).

## 2. Use it from phones, tablets and other computers on the same Wi-Fi
Phones only share GPS, microphone and notifications over **HTTPS**, so a plain `http://192.168…` address will not work for the important features.
1. Stop the server (Ctrl+C), then run: `npm run start:https` (from the project folder; run `npm run setup` once first if you never installed).
2. It prints addresses such as `https://192.168.1.20:3847`. On the other device, connected to the **same Wi-Fi**, open that address.
3. The browser warns the certificate is "not private" (it is a self-made test certificate). Choose **Advanced → Proceed**. You only do this once per device.
4. If it does not load: allow Node.js through the computer's firewall (Windows asks the first time — tick *Private networks*), and make sure the Wi-Fi is not a "guest" network that isolates devices.
5. Limits of this mode: it is for testing. "Install as app" and offline mode usually need a **trusted** certificate (step 3). Moving the server to another computer? Copy the whole folder including the hidden `.env` and the `data/` folder.

## 3. Real use on the internet (production)
You need: a small server (VPS) with **Docker**, a **domain name** whose DNS A record points at the server, and ports **80 and 443** open.
1. Copy the project to the server (e.g. into `/opt/safemesh`).
2. Create the production `.env` (run from the project folder; if the server has no Node, use: `docker run --rm -v "$PWD":/w -w /w node:20 node tools/setup.js ...`):
   `node tools/setup.js --production --domain safemesh.yourcompany.co.za --email you@yourcompany.co.za`
3. Open `.env` and add your **SMS and/or e-mail provider** (see the "Password-reset codes" section). Without one, nobody can reset a password. Then `chmod 600 .env`.
4. Start it: `docker compose -f docker-compose.https.yml up -d --build` — Caddy fetches the HTTPS certificate by itself (this only works once DNS is pointing at the server).
5. Check: `curl -sI http://YOUR-DOMAIN/` answers `308` to https, and `curl -s https://YOUR-DOMAIN/api/health` answers `{"ok":true…}`.
6. Create the first admin (master key from `.env`) and a second admin. Send yourself a real password reset by SMS/e-mail.
7. **Smoke test with CSP in report-only mode** (already set by the script): register a test responder, vet and approve them, trigger an SOS from a real phone, acknowledge it, open the evidence. Then look at **Admin → Logs → security**. If there are no `csp_violation` entries, delete the `SAFEMESH_CSP=report-only` line from `.env` and run `docker compose -f docker-compose.https.yml up -d` — the policy is now enforced.
8. Set up **backups** (database + `data/uploads`, copied off the server; test a restore) and an uptime check on `/api/health`. Read `SECURITY-CHECKLIST.md`, `RESPONDER-VETTING.md` and `LEGAL-REVIEW-BRIEF.md` before real users arrive.

## Cheat sheet
| I want to… | Do this |
|---|---|
| start locally | `start.bat` / `./start.sh` |
| test on phones | `npm run start:https` |
| make new secrets | `node tools/setup.js --force` |
| go live | step 3 above |
| back up | `npm run backup` (and copy `data/uploads/`) |
| change CSS classes | `npm install` then `npm run build:css` |
