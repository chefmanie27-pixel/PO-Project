# Firebase integration and setup

## Inspected architecture and project

The existing application is React/TypeScript/Vite/Tailwind with an Express/TypeScript API, Prisma 7 and PostgreSQL. It already implemented Firebase email/password sign-in, database-backed project membership, canonical tickets, sprints/teams, reviews, blockers and decisions. These implementations were reused.

Firebase CLI is linked through `.firebaserc` to **po-project-eca90**. `firebase use` matched this project, the account was already signed in, and `projects:list` returned the configured project. The existing `firebase.json` Firestore database/location and `firestore.indexes.json` were preserved. No project, app, user, provider configuration, document, role or deployment was created or modified remotely.

At inspection, root Firebase application settings were blank and `frontend/.env` did not exist. A read-only Firebase web-app listing returned **no registered Web apps**. The backend's blank local FIREBASE_PROJECT_ID was filled from the existing verified project alias. Admin credentials, database credentials and bootstrap identity were not changed.

## Why PostgreSQL remains authoritative

Firestore would duplicate the existing relational memberships, tickets, decisions and blockers and introduce two independent authorization systems. The browser therefore continues to use Firebase for identity and the existing API/PostgreSQL for application data. No Firestore collections or duplicate tickets were created. No external Scrum tool is configured in this repository, and no tickets were imported or synchronized.

| Requested concept     | Storage decision                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Users and memberships | Existing User and ProjectMembership SQL models                                                          |
| Product decisions     | Existing Decision and DecisionTicket SQL models                                                         |
| Risks and blockers    | Existing Blocker SQL model                                                                              |
| Product priorities    | Existing ticket priority/rank fields                                                                    |
| Sprint planning notes | Existing sprint goal covers the current implemented planning data; standalone notes are not implemented |
| Meeting notes         | No existing feature; not added as an unused second database                                             |

POs are authorized across the teams in their approved shared project. Cross-project data access is denied. Team-restricted developer accounts are not enabled; they require a deliberate TeamMembership design before new role capabilities are granted. Reserved SCRUM_MASTER, DEVELOPER, DESIGNER and QA roles currently deny access. Firebase custom claims or browser-supplied role fields do not grant SQL membership or administrator access.

## Complete the live configuration (Git Bash)

1. In the **existing** Firebase project, register a Web app through Project settings → Your apps → Add app → Web. This is a live resource change and was deliberately left for an authorized operator. Do not create another Firebase project.
2. From the repository root, fetch its public SDK configuration into local environment files:

   ```bash
   npm run firebase:configure
   ```

   This command reads existing Web app configuration, fills only blank matching fields in root `.env` and `frontend/.env`, refuses conflicting existing values and never prints the API key. It never creates a Web app. If multiple apps exist, it lists their non-secret IDs/names; select the intended app with `npm run firebase:configure -- <app-id>`.

3. An authorized operator must enable **Email/Password** in Firebase Authentication → Sign-in method if it is not already enabled. Add `localhost` and, when using the loopback IP, `127.0.0.1` to Authorized domains if needed. The code does not deploy provider configuration.
4. Configure backend application default credentials. Locally, put a Firebase service-account JSON file **outside the repository** and set GOOGLE_APPLICATION_CREDENTIALS to its absolute path in root `.env`, or use properly configured application default credentials. Firebase CLI login does not automatically configure Firebase Admin credentials. The Admin identity needs the permissions required to verify revoked/disabled accounts and read users. Never put this JSON or its private key in frontend files, `VITE_*` variables, Git, issue descriptions or chat.
5. Configure a working development PostgreSQL DATABASE_URL. Fill the trusted BOOTSTRAP_ADMIN_UID and BOOTSTRAP_ADMIN_EMAIL only for an explicitly approved account already created in Firebase. Registration creates a Firebase identity; it does not automatically grant project access.
6. Check and initialize the local application:

   ```bash
   npm run firebase:inspect
   npm run firebase:check
   npm run db:generate
   npm run db:migrate -- --name initial
   npm run db:bootstrap
   npm run dev
   ```

   Run migrations/bootstrap only against your intended development database. They were not executed against a live or unconfigured database during this integration work. Open http://localhost:5173, sign in as the approved administrator, and grant subsequent registered users membership through Settings.

`npm run firebase:check` intentionally exits nonzero while required configuration is missing. To also test PostgreSQL using a read-only `SELECT 1`, run `npm run firebase:check -- --database`. Diagnostic output never includes connection URLs, passwords or private credential contents.

If CLI sign-in expires, run `npx -y firebase-tools@latest login` in Git Bash. For a terminal that cannot receive the local browser callback, use `npx -y firebase-tools@latest login --no-localhost`. No login was needed during inspection.

## Authentication behavior

The browser reuses one default Firebase app/Auth instance, verifies project consistency, explicitly selects local browser persistence, waits for session restoration and clears TanStack Query data on identity changes. Sign-in, registration, initialization and logout failures have safe UI messages. Server credentials never enter the browser configuration. `api()` attaches the current Firebase ID token to requests.

Firebase Admin initializes once for the explicitly configured server project and verifies tokens with revocation checking enabled. Invalid/expired/revoked/disabled identities receive 401. Missing/unavailable Admin credentials and database outages return safe 503 messages rather than misleading invalid-password errors. Valid identities without a database approval receive 403. Membership and administrator capabilities are centralized in `shared/permissions.ts`; future roles stay denied until explicitly granted.

## Firestore policy — local proposal, not deployed

The previous local rule allowed unrestricted public reads/writes until December 15, 2026. That rule was replaced **locally** with default-deny because this application has no authorized Firestore client operations. Users, team membership, custom admin claims, nested paths, writes and deletes remain denied. `firestore.rules` was compiled and exercised by the local Firestore emulator. Existing live rules were neither fetched nor changed; do not assume the live database is protected by this local file.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for this PostgreSQL-backed application by denying every direct Firestore client operation. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

Review the local rules against any **other applications** using the same Firebase database before an authorized deployment. A deny-all policy could block their client operations. No deployment command is included in the setup sequence.

## Verification

Ordinary checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Real local Firebase Auth/Firestore verification (Java 21 required for Firestore):

```bash
npm run test:firebase:emulators
```

This uses separate `firebase.emulators.json`, loopback listeners and **demo-po-command-center**, never the live alias. It compiles the local rules, tests real emulator-issued token verification, password sign-in and refresh, disabled users, database approval/admin boundaries with SQL fixtures, and anonymous/authenticated Firestore read/write/delete denial. It also runs an Edge browser test with the real Firebase Auth SDK/emulator for registration, persisted-session reload, logout, protected routes and unapproved accounts. Browser application data remains a fixture; real PostgreSQL persistence is not claimed.

Java 21 was downloaded from Adoptium and checksum-verified into ignored `.cache/java-runtime` for this machine, without changing system Java settings. The runner can reuse that local runtime or JAVA_HOME on other machines. CLI and emulator downloads are development tools, not application dependencies or production configuration. Full test results and remaining steps are recorded in `docs/firebase-verification.md`.

Production refuses the Auth emulator. The frontend emulator connection requires explicit `--mode emulator`, a demo project and a loopback URL; the backend also rejects non-demo projects, non-loopback hosts and production emulator configuration. Normal production builds never use the fixture alias or the demo-mode configuration. Do not deploy a test-mode build.

## Sources

The implementation follows Firebase's [browser session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [Admin credential setup](https://firebase.google.com/docs/admin/setup), [revoked-session verification](https://firebase.google.com/docs/auth/admin/manage-sessions) and [local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure) documentation.
