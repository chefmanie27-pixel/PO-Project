# Project and team management

Authenticated users land on `/projects`. The catalog lists only authorized projects, with search, status filters, team/ticket/blocker counts and current sprint. Opening a card enters `/projects/:projectId/dashboard`; all workspace pages and links retain that project ID. Switching projects resets feature-local state and uses separate project query keys.

## Permissions and lifecycle

An existing ADMIN or PRODUCT_OWNER membership authorizes project creation. Registration alone does not. The creator becomes the new project's administrator and initial owner; membership approvals remain administrator-only. Project owners and responsible team POs must be ADMIN or PRODUCT_OWNER members of that project. Future roles have no delivery permissions by default. Authorization is enforced by the API using `shared/permissions.ts`.

Projects support metadata, dates, ownership, statuses, archive and reactivation. Project codes are immutable after creation to preserve ticket identifiers. Teams support custom names, descriptions, codes, responsible POs, statuses, archive and reactivation. Team codes are unique within a project; project codes are globally unique. Blank codes are generated server-side. New projects start with zero teams.

Project/team PATCH requests require the current `version`; stale writes return 409 and require a refresh. Archiving preserves IDs, memberships, tickets, comments, dependencies, sprints, audit history and linked records. Archived projects are readable but reject delivery writes. Archived teams remain visible through archive filters and detail URLs. New ticket assignments exclude archived teams; an existing ticket may retain its archived team while other fields are edited. Reactivation restores assignment eligibility. There are no project/team delete endpoints.

## Database and migration

`202611150004_project_team_management` adds project metadata, ownership, archive state and versions; team codes, responsible POs, archive state and versions; indexes, foreign keys and validation constraints. It does not recreate tables or remove records. Existing project owners are selected deterministically from approved memberships, preferring administrators. Existing teams inherit that owner and receive unique UUID-derived codes that can subsequently be edited. Projects without an approved member retain a nullable owner until configured.

The migration was applied to the existing local development database after creating an ignored backup in `.cache/postgresql/project-team-before.dump`. The existing project, six teams and ticket retained their IDs. Test fixtures use rolled-back transactions. Do not apply migrations to production without a separately authorized release and backup process.

For an existing configured checkout, run from Git Bash:

```bash
npm run db:generate
npm run db:deploy
npm run dev
```

Open http://localhost:5173/projects and sign in with an approved Firebase account. Existing `.env` files should be retained. PostgreSQL remains the application database; Firebase provides authentication. No live Firebase resources or Firestore rules were changed for this feature.

## API additions

Base `/api/v1`, authenticated with a Firebase bearer token:

| Method      | Path                                 | Behavior                                                       |
| ----------- | ------------------------------------ | -------------------------------------------------------------- |
| GET         | `/projects`                          | Authorized summaries; optional search, status, includeArchived |
| POST        | `/projects`                          | Create project and creator membership atomically               |
| GET / PATCH | `/projects/:projectId`               | Read or update metadata/lifecycle with version                 |
| GET / POST  | `/projects/:projectId/teams`         | List current teams (includeArchived optional) or create        |
| GET / PATCH | `/projects/:projectId/teams/:teamId` | Scoped workload detail or versioned update/lifecycle           |

Creation contracts are in `shared/management.ts`. Project/team updates accept `archived: true` or `false`, with `version`. Existing ticket APIs remain canonical; team views reference the same ticket IDs rather than making copies.

## Verification

For the subsequent delivery workflow completion and latest regression counts, see [dynamic platform verification](dynamic-platform.md). The results below record the earlier project/team phase.

Local verification completed on 2026-11-15: 76 unit/component/API regression tests, six real PostgreSQL/API tests, two fixture browser workflows, 12 Firebase emulator integration tests and one real Auth-emulator browser workflow passed. TypeScript, ESLint and backend/frontend production builds passed. Desktop, tablet and mobile screenshots were checked. The running local API readiness and frontend returned HTTP 200. No deployment was performed.

- Unit/component/API regression suite: `npm test`.
- Real local PostgreSQL/API integration tests: `npm run test:database` (isolated transaction fixtures, rolled back).
- Browser fixtures: `npm run test:e2e`; project/team creation, edits, reload, archives, history, project switching, isolation and responsive views.
- Firebase Auth/Firestore emulators: `npm run test:firebase:emulators`; no live resource changes.
- Static and release checks: `npm run typecheck`, `npm run lint`, `npm run build`.

Browser fixture tests verify the full React flow but do not prove two real users' production sessions. The PostgreSQL tests exercise actual constraints and API behavior with injected verified identities. Before release, exercise multiple approved Firebase accounts in a separately authorized staging environment. Large projects will eventually need paginated/aggregate team workloads instead of returning full ticket lists.
