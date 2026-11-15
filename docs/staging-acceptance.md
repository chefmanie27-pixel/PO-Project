# Staging preparation and acceptance

Staging is a separate test copy of this application, with its own database and an HTTPS address. Render was selected for temporary free staging, and the operator reports its Git repository is connected. Authenticated Render service access from this workspace remains unavailable, so the current remote state is unverified. Local preparation and the build fix do not transfer credentials, deploy or run remote migrations.

## Render temporary staging

### Public staging check — 2026-11-15

The operator subsequently selected a **separate Render Static Site** for the frontend. Follow [that deployment guide](render-static-frontend.md) rather than enabling combined hosting as described in the initial diagnostic below. The existing backend can remain API-only. Its root 404 is acceptable in that topology; frontend acceptance must use the new Static Site URL.

The operator supplied `https://po-project-rogv.onrender.com`. Read-only HTTPS probes verified health 200, readiness 200 with PostgreSQL connected, profile 401 without authentication, private `.env` 404, correct CORS origin and an HTTP-to-HTTPS 301 redirect. However, `/` and `/projects` return JSON 404s: combined frontend hosting is not active on this deployment. Live sign-in and collaborative acceptance remain pending.

Set `SERVE_FRONTEND=true` in the existing Render service and restart/redeploy through the authorized release process. The runtime now defaults to combined hosting when `RENDER=true` and `SERVE_FRONTEND` is omitted; explicit `false` preserves API-only hosting. A missing frontend build fails startup. Check the served frontend's public Firebase configuration after activation.

Repeat the public checks without signing in or modifying records:

```bash
npm run staging:smoke -- https://po-project-rogv.onrender.com
```

The command exits nonzero if expected public routes, assets, readiness or the unauthenticated boundary fail. It does not log credentials or private-file contents. This is an initial smoke check, not proof of multi-user permissions or a completed release.

The root `render.yaml` proposes a free Node 24 web service and a separate free PostgreSQL 17 database in Frankfurt. Automatic deploys are disabled. Confirm resource names are unused before creating the Blueprint: Render can apply matching names to existing resources. Use a staging branch containing the reviewed current changes; an older remote commit will not contain this implementation.

The web service binds to `0.0.0.0` and Render's assigned `PORT`. Express serves the compiled SPA and API on one origin, preserving JSON 404s for unknown API routes. `WEB_ORIGIN` defaults to Render's assigned HTTPS URL only when `RENDER=true`. Proxy trust stays disabled until the actual topology is reviewed, so rate limits may share the edge IP. Do not enable blanket proxy trust. Confirm Firebase sign-in under the delivered CSP and deployed proxy before acceptance.

Supply the existing authorized Firebase project ID and its public Vite web configuration through the prompted environment fields. Configure the existing server-only credential as a Render secret file named `firebase-admin.json`, mounted at `/etc/secrets/firebase-admin.json`; never put its contents in Git, frontend variables or build output. The Blueprint intentionally contains no credentials. The start command only starts the compiled server; migrations require a separate authorized step. It does not seed demo data or promote a user. Bootstrap the trusted administrator separately against that staging database after identity verification. Free services have no interactive shell, so any bootstrap must use an authorized local operator connection or a separately reviewed one-time process. See [exact Render commands and variables](deployment.md#render-settings).

Database external access is disabled by the Blueprint (`ipAllowList: []`). If using the local operator bootstrap, explicitly authorize a temporary single-operator IP allowlist and remove it afterwards; do not expose the database to all addresses.

Render free PostgreSQL expires after 30 days, has a 1 GB limit and no automatic backups. Export test data before expiry if needed. Free web services sleep after inactivity. Keep the deployment temporary and do not enable paid resources or upgrades. Review workspace spending limits before activation. See [Render free limits](https://render.com/docs/free) and [Blueprint reference](https://render.com/docs/blueprint-spec).

## Local restore and HTTPS evidence

`npm run test:acceptance` passed a real `pg_dump`/SQL restore between two freshly generated isolated schemas. It verified canonical IDs, versions, relationships, comments, audit history and archived-team restrictions through the API. Cleanup removes only owned test schemas and checks that pre-existing public IDs remain present.

The HTTPS test pins a temporary localhost certificate with certificate verification enabled. A local Node proxy forwards every route to the actual combined Express frontend/API host (`SERVE_FRONTEND=true`). Checks cover redirects, deep links, built assets, missing asset 404s, API JSON 404s, readiness, fixed CORS and overwritten forwarding headers. The served Content Security Policy permits the required Firebase token endpoints and the configured project's auth frame, without `unsafe-eval`. This validates local combined hosting and a proxy contract; it does not certify Render's edge, live Firebase sign-in or the example Nginx configuration. Generated private certificate keys are removed after the test.

## Prepared release

From the repository root:

```bash
npm run staging:prepare
npm run staging:check -- .cache/staging/<release-directory>
```

Preparation builds the existing application and copies an explicit allowlist into a new ignored directory. It includes compiled frontend/backend output, dependency manifests, Prisma schema/migrations, trusted bootstrap output, deployment examples and this acceptance guide. It excludes real environment files, service-account credentials, node_modules, seed data and test fixtures. The preparer rejects private-key material, credential-bearing PostgreSQL URLs and fixture-mode frontend output. A SHA-256 manifest records every file; the checker rejects modified or unlisted files.

An integrity pass is **not** deployment approval or environment validation. The manifest explicitly records that neither was performed. Keep the prepared directory unchanged; supply actual secrets outside it.

## Hosting choices

Render is the selected target. The supplied Nginx and systemd examples remain an alternative for an independently managed Linux host; they are not required by Render. They illustrate Node 24, PostgreSQL access, an HTTPS Nginx frontend/proxy and one loopback API process. Each topology requires its own proxy, TLS and process acceptance.

Files for review:

- `deploy/staging.env.example`: blank private settings and public origin template. Use a separate staging PostgreSQL database; never copy application data into staging by default.
- `deploy/nginx-staging.conf.example`: static SPA fallback and `/api/v1` proxy with overwritten forwarding headers and example certificate paths.
- `deploy/po-command-center-staging.service.example`: unprivileged service with an external environment file and restricted filesystem access.

Production-mode startup fails closed if database/Firebase settings are missing, the origin is not explicit HTTPS, emulator settings are supplied, or staging points at the existing local development database. Only explicit `TRUST_PROXY=loopback` is supported for the provided same-host proxy; blanket proxy trust is rejected. Do not use that template unchanged behind a different proxy layout.

## Once a staging target and deployment are authorized

1. Provision an empty, distinct staging database and a least-privilege database account. Configure database TLS according to the provider's requirements. Do not reset or migrate an unrelated database.
2. Configure the existing authorized Firebase project and the intended frontend public SDK configuration. The built frontend and backend must use matching projects. Review sign-in domain/provider requirements. Do not create projects, accounts or change live Firebase settings without explicit authorization.
3. Store the filled environment file and private Admin credentials through the target's secret mechanism, outside the release and web root. The examples use `/etc/po-command-center/staging.env`; restrict access to the service/operator.
4. On the target, install the locked dependencies and generate the Prisma client for that environment. Migration and bootstrap commands are separate operator actions; nothing runs them automatically. During setup, include development dependencies needed by the Prisma CLI (`npm ci --include=dev`).
5. After verifying the selected database and backup strategy, run the existing migration deployment command with the intended staging environment. Node 24 can load an environment file without executing it as shell code:

   ```bash
   node --env-file=/etc/po-command-center/staging.env node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
   ```

6. Bootstrap only an explicitly trusted existing Firebase UID/email, separately authorized by the operator:

   ```bash
   node --env-file=/etc/po-command-center/staging.env backend/dist/backend/prisma/bootstrap.js
   ```

   No account is promoted because it registered first. This reuses the existing trusted bootstrap implementation. Do not run the demo seed for acceptance.

7. Validate the actual Nginx configuration/certificates (`nginx -t` on that host), review the service/environment, then activate only after deployment approval. The API stays on loopback; the proxy serves HTTPS and SPA routes.

## Acceptance evidence

Use test-only project data in the separate staging database and two approved test accounts. Do not paste passwords or tokens into logs or issue comments.

| Check          | Required evidence                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Health         | `/api/v1/health` and `/api/v1/ready` return 200; readiness identifies database connectivity                         |
| Authentication | Sign in, refresh, sign out and reopen; unapproved and disabled accounts are denied                                  |
| Collaboration  | PO A creates a ticket; PO B sees and edits it; PO A refreshes and sees the same canonical record                    |
| Conflicts      | Two edits from the same version produce one success and one 409 without lost work                                   |
| Lifecycle      | Create team/sprint, assign work, start/complete sprint, retain unfinished work and history                          |
| Isolation      | Other-project team, sprint, ticket and unauthorized project IDs are rejected                                        |
| Archives       | Team/project history remains; new archived assignments/writes are rejected; reactivation works                      |
| Proxy boundary | HTTPS origin matches, forwarding headers cannot spoof external clients, rate limiting follows the reviewed topology |
| Accessibility  | Keyboard-only navigation, dialogs and a human screen-reader review on desktop/mobile                                |
| Recovery       | Restore a staging backup into a separate disposable target and verify integrity before release                      |

Record pass/fail, environment URL, release manifest hash, tester, date and any findings. Keep production deployment as a separate approval.

## Concurrent local verification

`npm run test:concurrency` creates a uniquely named schema in local `po_command_center`, applies all migrations with its search path restricted to that schema, and runs a real HTTP server against independently pooled PostgreSQL connections. It tests eight concurrent writers, ten concurrent readers, stale edits, competing sprint starts and an archive/write race. Synthetic identities are injected for this workload test; real Firebase/SQL identity integration is covered separately by `npm run test:firebase:emulators`.

The test removes only its newly created schema after checking the schema's identity and ownership, then verifies that prior public application IDs remain present. Its report is ignored at `.cache/verification/concurrency-latest.json`. It does not create a public staging site or constitute a production load certification.
