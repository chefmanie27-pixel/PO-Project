# PostgreSQL TLS diagnosis and deployment

The backend previously forced certificate verification for every PostgreSQL endpoint. Render internal PostgreSQL supports optional TLS with self-signed certificates; verification against public certificate authorities fails on that endpoint. Render external PostgreSQL uses Render-managed TLS certificates. See https://render.com/docs/postgresql-creating-connecting#connect-to-your-database.

The existing backend and database are both in Oregon. The operator confirmed the backend uses the Internal Database URL. The connector logs confirm P1011 at account_lookup, but the old logs discarded the certificate detail. A specific historical certificate error subtype cannot be recovered from those logs. New TLS errors include a fixed tlsDetail classification, never raw error messages.

The database configuration uses these policies:

- Render internal hostname (dpg-?-a, with RENDER=true): require TLS, accepting the self-signed certificate as supported by Render. No plaintext fallback. Explicit sslmode=disable is supported only for internal or loopback connections. An explicit verify-full or verify-ca keeps certificate verification enabled and is expected to fail with Render's self-signed internal certificate.
- External or other remote hostname: require TLS 1.2+ with certificate and hostname verification. URL sslmode=require cannot weaken verification. TLS-disable, no-verify and prefer requests are rejected. Use the full external hostname, not its resolved IP.
- Local loopback PostgreSQL: no TLS by default; explicit TLS settings are supported.

URL TLS parameters are resolved before passing the URL to pg so they cannot override the chosen policy. Certificate-file URL parameters are rejected; use NODE_EXTRA_CA_CERTS for an additional trusted CA if necessary. Startup emits only target and TLS policy, with no hostname, database name or connection string.

## Safe release procedure

1. Review, commit and push the fix only when ready to release. The live backend has auto-deploy on commit enabled: pushing main can deploy immediately. No service or environment settings were changed during this investigation.
2. Preserve the existing DATABASE_URL, Firebase configuration, records and BOOTSTRAP_ADMIN_ENABLED=false. Do not sync the staging Blueprint over production: the checked-in Blueprint describes Frankfurt staging; the live service and database are in Oregon.
3. The current start command, npm run start -w backend, runs db:deploy before loading the server. A deployment through that launcher executes migrations. If migrations are not separately authorized, set the existing backend service Start Command to node backend/dist/backend/src/server.js (repository root). This starts the compiled backend without the migration launcher. Review that setting before triggering any deploy. No migration is required for this TLS-only fix.
4. Manually deploy the reviewed release after deployment authorization. For the confirmed Internal URL, the new startup event should report target=render_internal and tls=required_internal. An external URL should report target=external and tls=verified. Do not log or paste DATABASE_URL.
5. Check GET /api/v1/ready returns 200. Sign in with the existing authorized account and verify GET /api/v1/profile returns 200 and the existing membership. Health alone does not establish database readiness. Do not rerun bootstrap or change permissions to fix a 503.
6. If a TLS error remains, inspect only the sanitized database_operation_failed event and tlsDetail. Confirm region/workspace and Internal URL selection privately. Do not disable verification for an external endpoint.

Local verification uses npm run typecheck and npm exec vitest run backend/tests/database-config.test.ts backend/tests/database-tls-errors.test.ts backend/tests/profile.test.ts backend/tests/bootstrap.test.ts. These tests use fixtures; they do not provision administrators or migrate a database.
