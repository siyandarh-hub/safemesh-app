# SafeMesh Frontend

Single-page app served by the backend (same origin → `/api`).

| Path | Purpose |
|------|---------|
| `index.html` | Whole app (UI + client API layer) |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker (offline shell) |
| `offline.html` | Shown when the app is opened offline for the first time |
| `robots.txt` | Keeps crawlers away from `/api` |
| `icons/` | Favicon & app icons |

Open it through the backend (**http://localhost:3847**), not as a `file://` page.
The layout adapts automatically: phone = bottom bar, tablet = wide bottom bar, laptop/PC = left sidebar.
