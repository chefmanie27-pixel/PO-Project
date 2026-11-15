# Deployment configuration

For the requested **separate Render Static Site frontend**, use [the frontend deployment guide](render-static-frontend.md) and `deploy/render-frontend.yaml`. The combined web-service settings below remain an alternative; do not replace the existing backend service to create the Static Site.

A local release bundle, integrity checker, configuration templates and operator acceptance guide are prepared. Start with [staging preparation](staging-acceptance.md). The Render build fix was verified locally; it does not deploy or change a remote database. Use `npm run staging:prepare` to build a new reviewable bundle without private credentials.

## Render settings

| Setting           | Exact value                             |
| ----------------- | --------------------------------------- |
| Root Directory    | Leave blank (repository root)           |
| Build Command     | `npm ci --include=dev && npm run build` |
| Start Command     | `npm run start -w backend`              |
| Health Check Path | `/api/v1/ready`                         |

The root build runs Prisma generation before compiling either workspace. Keep development dependencies during the build: Prisma CLI, TypeScript and Vite are build tools. When building the backend workspace alone, run `npm run db:generate` first from the repository root.

The schema uses `provider = "prisma-client-js"` with default generated output, so imports from `@prisma/client` are correct. Prisma CLI, client and PostgreSQL adapter are pinned to matching 7.10.1 versions in the manifest and lockfile. Missing generation can cause missing exports and cascading implicit-any/unknown errors. Generating before compilation restores the model types; strict checking remains enabled. See [Prisma generation guidance](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client).

Build with `npm ci --include=dev`, `npm run build`, `npm run typecheck`, `npm run lint` and `npm test`. Run browser and live integration checks before release. Never build with mode=e2e for deployment. Client generation writes generated code; it does not migrate, reset, seed or connect to the database.

## Render environment variables

On Render, omitted `SERVE_FRONTEND` now defaults to enabled for the combined application. Set `false` explicitly only for an intentionally API-only service. Local development remains separate frontend/API by default.

| Variable                         | Value or source                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NODE_VERSION`                   | `24`                                                                                                                      |
| `NODE_ENV`                       | `production`                                                                                                              |
| `APP_ENV`                        | `staging` for temporary staging                                                                                           |
| `HOST`                           | `0.0.0.0`; also the default when Render supplies `RENDER=true`                                                            |
| `SERVE_FRONTEND`                 | `true` to serve the compiled SPA and API together                                                                         |
| `DATABASE_URL`                   | Secret PostgreSQL connection URL for the intended environment; use the separate staging database's internal URL on Render |
| `FIREBASE_PROJECT_ID`            | Existing authorized Firebase project ID                                                                                   |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-admin.json`; upload the authorized Admin credential as a Render secret file with that filename     |
| `VITE_FIREBASE_API_KEY`          | Existing public Firebase web API key, available at build time                                                             |
| `VITE_FIREBASE_AUTH_DOMAIN`      | Existing public Firebase auth domain, available at build time                                                             |
| `VITE_FIREBASE_PROJECT_ID`       | Same existing project as the backend, available at build time                                                             |
| `WEB_ORIGIN`                     | Exact HTTPS service origin; optional if Render supplies `RENDER_EXTERNAL_URL`                                             |
| `TRUST_PROXY`                    | Unset or `false` until the hosted proxy topology is reviewed                                                              |

Render supplies `PORT`, `RENDER=true` and `RENDER_EXTERNAL_URL`; do not replace `PORT` with a fixed development port. Express uses that numeric port and the public bind address. The start script runs the compiled `backend/dist/backend/src/server.js` from the backend workspace. It does not require tsx or run migrations. `/api/v1/health` checks process health; `/api/v1/ready` checks the database after separately authorized schema setup.

Never set Firebase emulator variables in production mode. Never put Admin credentials in `VITE_*` variables, Git, logs or frontend assets. Vite values are public and embedded during build; changing them requires rebuilding. The root `.env` is local and is not uploaded automatically to Render.

As an alternative to combined Render hosting, host `frontend/dist` on a static HTTPS server with index.html fallback and proxy `/api/v1` to Express. Outside Render the default bind address remains loopback, suitable for a same-host reverse proxy; set `HOST=0.0.0.0` explicitly when a container platform requires it.

Apply committed SQL with `npx prisma migrate deploy --schema backend/prisma/schema.prisma` against the target PostgreSQL database through a controlled release process. Do not run development seed or bootstrap automatically during deployment. Use a secret manager for DATABASE_URL and Firebase Admin credentials. Frontend VITE variables are public and embedded at build time.

Configure WEB_ORIGIN to the exact HTTPS frontend origin. Terminate TLS at a trusted reverse proxy. Only configure Express trust proxy when the actual proxy topology is known; incorrect configuration can undermine rate limiting. The default in-process limiter is suitable for a single process; use a shared limiter store for multiple replicas. Restrict database access, add readiness checks including database connectivity, and configure backups and audit retention before production use.

## Build-fix verification

The corrected root build passes locally on Node 24.18.1, including Prisma generation and both strict TypeScript workspace builds. All 99 regression tests, strict type checking and lint pass. An isolated install with install scripts disabled and no pre-generated client or local environment files also verifies the root build can generate its own client. A compiled production-entry smoke test verifies Render-style `PORT`, `0.0.0.0` binding and SPA deep links without querying a database. Actual Linux/Render execution and live PostgreSQL/Firebase acceptance still require a separately authorized deployment.

Publish the reviewed fix before deploying it: Render builds the selected Git commit, not uncommitted local files. If a previous build cache is stale, use Render's clear-build-cache deployment option after authorization. Do not run `migrate reset`, `db push`, seeds or development migrations to address generated-client build errors. Schema migrations are separate from this build/start configuration and require authorization.
