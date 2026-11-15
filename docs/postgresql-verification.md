# PostgreSQL setup verification — 2026-11-15

## Completed

- Inspected Windows services, installed applications, package managers and the redacted DATABASE_URL. PostgreSQL and pgAdmin were initially absent; the URL contained sample local credentials.
- Confirmed Prisma 7/PostgreSQL architecture and reviewed all three committed migrations. They create schema objects and integrity checks without deleting records or resetting a database.
- Installed **PostgreSQL 17.12-1** and bundled **pgAdmin 4** through WinGet using the official EDB installer. WinGet verified the installer hash. Existing installations were not replaced.
- Created **po_command_center** with a separate restricted application login. Cryptographically generated passwords were not displayed or placed in command arguments. The connection URL is saved in the ignored root `.env`.
- Stored the administrator credential using Windows user-bound DPAPI encryption in the access-restricted ignored cache. The temporary installer password file was removed. Application setup recovery state is NTFS-restricted and ignored by Git.
- Restricted PostgreSQL to **127.0.0.1:5432**, restarted it through normal Windows administrator elevation, and confirmed **postgresql-x64-17** is **Running / Automatic**.
- Applied all three migrations with `prisma migrate deploy`, avoiding shadow database creation/reset. Migration status subsequently reported **Database schema is up to date**.
- Added `/api/v1/ready`, which executes SQL through the actual Prisma client and returns safe 503 responses if the database is unavailable.
- Started the frontend at **http://127.0.0.1:5173** and backend at **http://127.0.0.1:4000**. The backend readiness endpoint reported **ready / database connected** after restart with the new connection settings.

## Checks actually executed

| Check                                 | Result                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| PostgreSQL version                    | 17.12                                                                   |
| Windows service                       | Running; Automatic startup                                              |
| Network listener                      | 127.0.0.1:5432 only                                                     |
| pgAdmin runtime                       | Installed                                                               |
| Prisma client generation              | Passed; repaired a missing generated client after dependency reinstall  |
| Existing migration deployment         | All 3 passed                                                            |
| Migration status                      | Up to date                                                              |
| Application SQL connection / SELECT 1 | Passed                                                                  |
| Application-role privileges           | Not superuser; cannot create databases or roles                         |
| Real relational writes                | Passed in a deliberately rolled-back transaction                        |
| Ticket version check                  | First update succeeded; stale version updated zero rows                 |
| Cross-project foreign keys            | Invalid relationship rejected                                           |
| Fixture rollback                      | Passed; project counts preserved and no test data persisted             |
| Setup rerun                           | Existing database preserved; credentials unchanged; no restart required |
| Unit/API/frontend tests               | **66 passed across 12 files**                                           |
| TypeScript and ESLint                 | Passed                                                                  |
| Production frontend/backend builds    | Passed                                                                  |
| Frontend                              | HTTP 200                                                                |
| Backend liveness                      | OK                                                                      |
| Backend database readiness            | Ready; database connected                                               |
| Firebase Admin API                    | Verified through read-only lookup with the supplied service account     |
| Secret-file ignore checks             | Root .env and credential cache ignored                                  |

The build retains existing non-failing Rollup annotation warnings from Zod. No tests were disabled, and no database was deleted or reset. A permissions issue found during the setup rerun was fixed by validating and reusing the already protected credential directory instead of trying to rewrite its ACL unnecessarily; the rerun then passed.

## Remaining account step

The selected administrator email is not yet registered in Firebase Authentication. The selection is saved in local BOOTSTRAP_ADMIN_EMAIL. No Firebase UID, administrator membership or account was guessed or created.

1. Register that email using your own password at **http://127.0.0.1:5173/register**. A project-access message immediately afterward is expected until approval is bootstrapped.
2. In Git Bash in the project directory:

   ```bash
   npm run db:configure-admin
   npm run db:bootstrap
   ```

   The first command resolves the existing identity for the saved trusted email without creating Firebase users. The second verifies its UID/email and creates approved **local** project membership and six initial teams, preserving existing memberships.

3. Refresh the application and sign in. End-user Firebase sign-in with approved database membership remains unverified until this password/account step is completed.

PostgreSQL installation, database configuration, migrations and application-to-database communication are complete. Subsequent application starts use `npm run dev`; PostgreSQL starts automatically with Windows. No production resources or live Firebase resources were modified.

Detailed setup and recovery: [Local PostgreSQL](postgresql-local.md).
