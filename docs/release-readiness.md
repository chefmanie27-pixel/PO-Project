# Release readiness — local verification

The implementation plan has completed Phases 1–5 and the automated local portion of Phase 6. The application remains local; staging acceptance and release authorization are separate gates.

Verified suites: 97 regression tests, 11 PostgreSQL/API tests, 13 Firebase/database integration tests, one larger-data benchmark, one real concurrent-transaction test, two full application browser journeys and one real Auth-emulator browser journey. TypeScript, ESLint and production builds pass. The local API readiness and frontend both return HTTP 200.

## Accessibility and keyboard verification

Playwright now runs axe WCAG 2.0/2.1 A/AA scans through the actual React screens and dialogs. Coverage includes the project catalog, project editors, team list/detail, sprint board, ticket editor/detail, reviews, blockers, decisions and desktop/mobile dashboards.

This pass fixed initial dialog focus, forward/reverse Tab containment, Escape dismissal, return of focus to the opening button, missing names on dashboard icon links, and footer contrast. Ticket validation errors now expose invalid state and descriptive error associations; requirement text fields enforce their supported lengths. Project editors are also checked against mobile viewport bounds.

The final browser run saved **14 audited states with zero automated WCAG violations**. Mobile project dialogs were visually reviewed after centering and clarifying required-field/helper text. Axe still reports manual-review items for short logo text, decorative symbols, the sidebar gradient and the notification-dismiss glyph; these are retained in the JSON evidence rather than silently excluded. Human assistive-technology acceptance is not claimed.

Each scan saves an `accessibility-*.json` file in its ignored `test-results` directory, including unresolved automated-review items. A passing scan does not imply full WCAG certification. A human screen-reader review remains a release gate.

## Larger-data verification

`npm run test:performance` creates **10,000 tickets, 100 teams and 20 sprints** in one local PostgreSQL transaction, exercises actual Express/API queries three times per endpoint, validates counts/pagination and payload/latency budgets, then rolls back and verifies that the fixture project is gone. It refuses a non-loopback or differently named database. Existing business data is untouched.

The initial workload endpoints unnecessarily included full requirements. They now return canonical ticket IDs, versions, assignment/status information and lightweight relationships; full requirements remain on the protected ticket detail endpoint. No stored text was removed. Team current-work counts use ACTIVE sprint state consistently with the dashboard.

Measured locally on 2026-11-15, sequential requests, three samples each:

| Endpoint                         | Maximum observed latency | Final response size |
| -------------------------------- | -----------------------: | ------------------: |
| Backlog, 30 tickets              |                   116 ms |       112,951 bytes |
| Priority-sorted page, 30 tickets |                    42 ms |       113,278 bytes |
| Dashboard                        |                 1,174 ms |       440,550 bytes |
| All team workloads               |                 1,081 ms |     8,417,282 bytes |
| All sprint workloads             |                   619 ms |     6,628,789 bytes |

Team payloads fell from 36,175,372 to 8,417,282 bytes (about 77%); sprint payloads fell from 31,906,879 to 6,628,789 bytes (about 79%). Local acceptance budgets are under 5 seconds per request, under 512 KiB per ticket page, under 2 MiB for the dashboard and under 10 MiB for each workload collection.

The latest machine-readable report is ignored at `.cache/verification/scale-latest.json`. These are local sequential-request measurements, not a production SLA or a concurrent-user load test. Whole-project workload lists still grow with ticket volume; larger installations should use aggregate/paginated workload endpoints.

## Dependency verification

The development test runner was upgraded to Vitest 5.1 to remove its reported critical advisories. The linter's transitive `minimatch` uses a scoped override to patched 11.0.1-compatible releases because the upstream package still requests the affected major range. Current lint/tests verify the installed toolchain. No production dependency major upgrade was forced. `npm audit` reports zero known vulnerabilities at this verification time; this is not a guarantee against undisclosed issues.

## Remaining release gates

### Local concurrency and staging preparation

The isolated-schema concurrency run passed using four distinct PostgreSQL connections, eight concurrent writers and ten concurrent readers. Forty creates generated unique canonical identifiers. Competing edits and sprint starts returned one 200 and one 409; an archive/write race rejected work after archive. The latest run measured create p95 449 ms and read p95 259 ms. The temporary schema was removed and all previously recorded public application IDs remained present. This is a local API workload with synthetic identities, not a deployed-capacity guarantee.

A fresh staging release can be generated with `npm run staging:prepare`; its output names the new ignored release directory. The release manifest verifies file hashes and absence of unlisted files. Private environment files and Admin credentials are excluded. Render was selected for temporary free staging, and the root Blueprint plus optional combined SPA/API hosting are implemented. **Render account connection remains pending. No public environment, live-account acceptance or deployment has been performed.** See [staging setup and acceptance](staging-acceptance.md).

The real-database regression suite now passes 12 tests, including linked decision creation. That test caught and fixed an invalid nested Prisma child field that mocked API coverage had missed. The normal regression suite passes 99 tests. Two additional local acceptance tests pass: synthetic schema backup/restore with relationship/history preservation, and verified-certificate localhost HTTPS/proxy checks. These do not replace hosted acceptance.

| Gate                                                                 | Current status                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Local functionality, database integrity and isolation                | Automated verification passed                                                          |
| Real emulator identity + Express + PostgreSQL collaboration          | Passed with two emulator accounts and rollback-only SQL data                           |
| Responsive layouts, automated accessibility and keyboard interaction | Automated checks and screenshot review; human screen-reader acceptance remains         |
| Local larger-data response budgets                                   | Passed at 10,000 tickets; local 8-writer/10-reader concurrent transactions also passed |
| Reviewable staging bundle                                            | Prepared and integrity-checked; actual environment remains unconfigured                |
| Staging with live Firebase accounts                                  | Not performed; needs an authorized staging target and test accounts                    |
| Deployment-specific TLS, proxy/rate limits and restore drill         | Local restore and HTTPS proxy contract passed; hosted verification remains             |
| Production deployment                                                | Not authorized or performed                                                            |

The next implementation-plan step is **Render account connection, staging deployment and human acceptance**. While connection is pending, run locally with `npm run dev` and open http://localhost:5173/projects. Production deployment remains separate and unauthorized.
