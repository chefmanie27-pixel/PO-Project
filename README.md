# PO Command Center

A collaborative Product Owner workspace with a canonical backlog, sprint board, six-team demonstration dataset, requirements review queue, blocker tracker, and durable decision log. Dark navy surfaces and gold accents, responsive navigation, keyboard status controls, and explicit loading/error states.

**Status:** implemented locally; release acceptance still requires a configured PostgreSQL instance and Firebase project. Automated fixture tests do not establish live authentication, migrations, or multi-user database behavior. Nothing has been deployed.

## Stack and layout

React 19, TypeScript, Vite, Tailwind 4, React Router, TanStack Query, React Hook Form, Zod, Lucide; Express, Prisma 7 with its PostgreSQL adapter, PostgreSQL, the dedicated Firebase App/Authentication SDKs and Firebase Admin. Vitest, Testing Library, Supertest and Playwright.

- `frontend/src`: authenticated UI, feature screens, reusable components and query hooks.
- `backend/src`: versioned API, identity/membership middleware and ticket domain services.
- `backend/prisma`: relational schema, initial SQL migration, guarded demo seed and trusted bootstrap.
- `shared/schemas.ts`: request contracts, workflow transitions and requirement rules.
- `docs`: architecture, API, database, authentication, testing and operations.

## Local setup (no Docker required)

Prerequisites: Node 22.12+ or Node 24, npm, PostgreSQL 15+ and a Firebase project with Email/Password sign-in enabled. Install PostgreSQL normally and create an empty development database using pgAdmin or `createdb po_command_center`. Do not point development commands at production.

Windows PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

Git Bash:

```bash
npm ci
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Set root `.env`:

| Variable                         | Purpose                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL connection URL, with URL-encoded credentials                                                                    |
| `PORT`                           | API port; default 4000                                                                                                     |
| `WEB_ORIGIN`                     | Exact browser origin; default http://localhost:5173                                                                        |
| `FIREBASE_PROJECT_ID`            | Firebase project used for backend token verification                                                                       |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to your private Firebase service-account JSON outside the repository, or use application default credentials |
| `BOOTSTRAP_ADMIN_UID`            | Explicitly trusted Firebase UID, only for administrator bootstrap                                                          |
| `BOOTSTRAP_ADMIN_EMAIL`          | Email matching that UID, only for bootstrap                                                                                |
| `ALLOW_DEMO_SEED`                | `true` only when explicitly seeding the non-production demo project                                                        |

Set `frontend/.env` using Firebase Console → Project settings → Web app configuration: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`. These identify the public Firebase web app; never put service-account credentials in `VITE_*` variables. Add localhost to Firebase authorized domains. Restart Vite after changing configuration.

Then, from the repository root (use `npm` instead of `npm.cmd` in Git Bash):

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate -- --name initial
npm.cmd run db:bootstrap
npm.cmd run dev
```

Open http://localhost:5173. The API runs at http://127.0.0.1:4000/api/v1. A missing frontend Firebase configuration produces a setup message rather than fake project data.

## First administrator and subsequent POs

Firebase integration details and the current project setup status are in [Firebase setup](docs/firebase-setup.md). Run `npm run firebase:inspect` for sanitized CLI status and `npm run firebase:check` for configuration readiness. After an authorized operator registers a Web app in the existing project, `npm run firebase:configure` fills matching blank local values without printing credentials.

Create the trusted account in Firebase Authentication first, or register through `/register`. Set its UID/email in the bootstrap variables and run `db:bootstrap`. The script verifies the UID/email against Firebase and creates the `PO` project membership without changing existing memberships. It never promotes the first arbitrary registrant. Sign in, then use Settings to approve additional Firebase accounts by UID. Registering creates an identity only; project membership is always required by the backend.

## Demonstration data

Set `ALLOW_DEMO_SEED=true` in root `.env`, then:

```powershell
npm.cmd run db:seed
```

This creates a separately labelled `DEMO` project, six teams, two sprints, ten tickets and related records. Reruns preserve all existing records. The demo owner is a non-login fixture. A trusted administrator can grant a real Firebase user access to DEMO through an explicitly reviewed database membership operation. The production `PO` project remains empty until you create real teams, sprints and tickets. Remove the seed flag afterwards.

## Checks and builds

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run start -w backend
```

Playwright uses installed Microsoft Edge by default; see [testing](docs/testing.md) for browser selection and fixture limitations. Build outputs are `frontend/dist` and `backend/dist`. Serve frontend assets with SPA fallback and proxy `/api/v1` to the backend; Vite's dev proxy is not included in the production bundle.

## Documentation

[Architecture](docs/architecture.md) · [Database](docs/database.md) · [API](docs/api.md) · [Authentication](docs/authentication.md) · [Development](docs/development.md) · [Testing](docs/testing.md) · [Deployment](docs/deployment.md) · [Inspection](docs/assessment.md) · [Phase report](docs/phase-report.md) · [Implementation report](docs/final-report.md)

Before release, verify real Firebase token/revocation behavior, apply and rerun migrations/seed on disposable PostgreSQL, exercise two actual PO accounts and stale-edit conflicts, and complete the manual accessibility/operations checks in the documentation. Notification delivery and developer/team member accounts are future work.
