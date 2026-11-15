# Architecture

Browser → Firebase identity → Bearer ID token → Express authentication → database project membership → validated domain operations → PostgreSQL.

The npm workspace has one Vite browser app and one Express API. Shared Zod schemas define ticket, sprint, blocker, review and decision contracts and status transitions. TanStack Query owns server state, invalidates all project queries after a successful mutation, and refreshes shared views every 30 seconds. React Hook Form provides field validation. Firebase SDK manages identity tokens; the API verifies revocation and never trusts browser-supplied roles.

Tickets are canonical rows referenced by team, sprint, parent, dependencies, comments, decisions, blockers and reviews. Blocked is derived from unresolved blockers and never replaces workflow status. Automatic review checks are calculated without inserting records. Explicit reviews are persisted and versioned.

Ticket domain services own relationship validation, row locking, version compare-and-swap, identifiers, graph checks and audit writes. Other resource handlers currently colocate orchestration in the API module; extracting them into resource services is a recommended maintainability follow-up. Prisma supplies a shared database client. Error middleware converts validation, conflicts, permission failures and unknown errors into consistent safe responses.

Project-row locks serialize ticket mutation and dependency graph changes within a project. This trades write throughput for predictable MVP correctness. PostgreSQL transactions ensure identifier increments, business writes and audit events commit together. The API offers no hard-delete operation for business records. Tickets are archived.

Identity and project authorization are intentionally separate. ADMIN can configure the project and memberships. PRODUCT_OWNER can read and write delivery resources. Other role names are reserved but denied until explicitly granted capabilities. No WebSocket infrastructure, external ticket synchronization, AI features, or external account integrations are included.
