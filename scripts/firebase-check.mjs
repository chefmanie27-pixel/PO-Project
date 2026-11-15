import { readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import { configuredProject } from "./firebase-inspect.mjs";
import pg from "pg";
const projectId = configuredProject();
const readEnv = (path) =>
  existsSync(path) ? parse(readFileSync(path, "utf8")) : {};
const server = { ...readEnv(".env"), ...process.env };
const client = readEnv("frontend/.env");
const webKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
];
const publicConfigReady = webKeys.every((key) => Boolean(client[key]));
const backendProjectMatches = server.FIREBASE_PROJECT_ID === projectId;
const frontendProjectMatches = client.VITE_FIREBASE_PROJECT_ID === projectId;
const credentialEnvironmentPartial =
  Boolean(server.FIREBASE_CLIENT_EMAIL) !==
  Boolean(server.FIREBASE_PRIVATE_KEY);
const credentialEnvironmentConfigured = Boolean(
  server.FIREBASE_CLIENT_EMAIL && server.FIREBASE_PRIVATE_KEY,
);
const credentialFileConfigured =
  Boolean(server.GOOGLE_APPLICATION_CREDENTIALS) &&
  !credentialEnvironmentConfigured &&
  !credentialEnvironmentPartial;
const credentialConfigured =
  credentialEnvironmentConfigured || credentialFileConfigured;
let credentialFileExists = false,
  credentialProjectMatches = null;
if (credentialFileConfigured) {
  credentialFileExists = existsSync(server.GOOGLE_APPLICATION_CREDENTIALS);
  if (credentialFileExists) {
    try {
      const credential = JSON.parse(
        readFileSync(server.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
      );
      credentialProjectMatches = credential.project_id
        ? credential.project_id === projectId
        : null;
    } catch {
      /* Never expose credential content or paths. */
    }
  }
}
const exposedSecretVariable = Object.keys(client).some(
  (key) =>
    key.startsWith("VITE_") &&
    /PRIVATE|SECRET|SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS/.test(key),
);
console.log(
  JSON.stringify(
    {
      projectId,
      publicConfigReady,
      frontendProjectMatches,
      backendProjectMatches,
      credentialConfigured,
      credentialEnvironmentConfigured,
      credentialEnvironmentPartial,
      credentialSource: credentialEnvironmentConfigured
        ? "environment"
        : credentialFileConfigured
          ? "service-account-file"
          : "application-default-unverified",
      credentialEnvironmentSyntaxVerified: false,
      credentialFileExists,
      credentialProjectMatches,
      exposedSecretVariable,
      databaseCheckRequested: process.argv.includes("--database"),
      liveFirebaseSignInVerified: false,
    },
    null,
    2,
  ),
);
if (
  !publicConfigReady ||
  !frontendProjectMatches ||
  !backendProjectMatches ||
  exposedSecretVariable ||
  credentialEnvironmentPartial ||
  (server.RENDER === "true" && !credentialConfigured) ||
  (credentialFileConfigured &&
    (!credentialFileExists || credentialProjectMatches === false))
)
  process.exitCode = 1;
if (process.argv.includes("--database")) {
  const client = new pg.Client({
    connectionString: server.DATABASE_URL,
    connectionTimeoutMillis: 2500,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log(
      JSON.stringify({
        postgresqlReachable: true,
        operation: "SELECT 1",
        dataChanged: false,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        postgresqlReachable: false,
        errorCode: error.code || "UNAVAILABLE",
        dataChanged: false,
      }),
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
