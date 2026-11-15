# Testing and verification

`npm test`: Vitest backend and jsdom frontend projects. Supertest tests the actual Express middleware/routes with injected database fixtures. Domain/service tests exercise numbering, membership ownership, sprint/team validation, version compare-and-swap, workflow rules, dependency cycles and audit calls. Frontend tests cover login validation/errors, dashboard counts, ticket creation validation, filter propagation, keyboard board changes, review management, loading/empty states and canonical links.

`npm run test:e2e`: Playwright with installed Microsoft Edge, two browser sessions, explicitly local identity and shared API fixtures. It exercises sign-in, dashboard, ticket creation and assignment, workflow update, visibility to another PO, blocker recording, review resolution, decision traceability, and narrow-screen overflow. It uses the real React screens and forms. It does **not** test live Firebase, Express persistence or PostgreSQL. Vite aliases the Firebase auth SDK only in mode=e2e; normal builds retain the actual SDK. The test server listens on loopback. Never deploy a fixture-mode build.

If Edge is unavailable, change the Playwright project to standard Chromium and install it with `npx playwright install chromium`. Browser installation requires network access and is not silently performed. Failed browser runs retain traces under ignored `test-results`.

Release checks still requiring configured services:

1. Apply migrations on disposable PostgreSQL; inspect constraints and rerun the guarded seed twice, checking no records change on the second run.
2. Bootstrap a trusted Firebase account; register a second account and prove it is denied until approved.
3. Authenticate two real POs; verify the same canonical ticket and its team/sprint/status after refresh.
4. Submit simultaneous creates and confirm unique identifiers; submit two writes with the same version and confirm only one succeeds and the other returns 409.
5. Try cross-project resource IDs, dependency graph races, invalid owners and stale review/decision/blocker versions.
6. Verify comments, decisions and audit events survive subsequent ticket edits and archival.
7. Check keyboard focus trapping/return, screen reader labels, 390px and desktop layouts, reduced motion, browser auth persistence and logout cache behavior.
8. Confirm backups, restore, TLS, log redaction, credential rotation, and rate limits behind the intended proxy.

See `docs/phase-report.md` for actual executed results. Passing mocks must never be reported as live database or identity integration verification.
