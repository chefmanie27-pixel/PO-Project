type Env = Record<string, string | undefined>;
export function readRuntimeConfig(env: Env = process.env) {
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be an integer between 1 and 65535");
  const production = env.NODE_ENV === "production";
  const configuredOrigin =
    env.WEB_ORIGIN ||
    (env.RENDER === "true" ? env.RENDER_EXTERNAL_URL : undefined);
  const host = env.HOST || (env.RENDER === "true" ? "0.0.0.0" : "127.0.0.1");
  if (!["127.0.0.1", "0.0.0.0"].includes(host))
    throw Error("HOST must be 127.0.0.1 or 0.0.0.0");
  if (env.SERVE_FRONTEND && !["true", "false"].includes(env.SERVE_FRONTEND))
    throw Error("SERVE_FRONTEND must be true or false");
  let origin: URL;
  try {
    origin = new URL(configuredOrigin || "http://localhost:5173");
  } catch {
    throw Error("WEB_ORIGIN must be a valid origin");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error("WEB_ORIGIN must contain only the scheme, host and port");
  const value = env.TRUST_PROXY?.trim();
  if (value && value !== "false" && value !== "loopback")
    throw Error(
      "TRUST_PROXY must be unset, false, or loopback for the documented reverse proxy",
    );
  if (production) {
    if (!configuredOrigin || origin.protocol !== "https:")
      throw Error("Production WEB_ORIGIN must be an explicit HTTPS origin");
    if (!env.DATABASE_URL)
      throw Error("Production DATABASE_URL must be explicitly configured");
    let database: URL;
    try {
      database = new URL(env.DATABASE_URL);
    } catch {
      throw Error("Production DATABASE_URL is invalid");
    }
    if (!["postgres:", "postgresql:"].includes(database.protocol))
      throw Error("Production DATABASE_URL must use PostgreSQL");
    if (!env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID.startsWith("demo-"))
      throw Error(
        "Production FIREBASE_PROJECT_ID must identify an authorized Firebase project",
      );
    if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST)
      throw Error(
        "Firebase emulator settings are not permitted in production mode",
      );
    if (
      env.APP_ENV === "staging" &&
      ["localhost", "127.0.0.1"].includes(database.hostname) &&
      database.pathname === "/po_command_center"
    )
      throw Error(
        "Staging must use a separate database, not the local application database",
      );
  }
  return {
    port,
    host,
    serveFrontend:
      env.SERVE_FRONTEND === "true" ||
      (env.SERVE_FRONTEND === undefined && env.RENDER === "true"),
    webOrigin: origin.origin,
    trustProxy: value === "loopback" ? ("loopback" as const) : (false as const),
  };
}
