# Local PostgreSQL on Windows

The project uses Prisma 7 with the PostgreSQL driver adapter. Committed migrations are in `backend/prisma/migrations`. Use `npm run db:deploy` to apply those reviewed migrations without creating/resetting a shadow database.

## Installation and credentials

The automatic Windows setup uses WinGet's `PostgreSQL.PostgreSQL.17` package, version 17.12-1, downloaded from EDB. PostgreSQL's official Windows download page links to this installer. It includes PostgreSQL and pgAdmin. Installation may require a Windows UAC approval.

`scripts/install-postgresql.ps1` refuses to replace an existing PostgreSQL service or installation. It generates a random administrator password, supplies it through a restricted temporary option file and deletes that file when the installer exits. The recoverable administrator credential is stored with Windows user-bound DPAPI encryption in ignored `.cache/postgresql/postgres-admin.credential.xml`. Do not commit or share that file.

`scripts/setup-postgresql.ps1` loads the encrypted credential only into a temporary child-process environment and runs the local setup helper. It creates `po_command_center` only if absent, with a separate restricted application login. The app login has no superuser, database-creation or role-management privileges. Its password is generated cryptographically and saved in the ignored root `.env`; setup recovery state is inside the NTFS-restricted ignored cache.

Existing databases, roles with different credentials, and existing project data are preserved. Remote or different database URLs are refused. The helper checks local-only listening and reports if a service restart is required to apply a loopback binding. A Windows service restart may require administrator approval.

The cache is specific to your Windows account and machine. Losing it does not delete database data, but automatic administrator credential recovery may no longer work. Keep credentials in your chosen secure password manager if you need long-term recovery; never print them into logs or chat.

## Commands (Git Bash)

After installation and one-time local setup:

```bash
npm run firebase:check -- --database
npm run db:generate
npm run db:deploy
npm run db:verify
npm run dev
```

`db:verify` performs real relational writes, ticket version checks and cross-project foreign-key checks inside a transaction that is deliberately rolled back. It refuses remote/different databases and verifies that fixture projects were not persisted. It does not reset or seed the database.

The restricted application login deliberately cannot create Prisma shadow databases. `db:migrate` is for authoring future migrations and requires a separately configured development shadow database with appropriate permissions. Use `db:deploy` for the existing migrations and normal setup. Never run `migrate reset` to fix a setup issue.

## Running services and readiness

Frontend: http://127.0.0.1:5173

Backend: http://127.0.0.1:4000

`GET /api/v1/health` checks process liveness. `GET /api/v1/ready` executes `SELECT 1` through the actual Prisma client and returns 200 only when the backend can reach PostgreSQL; database failures return a safe 503 without connection details.

Initial project access still requires a registered Firebase identity and an explicitly approved local membership. The supplied service account is used only by the backend. `scripts/configure-bootstrap.mjs <trusted-email>` resolves an existing user without creating a Firebase account or altering live Firebase resources. After that trusted identity is configured, `npm run db:bootstrap` creates local project membership and six initial teams without changing existing membership records.

## Sources

After registering the explicitly selected administrator email, run `npm run db:configure-admin`, then `npm run db:bootstrap`, and refresh the app. The selected email is saved locally; no password needs to be sent to the developer or entered in these commands.

[Official PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/) · [EDB Windows developer setup](https://www.enterprisedb.com/docs/dev-guides/deploy/windows)
