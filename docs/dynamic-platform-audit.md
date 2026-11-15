# Dynamic platform audit and completion plan

## Baseline

The existing React/Express/Prisma/PostgreSQL application already loads business records from authenticated APIs. Firebase provides identity; SQL memberships authorize project access. Project/team creation, editing, archive/reactivation, scoped routes, canonical tickets, comments, dependencies, audit history and versioned ticket/PO-record edits work and must be preserved. Demo records are confined to an explicitly guarded optional seed. New projects have no delivery records.

## Gaps found

- Sprints have dates and boards but no explicit lifecycle, stale-edit protection or direct backlog selection.
- Parent/dependency and review/blocker/decision links ask users for UUIDs.
- PO record filters apply after pagination, producing incomplete results.
- Dashboard data is real but activity, team workload, proposed decisions and empty-project onboarding need clearer presentation.
- Dialog cancellation can silently discard drafts, save feedback is inconsistent, secondary query errors can look like empty data.
- Header profile link uses an obsolete flat route. Existing desktop sidebar collapse works and should be retained, with its My Projects link kept usable when collapsed. Notification preference advertises future delivery.
- Archived-project checks need transaction locks across remaining write routes. Decision ticket IDs need deduplication. Network/session failures need explicit handling.

## Plan

1. Add safe sprint lifecycle/version migration, transactional transitions and archive write protection; fix server-side record filters.
2. Add project-scoped searchable ticket selectors, direct sprint planning, lifecycle actions, record histories and complete dashboard reporting.
3. Improve form disclosure, draft protection, success/loading/error feedback, empty-state actions, responsive navigation and accessibility.
4. Run static checks, regression tests, PostgreSQL integration, complete browser journeys and emulator authentication tests. Record actual results and remaining verification limits.

Existing uncommitted work is retained. No reset, production change, automatic demo seed or deployment is authorized.

## Outcome

The listed workflow gaps are implemented locally. Existing database-backed project/team/ticket flows were reused. The sprint migration was applied after backup; prior IDs remain intact. Added backend lifecycle, record updates and filtering; searchable links, guided forms, draft protection and real dashboard reporting; paginated history, retry/reconnect feedback and actionable empty states. The obsolete profile link and misleading notification-delivery preference were removed or corrected.

Static checks, production builds, 87 regression tests, 11 PostgreSQL/API tests and both full browser journeys passed. The emulator integration suite now contains 13 tests, including a combined real Firebase identity/Express/PostgreSQL collaboration journey. Follow-up hardening rejects archived metadata writes and rechecks administrator permissions inside membership transactions. See [implementation and verification boundaries](dynamic-platform.md) for emulator checks, staging acceptance, polling and workload scaling limits. No release or production acceptance is implied by these local results.
