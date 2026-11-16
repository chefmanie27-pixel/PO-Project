# Authentication and project access

The current integration and manual setup status are documented in [Firebase setup](firebase-setup.md) and [Firebase verification](firebase-verification.md). The existing project is linked, but a Web app, Admin credentials and PostgreSQL configuration are still required for live acceptance. Use the sanitized `firebase:inspect`, `firebase:configure` and `firebase:check` scripts rather than pasting credentials into logs or chat.

Enable Firebase Email/Password sign-in, register a web app, configure authorized domains, and copy the public web app values to `frontend/.env`. Configure Firebase Admin with project ID and application default credentials on the backend. Keep service-account files outside this repository.

The browser sends a fresh Firebase ID token via Authorization: Bearer. The backend calls `verifyIdToken(token, true)` (including revocation check), resolves the database user by verified Firebase UID, then checks the requested project's database membership. Client-supplied IDs and roles never establish identity. Unknown accounts and nonmembers are denied even if registration succeeded. Tokens are managed by the Firebase client SDK and are not copied to application-managed storage.

Bootstrap requires explicit `BOOTSTRAP_ADMIN_UID` and `BOOTSTRAP_ADMIN_EMAIL`. It queries Firebase to confirm the trusted identity is active and matches the configured email. It creates a PO project and ADMIN membership only when absent. Existing user and membership records are retained. Use Settings for later approvals: create/register the account in Firebase, then grant project access by UID, email and name. This is an approval workflow; no invitation emails are sent.

ADMIN grants membership and edits project settings/teams. ADMIN and PRODUCT_OWNER manage delivery resources. Reserved future roles currently have no access. The API uses one membership gate and a central administrator guard. There is no development bypass in the production backend. Browser fixture identity exists only in an explicit Vite test mode and cannot authenticate to the actual API.

For access revocation, disable the Firebase account and revoke its refresh tokens using trusted Firebase administration. Existing tokens are checked for revocation on each API request. Membership removal and Firebase account deletion are currently operator tasks; self-service deletion is not implemented. Use HTTPS in production and configure credential rotation and retention policies.

Administrator bootstrap now requires explicit BOOTSTRAP_ADMIN_ENABLED=true and is one-time only. Use --check for read-only provisioning diagnosis. See [the current authentication provisioning guide](auth-provisioning.md) before running bootstrap.
