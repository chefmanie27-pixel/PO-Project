import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// npm starts workspace scripts in backend/. Resolve every path from this file,
// and pass the same resolved environment to both Prisma CLI and the server.
export async function startBackend({
  env = process.env,
  run = spawnSync,
  loadServer = () => import("./dist/backend/src/server.js"),
  log = (event) => console.log(JSON.stringify(event)),
} = {}) {
  const url = env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL must be explicitly configured before startup",
    );
  try {
    const parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol))
      throw new Error();
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  // npm_execpath comes from the invoking npm process; no shell quoting or npx
  // downloads are involved. --workspaces=false prevents inherited workspace scope.
  if (!env.npm_execpath)
    throw new Error("Start the backend with npm run start -w backend");
  log({ event: "database_migration_started" });
  let result;
  try {
    result = run(
      process.execPath,
      [env.npm_execpath, "run", "db:deploy", "--workspaces=false"],
      { cwd: repositoryRoot, env, stdio: "ignore" },
    );
  } catch {
    throw new Error(
      "Database migration could not start; HTTP server was not started",
    );
  }
  // Prisma CLI can print database metadata and driver messages. Suppress its
  // output; expose only a fixed event and numeric exit status in Render logs.
  if (result.error || result.signal || result.status !== 0) {
    log({
      event: "database_migration_failed",
      exitCode: Number.isInteger(result.status) ? result.status : null,
    });
    throw new Error(
      "Database migration failed; HTTP server was not started. Inspect migration status in a private database session",
    );
  }
  log({ event: "database_migration_completed" });
  await loadServer();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  dotenv.config({
    path: [
      fileURLToPath(new URL("./.env", import.meta.url)),
      fileURLToPath(new URL("../.env", import.meta.url)),
    ],
  });
  startBackend().catch(() => {
    console.error(
      JSON.stringify({
        event: "backend_start_failed",
        reason:
          "Check DATABASE_URL, installed Prisma CLI, and migration status in a private operator session",
      }),
    );
    process.exitCode = 1;
  });
}
