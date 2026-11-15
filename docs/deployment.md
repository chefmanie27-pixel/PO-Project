# Deployment (not executed)

Build with `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Run the configured browser suite and the live integration checks before release. Never build with mode=e2e for deployment.

Host `frontend/dist` on a static HTTPS server with index.html fallback for React Router. Proxy `/api/v1` to the Express service. Run `npm run start -w backend`; output entry is `backend/dist/backend/src/server.js`. Backend currently listens on loopback, suitable for a same-host reverse proxy. For container hosting, configure a bind address in the server before exposing it to a private network. This is an example architecture, not a completed deployment configuration.

Apply committed SQL with `npx prisma migrate deploy --schema backend/prisma/schema.prisma` against the target PostgreSQL database through a controlled release process. Do not run development seed or bootstrap automatically during deployment. Use a secret manager for DATABASE_URL and Firebase Admin credentials. Frontend VITE variables are public and embedded at build time.

Configure WEB_ORIGIN to the exact HTTPS frontend origin. Terminate TLS at a trusted reverse proxy. Only configure Express trust proxy when the actual proxy topology is known; incorrect configuration can undermine rate limiting. The default in-process limiter is suitable for a single process; use a shared limiter store for multiple replicas. Restrict database access, add readiness checks including database connectivity, and configure backups and audit retention before production use.

No public hosting, external account setup, database provisioning, or production changes were performed. Live PostgreSQL/Firebase acceptance is required before declaring the MVP release-ready.
