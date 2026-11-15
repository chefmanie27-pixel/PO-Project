# Firebase Admin authentication on Render

The former initialization always used `applicationDefault()`. When no usable credential file or local ADC credentials are available, Google ADC tries the attached service-account metadata server. Render does not supply a Google service identity, so this can produce MetadataLookupWarning, ENOTFOUND/ETIMEDOUT and authenticated API 503s while SQL readiness remains healthy. Public health/readiness only checked Express/PostgreSQL. See [Google ADC lookup order](https://docs.cloud.google.com/docs/authentication/application-default-credentials) and [Firebase Admin setup for non-Google servers](https://firebase.google.com/docs/admin/setup).

The backend now supports explicit service-account environment variables and secret files using `cert()`. It checks credentials during startup, without requesting an OAuth token. On Render, missing explicit credentials fail startup immediately instead of trying metadata discovery. Local non-Render development retains ADC support and existing credential files. Loopback demo emulators remain available only outside production; token verification and revocation checking (`verifyIdToken(token, true)`) are unchanged.

## Option A: Backend environment variables

On the **existing backend service**, set:

```dotenv
NODE_ENV=production
FIREBASE_PROJECT_ID=po-project-eca90
FIREBASE_CLIENT_EMAIL=<client_email from the authorized service-account JSON>
FIREBASE_PRIVATE_KEY=<private_key from the same service-account JSON>
WEB_ORIGIN=https://po-project-1.onrender.com
```

Keep the existing `DATABASE_URL` and other runtime values unchanged. `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` must come from the same existing authorized service account for this project. The project ID alone is not a credential. Do not use your personal email as the service-account email.

Render accepts a real multiline private key; the backend also converts literal `\n` and `\r\n` sequences to newlines and normalizes Windows CRLF. Paste only the key value, with its original PEM boundaries intact, without surrounding JSON quotes. Do not paste the entire JSON document into `FIREBASE_PRIVATE_KEY`. Do not put these variables on the Static Site or prefix them with `VITE_`.

Complete environment credentials take priority over the file option. If only one environment field is set, startup fails rather than silently falling back to other credentials. Remove stale `GOOGLE_APPLICATION_CREDENTIALS` settings if choosing this option to keep configuration clear.

## Option B: Backend secret file

Alternatively, upload the existing authorized JSON in Render **Secret Files** as `firebase-admin.json` and set:

```dotenv
FIREBASE_PROJECT_ID=po-project-eca90
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json
```

Leave `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` unset when selecting file mode. The backend reads the file directly, requires service-account JSON, validates the project ID and RSA private key, and passes the account explicitly to `cert()`. An unreadable file or wrong project produces a safe configuration error. A Windows path from local `.env` cannot be used on Render. No new credential needs to be generated if the existing account is valid and authorized.

## Release and verification

1. Commit and push the reviewed code changes, excluding `.env`, private keys and account JSON. Configure one credential option through Render's private backend environment settings. Do not paste secrets in chat or build logs.
2. Build from the repository root with `npm ci --include=dev && npm run build`; start with `npm run start -w backend`. Neither command applies migrations or changes database records.
3. Deploy/restart the existing backend through the authorized Render release process. This local fix does not deploy or change live credentials.
4. Check for `firebase_admin_initialized` with `credentialSource` equal to `environment` or `service-account-file`. Initialization success means local configuration was accepted; it does not prove the key is active or the service account has required IAM permissions.
5. Sign in to the frontend with an approved existing account. Verify `/api/v1/profile` and `/api/v1/projects` return 200 using its normal Firebase bearer token. A valid Firebase identity without a database invitation still receives 403. Missing/expired/revoked tokens remain rejected. Do not create production records as an authentication test.
6. If valid sign-in still returns 503, inspect the safe `firebase_admin_unavailable` reason and confirm the key is active, belongs to this project, and its account has the required Firebase Authentication read permissions and network access. Never bypass verification or grant broad Owner access as a workaround.

Diagnostics log only fixed event/reason labels and credential source. They never log the private key, client email, account JSON, path, bearer token or raw SDK exception. Unavailable-verification warnings are limited to once per reason per process. Existing request logging redacts the Authorization header.

Tests use generated synthetic RSA keys, temporary synthetic account files, mocked initialization and local demo emulators. They make no live OAuth requests. Successful local configuration tests cannot certify production key validity, IAM permissions or hosted authentication; authenticated hosted acceptance remains a separate step.
