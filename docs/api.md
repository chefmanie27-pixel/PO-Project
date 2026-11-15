# API reference

Firebase authentication now returns HTTP 503 for unavailable server credentials/auth services or account database outages, HTTP 401 for invalid/revoked/disabled identities, and HTTP 403 for valid but unapproved identities. Administrator membership grants validate the target Firebase UID/email before writing SQL membership. See [Firebase setup](firebase-setup.md).

Base: `/api/v1`. JSON success shape: `{ "data": ... }`; paginated collections add `meta: {page,limit,total}`. Error shape: `{ "error": { "message": "...", "issues": ... } }`. Validation issues are supplied for Zod errors. HTTP 400 invalid input, 401 invalid/missing identity, 403 membership/role denial, 404 missing resource, 409 concurrent edit or uniqueness conflict, 500 safe generic failure.

All endpoints except `/health` require `Authorization: Bearer <Firebase ID token>`. Project routes require a UUID project ID and ADMIN or PRODUCT_OWNER membership. ADMIN is additionally required for project settings, membership approvals and team configuration. This reference plus `shared/schemas.ts` is the maintainable contract source.

| Method      | Path                                                  | Contract                                                                             |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET         | /health                                               | Process liveness (not database readiness)                                            |
| GET / PATCH | /profile                                              | Current user / update name and notifications boolean                                 |
| GET         | /projects                                             | Authorized projects                                                                  |
| GET / PATCH | /projects/:projectId                                  | Project / admin update name, description                                             |
| GET / POST  | /projects/:projectId/memberships                      | Member contacts / admin grant with firebaseUid,email,name,role                       |
| GET         | /projects/:projectId/dashboard                        | Computed ticket counts, recent work, reviews, blockers, decisions and sprint dates   |
| GET / POST  | /projects/:projectId/tickets                          | Paginated canonical backlog / ticketSchema                                           |
| GET / PATCH | /projects/:projectId/tickets/:id                      | Full detail / ticketUpdateSchema (required version, optional archived)               |
| POST        | /projects/:projectId/tickets/:id/reorder              | Required version and direction up/down; normalize canonical ordering transactionally |
| POST        | /projects/:projectId/tickets/:id/comments             | body string, 1–10000 characters                                                      |
| POST        | /projects/:projectId/tickets/:id/dependencies         | dependsOnId UUID, acyclic and same project                                           |
| DELETE      | /projects/:projectId/tickets/:id/dependencies/:target | Remove link, preserve audit                                                          |
| GET / POST  | /projects/:projectId/sprints                          | Sprints with canonical tickets / sprintSchema                                        |
| PATCH       | /projects/:projectId/sprints/:id                      | Full sprintSchema                                                                    |
| GET / POST  | /projects/:projectId/teams                            | Team workload / admin create name, description                                       |
| GET / POST  | /projects/:projectId/reviews                          | Paginated requests / reviewSchema                                                    |
| PATCH       | /projects/:projectId/reviews/:id                      | Full reviewSchema plus current version; OPEN or RESOLVED                             |
| GET         | /projects/:projectId/review-indicators                | Purely derived requirement gaps and awaiting-review checks                           |
| GET / POST  | /projects/:projectId/blockers                         | Paginated blockers / blockerSchema                                                   |
| PATCH       | /projects/:projectId/blockers/:id                     | Full blockerSchema plus version; resolved requires resolutionNotes                   |
| GET / POST  | /projects/:projectId/decisions                        | Paginated decisions with linked tickets / decisionSchema                             |
| PATCH       | /projects/:projectId/decisions/:id                    | Full decisionSchema plus version; change history in audit                            |
| GET         | /projects/:projectId/audit-events                     | Page/limit, optional entityId; newest first                                          |

Collection pagination defaults page=1, limit=30, maximum limit=100. Ticket filters: search (title or identifier), status, priority, sprintId, teamId, ownerId; sort=rank/updatedAt/createdAt/title/priority; direction=asc/desc. Dashboard accepts sprintId, teamId, ownerId. Other resource lists currently paginate but filter status on the current UI page. Sprint/team collections include full workload and should be moved to aggregate/paginated queries at larger scale.

Ticket creation requires title and ownerId; defaults type USER_STORY, priority MEDIUM, status BACKLOG. Optional context fields accept UUID or null. New tickets start in Backlog. Allowed transitions: Backlog↔Ready↔In Progress↔In Review↔Done. Same-status edits are permitted. Blocked is independent; unresolved blockers prevent moving to Done.

Conflict handling: retain your draft, obtain latest GET detail, compare changed fields, then resubmit with the latest version. The application never automatically retries a conflicting mutation. Current dialog offers a safe discard-and-refresh path; manual draft comparison can be done before closing. Sprint and project setting edits currently use last-write-wins and do not have version protection.
