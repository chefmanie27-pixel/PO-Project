# Development

Use Node 24 and `npm ci` from the root. On Windows with PowerShell script execution restrictions, use `npm.cmd`; do not change system execution policy. Root `.env` configures the backend; `frontend/.env` configures Vite. Root scripts use npm workspaces and work from PowerShell or Git Bash. See README for non-Docker PostgreSQL and Firebase setup.

`npm run dev` runs Vite and tsx watch concurrently. The browser dev server proxies /api to port 4000. `npm run db:generate` regenerates types, `npm run db:migrate -- --name description` applies development migrations, `npm run db:seed` creates opt-in demo records, and `npm run db:bootstrap` approves an explicitly trusted administrator.

Before changes, inspect Git status. After changes run `npm run typecheck`, `npm run lint`, `npm test`, the relevant Playwright checks, and `npm run build`. Use `npm run format` to format source and documentation. Never commit `.env`, private keys or service account JSON. Generated builds, test reports and node_modules are ignored. No Git commits or remote pushes are performed by this implementation.

API failures surface in the UI. A missing Firebase config disables sign-in with a setup message. A registered but unapproved account sees a membership error and can sign out. There is no automatic demo fallback. For safe isolated browser testing use the dedicated `test:e2e` command; never deploy an e2e-mode build.
