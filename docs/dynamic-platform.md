# Dynamic PO Command Center

The application uses React/TypeScript and TanStack Query for its project-scoped UI, Express for authenticated APIs, Prisma/PostgreSQL for business data, and Firebase Authentication for identity. The optional guarded demo seed is independent of runtime functionality. New projects have no teams, tickets or sprints.

## Daily workflow

1. Sign in and open **My Projects**. Approved Product Owners can create a project; arbitrary registration never grants project privileges.
2. Open a project, create custom teams, and add backlog tickets. Start with a title and responsible PO; requirements can be refined later. Advanced requirement fields are collapsed for new tickets.
3. Select parent, dependency and PO-record ticket links by searchable title/identifier. UUID entry is no longer required for those workflows.
4. Create a sprint with a goal and dates. Open **Plan sprint tickets** to assign existing canonical tickets or remove assignments. Start the sprint explicitly; selected Backlog tickets become Ready.
5. Move tickets through Ready, In Progress, In Review and Done using drag/drop or keyboard-accessible selectors. Blockers remain separate and prevent completion until resolved.
6. Complete the sprint with confirmation. Done tickets remain in its history. Unfinished work returns to the product backlog, preserving ticket IDs, requirements, comments, dependencies and audit history. Completed sprints reject new assignments.
7. Use reviews, blockers and decisions for PO work. Resolve/reopen reviews through Manage; use comments/history for persistent updates. Decision history includes readable before/after edits. Review attention includes open blockers and proposed decisions.

The dashboard queries real tickets, counts, active sprint, activity, team workload and proposed decisions. Empty projects offer onboarding actions. Project switching scopes caches and feature state to the selected project. Mutations invalidate relevant queries and show success only after backend success.

## Integrity and concurrency

- Authorization comes from trusted SQL memberships, never frontend roles. Future roles remain denied until capabilities are explicitly granted.
- Ticket, project, team, sprint and PO-record edits use versions to reject stale writes. Retain your draft, inspect the current record and reconcile before retrying.
- Project locks serialize delivery writes against archive/reactivation and sprint lifecycle changes. The database enforces foreign keys and unique project/team/ticket identifiers.
- One sprint can be ACTIVE per project. Transitions are PLANNED -> ACTIVE -> COMPLETED. There is no implicit date-driven start or reopening of completed sprints.
- Existing sprint records migrate to PLANNED; their dates, tickets and IDs are preserved. Start them explicitly when ready.
- Record search/status filters run before pagination. Priority sorting follows Critical, High, Medium, Low before pagination; ascending/descending controls are available.
- Ticket assignment rejects other-project teams/sprints/owners and new assignments to archived teams. Existing historical assignments can be retained during ordinary edits.
- Archived projects expose history while delivery controls are disabled and write APIs reject changes. Archive does not delete business records.
- Modal cancellation/Escape/close, route navigation and browser unload warn about unsaved changes. Network failures retain form state; unavailable queries offer retries; expired sessions offer reconnect/sign-out guidance. Feature state resets when navigating between workspace pages, preventing record filters and editors from carrying over to another feature.

## API changes

All routes below are under `/api/v1/projects/:projectId`, require Firebase bearer authentication and authorized project membership:

| Method | Route                                 | Contract                                                                                                   |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/sprints`                            | Name, optional goal, ISO start/end dates                                                                   |
| PATCH  | `/sprints/:id`                        | Sprint metadata plus current version                                                                       |
| POST   | `/sprints/:id/transition`             | version, action START or COMPLETE; explicit returnUnfinishedToBacklog for completion with outstanding work |
| GET    | `/reviews`, `/blockers`, `/decisions` | page, limit, optional status, search, ownerId; filtering before pagination                                 |
| POST   | `/:kind/:id/updates`                  | body, 1-10000 characters; kind reviews/blockers/decisions                                                  |
| GET    | `/audit-events?entityId=...`          | Project-scoped comments and edit history                                                                   |
| GET    | `/dashboard`                          | Existing metrics plus activity, workload and proposedDecisions                                             |
| GET    | `/tickets`                            | Existing filters, real priority ordering and direction                                                     |

Updates are stored as append-only audit events with actor and timestamp. They do not create duplicate tickets, reviews, blockers or decisions. Existing review notes and blocker resolution notes remain versioned business fields.

## Local setup

Keep existing `.env` files and credentials. From Git Bash in the repository root:

```bash
npm run db:generate
npm run db:deploy
npm run dev
```

Open http://localhost:5173/projects. The backend listens on http://127.0.0.1:4000 and `/api/v1/ready` checks database connectivity. Do not reset or reseed the database. `202611150005_sprint_lifecycle` is additive and was applied locally after a protected, ignored backup in `.cache/postgresql`.

## Verification boundaries

Local verification on 2026-11-15 passed TypeScript, ESLint, 85 unit/component/API regression tests, 11 real PostgreSQL/API journey tests and backend/frontend production builds. Existing database IDs were compared with the protected pre-change snapshot and preserved. The running local frontend and database readiness endpoint returned HTTP 200. Firebase emulators passed 12 integration tests and the authentication browser workflow; no live Firebase resources were changed.

Both complete React browser workflows passed, including project/team creation, sprint planning/start/status changes/reload/completion, ticket preservation, project switching/isolation, and persistent PO review updates. Desktop, tablet and mobile screenshots were reviewed. Unsaved route navigation is tested separately from successful-save navigation. Audit history has working older/newer pagination.

The final PostgreSQL run also verifies that sprint ticket responses include the responsible PO and current team name after a rename. Final Firebase verification after the routing changes passed all 12 integration tests and its browser registration/session/logout/approval workflow.

The automated suite includes rollback-only tests against actual local PostgreSQL and Express, browser fixtures for complete React journeys and responsive layouts, and real Firebase Auth/Firestore emulator tests. PostgreSQL tests exercise shared edits by multiple authorized SQL identities; browser collaboration uses fixture identities. They do not establish production behavior for multiple live Firebase users. A separately authorized staging acceptance test remains necessary before release.

### Combined identity/database verification

The emulator suite additionally includes `backend/integration/collaboration.test.ts`: two actual emulator accounts sign in, receive approved SQL memberships, share and edit a canonical ticket through the real Express authentication middleware, handle stale edits, complete a sprint and read actual PostgreSQL dashboard/audit results. Unapproved identities, unauthorized administrator grants and disabled accounts are rejected. The transaction is rolled back, and the test confirms its SQL project and user no longer exist. No authentication or database models are mocked in this combined test; the database transaction facade keeps every API operation inside the rollback-only fixture.

Run `npm run test:firebase:emulators` with the local PostgreSQL service running and the existing root `DATABASE_URL` configured. It now runs 13 integration tests plus the authentication browser workflow. The test refuses non-loopback databases/emulators or a non-demo Firebase project. Live Firebase accounts and production resources are untouched.

Additional hardening rechecks administrator membership inside the locked membership transaction, rejects metadata writes to archived projects until explicit reactivation, and omits completed sprints from upcoming milestones. Regression tests cover a role changing or disappearing between request authorization and the transaction. The updated regression suite contains 87 tests; the real PostgreSQL/API suite contains 11.

Data refreshes through query invalidation and 30-second polling, rather than push subscriptions. Team/sprint workloads and dashboard aggregates still read full project workloads; large installations should add aggregate/paginated workloads. Notification delivery is not implemented and its misleading preference control has been removed. Existing stored notification preferences remain intact. No production resources were modified or deployed.

The subsequent [release-readiness pass](release-readiness.md) adds automated accessibility/keyboard checks, patched development dependencies and a measured 10,000-ticket benchmark. Workload collections now omit full requirement text while preserving all stored data and ticket detail access.
