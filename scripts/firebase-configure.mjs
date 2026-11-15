import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import { configuredProject, firebaseCommand } from "./firebase-inspect.mjs";
const projectId = configuredProject();
const list = firebaseCommand([
  "apps:list",
  "WEB",
  "--project",
  projectId,
  "--json",
]);
if (!list.ok) {
  console.error(
    "Could not inspect existing Firebase web apps. Run npx -y firebase-tools@latest login, then retry. No app was created.",
  );
  process.exit(1);
}
const apps = Array.isArray(list.json?.result)
  ? list.json.result
  : list.json?.result?.apps;
if (!Array.isArray(apps)) {
  console.error(
    "Could not parse the Firebase web app list. No files or remote resources changed.",
  );
  process.exit(1);
}
const requested = process.argv[2];
const app = requested
  ? apps.find((app) => app.appId === requested)
  : apps.length === 1
    ? apps[0]
    : null;
if (!app) {
  console.error(
    apps.length === 0
      ? "No existing web app found. Register a Web app in the existing Firebase project if desired, then rerun this command. No remote resources were changed."
      : "Multiple web apps exist. Rerun npm run firebase:configure -- <app-id> with the intended existing app.",
  );
  if (apps.length)
    console.log(
      JSON.stringify({
        webApps: apps.map((app) => ({
          appId: app.appId,
          displayName: app.displayName,
        })),
      }),
    );
  process.exit(1);
}
const result = firebaseCommand([
  "apps:sdkconfig",
  "WEB",
  app.appId,
  "--project",
  projectId,
  "--json",
]);
const config = result.json?.result?.sdkConfig;
if (
  !result.ok ||
  !config?.apiKey ||
  config.projectId !== projectId ||
  !config.authDomain
) {
  console.error(
    "Firebase did not return a matching web SDK configuration. No files changed.",
  );
  process.exit(1);
}
function updatedEnv(path, values) {
  let source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const current = parse(source);
  for (const [key, value] of Object.entries(values)) {
    if (current[key] && current[key] !== value)
      throw new Error(
        `${path}: ${key} already contains a different value. Refusing to overwrite it.`,
      );
    if (current[key]) continue;
    const line = `${key}=${value}`;
    const expression = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    source = expression.test(source)
      ? source.replace(expression, line)
      : source + (source.endsWith("\n") || !source ? "" : "\n") + line + "\n";
  }
  return source;
}
try {
  const root = updatedEnv(".env", { FIREBASE_PROJECT_ID: projectId });
  const frontend = updatedEnv("frontend/.env", {
    VITE_FIREBASE_API_KEY: config.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
    VITE_FIREBASE_PROJECT_ID: projectId,
  });
  writeFileSync(".env", root);
  writeFileSync("frontend/.env", frontend);
  console.log(
    JSON.stringify({
      configuredProject: projectId,
      frontendConfigured: true,
      backendProjectConfigured: true,
      adminCredentialsChanged: false,
      remoteResourcesChanged: false,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
