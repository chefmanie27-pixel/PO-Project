import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import pg from "pg";

// Only the intended local development database may be created by this helper.
const host = "127.0.0.1",
  port = 5432,
  database = "po_command_center",
  role = "po_command_center_app";
const envSource = readFileSync(".env", "utf8"),
  env = parse(envSource);
const current = new URL(env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(current.hostname) ||
  current.pathname !== `/${database}` ||
  (current.port && current.port !== String(port))
)
  throw new Error(
    "Refusing to change a nonlocal or different project database configuration.",
  );
const adminPassword = process.env.PO_LOCAL_POSTGRES_PASSWORD;
if (!adminPassword)
  throw new Error(
    "Run through setup-postgresql.ps1 to load the encrypted local administrator credential.",
  );
const client = new pg.Client({
  host,
  port,
  database: "postgres",
  user: "postgres",
  password: adminPassword,
  connectionTimeoutMillis: 5000,
  application_name: "po-command-center-local-setup",
});
const statePath = ".cache/postgresql/app-connection.json";
try {
  await client.connect();
  const existingDatabase = await client.query(
    "SELECT datname FROM pg_database WHERE datname=$1",
    [database],
  );
  if (existingDatabase.rowCount) {
    const existing = new pg.Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    try {
      await existing.connect();
      await existing.query("SELECT 1");
      console.log(
        JSON.stringify({
          databaseReady: true,
          existingDatabasePreserved: true,
          credentialsChanged: false,
        }),
      );
    } catch {
      throw new Error(
        "The database already exists, but the configured application credentials do not work. Existing data and ownership were preserved.",
      );
    } finally {
      await existing.end().catch(() => {});
    }
  } else {
    const state = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, "utf8"))
      : {
          host,
          port,
          database,
          role,
          password: randomBytes(32).toString("hex"),
        };
    if (
      state.host !== host ||
      state.port !== port ||
      state.database !== database ||
      state.role !== role ||
      !/^[a-f0-9]{64}$/.test(state.password)
    )
      throw new Error(
        "The cached local database setup state does not match this project.",
      );
    if (!existsSync(statePath))
      writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    const existingRole = await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (existingRole.rowCount) {
      const probe = new pg.Client({
        host,
        port,
        database: "postgres",
        user: role,
        password: state.password,
        connectionTimeoutMillis: 5000,
      });
      try {
        await probe.connect();
      } catch {
        throw new Error(
          "The application role already exists with different credentials. It was not changed.",
        );
      } finally {
        await probe.end().catch(() => {});
      }
    } else {
      await client.query(
        `CREATE ROLE "${role}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${state.password}'`,
      );
    }
    await client.query(
      `CREATE DATABASE "${database}" OWNER "${role}" ENCODING 'UTF8' TEMPLATE template0`,
    );
    const url = new URL(`postgresql://${host}:${port}/${database}`);
    url.username = role;
    url.password = state.password;
    const pattern = /^\s*DATABASE_URL\s*=.*$/m;
    if (!pattern.test(envSource))
      throw new Error(
        "DATABASE_URL entry was not found; configuration was not overwritten.",
      );
    writeFileSync(
      ".env",
      envSource.replace(pattern, `DATABASE_URL=${url.href}`),
    );
    console.log(
      JSON.stringify({
        databaseCreated: true,
        restrictedApplicationRole: true,
        credentialsSaved: true,
        existingDatabasesPreserved: true,
      }),
    );
  }
  const settings = await client.query(
    "SELECT current_setting('listen_addresses') AS listen, current_setting('password_encryption') AS encryption",
  );
  let restartRequired = false;
  if (
    !["localhost", "127.0.0.1", "::1", "127.0.0.1,::1"].includes(
      settings.rows[0].listen,
    )
  ) {
    await client.query("ALTER SYSTEM SET listen_addresses='127.0.0.1'");
    await client.query("SELECT pg_reload_conf()");
    restartRequired = true;
  }
  writeFileSync(
    ".cache/postgresql/setup-status.json",
    JSON.stringify({
      restartRequired,
      loopbackOnly: !restartRequired,
      passwordEncryption: settings.rows[0].encryption,
    }),
  );
  console.log(
    JSON.stringify({
      loopbackConfigurationReady: true,
      serviceRestartRequired: restartRequired,
    }),
  );
} catch (error) {
  const safe =
    error instanceof Error &&
    [
      "Refusing",
      "The database already",
      "The application role",
      "The cached",
      "DATABASE_URL",
    ].some((prefix) => error.message.startsWith(prefix));
  console.error(
    safe
      ? error.message
      : JSON.stringify({
          databaseSetupFailed: true,
          code: error.code || "UNAVAILABLE",
        }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
