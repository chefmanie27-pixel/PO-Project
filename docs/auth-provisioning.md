# Invitation-required authentication diagnosis

## Cause

The exact invitation-required 403 is emitted by
backend/src/middleware/auth.ts when Firebase verifyIdToken(token, true) succeeds
but User.findUnique({ where: { firebaseUid: decoded.uid } }) returns null.
Database failures produce 503, not this 403. A matching email, Firebase
registration, profile display name or browser role does not establish membership.
The reported request therefore had no application User matching its verified
Firebase UID at that time. A missing initial bootstrap is consistent with the
previously empty production database, but the signed-in account and deployed
database were not independently inspected from this session.

Firebase validates issuer/audience/project and checks revocation through Admin.
Invitations are administrator approvals, not email links or a separate invitation
table. Membership approval verifies that UID/email identify an active Firebase
account, then creates the application User and project membership transactionally.
Email cannot be used to relink an account automatically; mismatches require private
administrator review.

ADMIN and PRODUCT_OWNER both have project read and delivery permissions.
Only ADMIN has project:manage for granting memberships. Roles are project-scoped.
Listing filters by internal user ID and readable membership roles; individual
project requests recheck membership. Removed memberships cannot be restored through
login. Reserved roles have no grants. Existing permission checks were correct
and were retained.

## Small secure change

The existing operator bootstrap was repeatable with a different configured UID,
and lacked a durable completion marker and focused tests. It now:

- Requires BOOTSTRAP_ADMIN_ENABLED=true for a write operation.
- Verifies the exact configured UID and case-insensitive email against an active
  Firebase identity in the existing server Firebase project.
- Serializes bootstrap attempts using a transaction-scoped PostgreSQL advisory lock.
- Skips all provisioning when an ADMIN already exists or the bootstrap audit
  marker exists. This is not an administrator recovery or escalation mechanism.
- Rejects conflicting email/UID records and refuses to elevate an existing
  membership; existing profiles, owners, memberships and roles remain untouched.
- Creates only the configured initial User, missing PO workspace, ADMIN membership
  and durable AuditEvent completion marker in one transaction.
- Does not execute on login or server startup.
- Logs only fixed statuses and safe configuration failure guidance, not raw Firebase
  or Prisma errors.
- Supports a read-only --check mode reporting booleans without UID/email output.

No schema/migration change is required. No Firebase users, production records,
roles, production variables, or deployment settings were modified here.
Populated private configuration was removed from tracked .env.example and replaced
with placeholders. Historical copies remain in Git; rotate any credential reused
outside local development through the normal credential management process.

## Safe Render diagnosis

After separately approving and deploying this code, configure only on the backend:

| Variable                | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| BOOTSTRAP_ADMIN_UID     | Exact UID copied privately from the intended Firebase account |
| BOOTSTRAP_ADMIN_EMAIL   | Email of that same active account                             |
| BOOTSTRAP_ADMIN_ENABLED | false for diagnosis; true only for an approved write run      |

Keep DATABASE_URL, FIREBASE_PROJECT_ID and existing Admin credentials pointing to
the intended existing production resources. Do not use VITE_ prefixes.

From the repository root in the existing Render backend shell:

```sh
npm run bootstrap -w backend -- --check
```

This verifies Firebase identity and reads application state without modifying it.
Output includes accountProvisioned, identityConflict, hasProjectAccess and
bootstrapAvailable. If accountProvisioned=false but bootstrapAvailable=false,
an existing administrator must approve the account. If identityConflict=true,
review the stored UID/email privately; do not replace UIDs or merge accounts based
solely on a matching email.

## Approved initial administrator provisioning

Only if bootstrapAvailable=true, the intended identity has been independently
confirmed, and the operator explicitly approves production data/permission changes:

1. Temporarily set BOOTSTRAP_ADMIN_ENABLED=true on the backend. Changing Render
   environment variables may restart/deploy the service; obtain release approval
   first. Existing startup still applies pending migrations.
2. Run from repository root:
   npm run bootstrap -w backend
3. Verify administrator_bootstrap status=created (or already_initialized with no
   writes). Then run the read-only check again.
4. Remove BOOTSTRAP_ADMIN_ENABLED or set false and remove the bootstrap identity
   configuration when no longer needed, following the approved restart process.
5. Sign out and sign in normally; verify /profile and /projects return 200 and the
   authorized dashboard works.
6. Existing administrators add subsequent approved users through project Settings.
   Do not rerun bootstrap as a means to grant more administrator memberships.

If another administrator already exists, use that administrator's membership
workflow. If access to every administrator is lost, use a separate reviewed recovery
procedure; the one-time bootstrap deliberately does not recover revoked access.

## Verification scope

Tests cover initial provisioning, explicit enablement, identity mismatch, disabled
Firebase identities, existing administrators, durable completion after revocation,
role preservation, email/UID conflicts, read-only checks, ADMIN and PRODUCT_OWNER
project access, unapproved identities, project-list scoping, absent membership,
revoked membership and revoked/disabled Firebase access.

Production provisioning status and live authenticated dashboard success still
require the approved deployment and private operator check. Do not interpret
local fixture tests as production verification.

Local verification completed: all 166 tests across 27 files passed; TypeScript, lint, both production builds, Prisma client generation and whitespace checks passed. Changes remain local and uncommitted; no production writes or deployment occurred.
