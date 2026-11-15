# Render Static Site frontend

This deploys the existing React/Vite workspace separately from the existing Express backend at `https://po-project-rogv.onrender.com`. No backend service or database needs to be recreated. Deployment access is unavailable from this workspace; no frontend site has been created or verified live.

## Dashboard configuration

Commit and push the reviewed changes, then in Render choose **New → Static Site** and select `chefmanie27-pixel/PO-Project` and the intended staging branch.

| Setting           | Value                                               |
| ----------------- | --------------------------------------------------- |
| Root Directory    | Leave blank (repository root)                       |
| Build Command     | `npm ci --include=dev && npm run build -w frontend` |
| Publish Directory | `frontend/dist`                                     |
| Start Command     | None (Static Site)                                  |
| Node version      | `NODE_VERSION=24`                                   |

The requested `npm install && npm run build -w frontend` also works, but `npm ci --include=dev` reproduces the lockfile and ensures TypeScript/Vite are installed. This frontend-only build does not compile the backend, generate Prisma or run database migrations. A separate Blueprint is provided at `deploy/render-frontend.yaml`; choose that file path when creating a frontend-only Blueprint. Keep the existing root Blueprint and backend services unchanged. Confirm the new Static Site name does not match an existing managed resource before applying a Blueprint.

Add a **Rewrite**, not a redirect: source `/*`, destination `/index.html`. This supports `/login`, `/register`, `/projects`, project details, teams, tickets and all nested React Router routes on refresh. Render serves existing assets before the catch-all rewrite. See [Render rewrite documentation](https://render.com/docs/redirects-rewrites).

## Static Site build variables

| Variable                    | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`         | `https://po-project-rogv.onrender.com` (origin only, without `/api/v1`)                |
| `VITE_FIREBASE_API_KEY`     | Existing public Firebase web API key from `frontend/.env` or Firebase web app settings |
| `VITE_FIREBASE_AUTH_DOMAIN` | Existing Firebase web auth domain                                                      |
| `VITE_FIREBASE_PROJECT_ID`  | Existing Firebase project ID, matching the backend                                     |
| `NODE_VERSION`              | `24`                                                                                   |

The three Firebase values already exist locally in `frontend/.env`; do not replace the existing project or create a new one. Vite reads its workspace `.env` locally, while Render receives these as build environment variables. Do not upload `.env` wholesale: `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS`, bootstrap identities and Admin private keys belong only on the backend. All `VITE_*` values are public and embedded at build time. Rebuild after changing them. Do not set Firebase emulator variables on the Static Site.

An empty `VITE_API_BASE_URL` keeps same-origin `/api/v1` requests for local Vite proxying and combined hosting. The only development API address is the Vite proxy target; there is no hardcoded localhost URL in the production API client. A configured production destination must be an HTTPS origin without credentials, path, query or fragment. The API client retrieves the Firebase ID token per request and sets the bearer header after caller headers so a stale header cannot replace it.

## Backend CORS and Firebase domain

Once Render assigns the Static Site URL, set the **existing backend** environment variable `WEB_ORIGIN` to that exact HTTPS origin, without a trailing slash or path (for example `https://<assigned-static-site>.onrender.com`). Keep its `DATABASE_URL`, Firebase project and Admin credential unchanged. The backend now grants CORS headers only to that exact origin and permits Authorization/Content-Type preflights for the supported methods. Local development retains `WEB_ORIGIN=http://localhost:5173` in its local `.env`. Production does not use wildcard or localhost origins. `SERVE_FRONTEND=false` is optional on the backend when choosing API-only hosting; the separate Static Site does not depend on backend SPA serving.

In the existing Firebase project console, go to **Authentication → Settings → Authorized domains → Add domain** and add the Static Site hostname only: `<assigned-static-site>.onrender.com`. Do not include `https://`, a port or a path. Keep `VITE_FIREBASE_AUTH_DOMAIN` pointing at the existing Firebase auth domain; adding an authorized domain does not require changing that value. Add any later custom hostname separately. Verify Email/Password remains enabled; do not broaden other authentication settings.

## Acceptance and limitations

Automated local checks cover API destination validation, fresh bearer headers, CORS preflight isolation, registration/login/session/logout using Firebase emulators, project/team/ticket workflows, refresh persistence against browser fixtures and isolated SQL integrity. They do not certify live Firebase accounts or hosted writes. The existing backend was publicly checked for health and PostgreSQL readiness, without changing records.

After deployment, verify the real Static Site URL and a refreshed nested route, sign in with an approved test account, create test-only project/team/ticket records in the authorized staging database, refresh to confirm persistence, and use a second authorized account to check collaboration and isolation. Confirm the browser requests the existing backend with `Authorization: Bearer …` and no CORS failures. Do not log tokens or change production records. New registrations remain subject to the existing invitation/administrator approval boundary; never grant administrator roles from the frontend.
