import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/po_command_center"
)
  throw Error(
    "Only the local development database may be backed up with this script.",
  );
mkdirSync(".cache/postgresql", { recursive: true });
const path = `.cache/postgresql/before-dynamic-${Date.now()}.dump`;
const executable =
  process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"
    : "pg_dump";
const result = spawnSync(
  executable,
  [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    "po_command_center",
    "-Fc",
    "-f",
    path,
  ],
  {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    stdio: "pipe",
  },
);
if (result.status !== 0)
  throw Error("Local backup failed; migration was not run.");
console.log(`Local database backed up to ${path}. No credentials printed.`);
