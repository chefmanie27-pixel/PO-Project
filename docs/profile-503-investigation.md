# Production database and profile 503 fix

## Root cause and evidence

The operator's direct inspection confirmed the intended Render PostgreSQL database
is accessible but has no application tables and no _prisma_migrations table.
The five committed migrations have not initialized that database. This explains
the account-service 503: Firebase verifies the token, then authentication queries
User by firebaseUid and the missing User table causes the Prisma query to throw.

Previously, read-only live checks returned health 200, readiness 200 and profile
401 without a token. Deployed readiness only ran SELECT 1, so it could not detect
an empty database. Production database inspection was supplied by the operator;
no production SQL was executed from this workspace.

## Request flow and preserved permissions

The server initializes Firebase Admin with the existing configuration. Each
protected request calls verifyIdToken(token, true), including revocation checks.
Authentication resolves the approved application User by verified UID.
GET /api/v1/profile then reads User by its internal ID and includes memberships
and projects. Client identity or roles are never trusted.

Login/registration in Firebase does not automatically create a privileged
application account. Unknown identities continue to return 403. No user creation,
role assignment, invitation bypass, deletion, or data reset was added.

**An empty production database also has no approved administrator.** After schema
setup, the first trusted administrator needs the existing bootstrap workflow.
Configure BOOTSTRAP_ADMIN_UID and BOOTSTRAP_ADMIN_EMAIL privately for the intended
existing Firebase identity. With separate approval for that data/permission change,
the existing compiled command is:

```sh
npm run bootstrap -w backend
```

Bootstrap verifies the Firebase UID/email and creates the missing User, PO project
and ADMIN membership without overwriting existing memberships. Do not bootstrap
arbitrary registered users or run it automatically on startup. Later accounts use
the existing administrator approval workflow. Never paste the UID/email or
credentials into logs or chat.

## Implementation

- backend/package.json now starts node start.mjs.
- backend/start.mjs resolves the repository root from its own location, loads
  backend/.env then root .env without overriding existing Render variables,
  validates an explicit PostgreSQL DATABASE_URL, and invokes the current npm CLI
  with run db:deploy --workspaces=false from the repository root.
- The root db:deploy script remains prisma migrate deploy --schema
  backend/prisma/schema.prisma. CLI and runtime receive the same environment.
- The compiled server is imported only after migration exits successfully. A
  migration error or missing configuration exits nonzero before opening HTTP.
- Child migration output is suppressed to prevent Prisma/driver connection
  metadata entering deployment logs. Fixed migration start/success/failure events
  and numeric exit status are logged. Inspect detailed failures privately.
- Repeated starts run migrate deploy again; Prisma tracks applied migrations and
  skips them. SQL files are not blindly rerun. No seed or bootstrap is automatic.
- Existing sanitized account/profile diagnostics, schema-aware readiness,
  dependency injection fix and safe profile failure responses are included.
- Release packaging includes backend/start.mjs.

Prisma CLI, client and pg adapter stay pinned to 7.10.1. The schema and migration
lock both use PostgreSQL. prisma.config.ts reads DATABASE_URL for Prisma 7.
Five existing migrations create all models and add integrity constraints,
owner memberships, project/team fields and sprint lifecycle fields.
No migrations or schema were generated/modified. Applying to production and
replaying all SQL on a disposable PostgreSQL instance have not been performed
here. Repeated-start tests verify the gate, not real database idempotency.

## Exact Render settings for the existing backend

| Setting                        | Value                                                 |
| ------------------------------ | ----------------------------------------------------- |
| Root Directory                 | blank (repository root)                               |
| Build Command                  | npm ci --include=dev && npm run build                 |
| Start Command                  | npm run start -w backend                              |
| Health Check Path              | /api/v1/ready                                         |
| NODE_VERSION                   | 24                                                    |
| NODE_ENV                       | production                                            |
| HOST                           | 0.0.0.0                                               |
| SERVE_FRONTEND                 | false                                                 |
| WEB_ORIGIN                     | https://po-project-1.onrender.com                     |
| DATABASE_URL                   | existing intended Render PostgreSQL connection secret |
| FIREBASE_PROJECT_ID            | existing matching Firebase project                    |
| GOOGLE_APPLICATION_CREDENTIALS | existing working Admin secret file path               |

Keep PORT managed by Render. Keep the installed Prisma CLI available at runtime:
do not prune devDependencies after the build, since prisma is a devDependency.
No pre-deploy command is needed: the start gate already applies migrations.
Keep the existing database, Firebase credentials, TLS requirements and frontend
configuration. Do not apply the staging Blueprint to replace production resources.
Do not print DATABASE_URL. Do not disable TLS verification.

## Controlled release and verification

Before pushing main, confirm Render Auto-Deploy is Off: a push could otherwise
trigger a production deployment and migrations. This request does not authorize
either production action. Publishing code with Auto-Deploy disabled still needs
to be followed by a separately approved manual deployment.

1. Confirm DATABASE_URL belongs to the inspected intended database. Obtain a
   provider backup/snapshot and review all five SQL migrations.
2. From the backend Render shell, repository root, read migration status privately:

   ```sh
   npx --no-install prisma migrate status --schema backend/prisma/schema.prisma
   ```

   This is read-only; an empty/uninitialized database may produce a nonzero exit.
   Keep CLI output private because it may include database metadata.

3. Obtain explicit production deployment/migration approval before starting this
   release. Once approved, deploy the reviewed commit manually. Startup invokes
   npm run db:deploy before the HTTP listener.
4. Inspect migration_completed and the listening event; confirm Render Live.
   Check migration status again and verify all five completed migrations.
5. In a private SQL console connected to the same database/schema, verify:

   ```sql
   SELECT to_regclass('"User"') IS NOT NULL AS user_table,
          to_regclass('"ProjectMembership"') IS NOT NULL AS membership_table,
          to_regclass('"Project"') IS NOT NULL AS project_table;
   SELECT migration_name, finished_at IS NOT NULL AS finished,
          rolled_back_at IS NOT NULL AS rolled_back
   FROM "_prisma_migrations" ORDER BY started_at;
   ```

6. Confirm /api/v1/ready returns 200. Bootstrap only the explicitly trusted first
   administrator with separate approval if required. Sign in normally and verify
   profile 200 and the dashboard. No-token 401 and unapproved-account 403 remain
   correct behavior.

For a separately approved manual migration instead of startup, the repository-root
command is npm run db:deploy. Never use migrate reset, migrate dev, db push, seeds,
or automatic migrate resolve to repair production. If a migration fails, preserve
records and investigate privately. Constraint/backfill failures require data review,
not a reset. Until the authorized deployment and authenticated verification happen,
the live HTTP 503 must not be reported as resolved.

## Local verification results

- npm run build: passed (Prisma generation, backend and frontend).
- npm run typecheck: passed.
- npm run lint: passed.
- npm test: 25 files and 143 tests passed, including startup failure gating,
  repeated startup, workspace command paths, and profile authentication/database
  failure scenarios. Migration subprocesses are mocked; no migrations run in tests.
- Prisma schema validation and git diff --check: passed.
- Production migration status, migration execution, first administrator bootstrap,
  Render deployment and authenticated dashboard verification: not performed.
