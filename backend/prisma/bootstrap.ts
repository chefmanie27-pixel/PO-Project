import "dotenv/config";
import { getFirebaseAdminAuth } from "../src/config/firebase.js";
import { readRuntimeConfig } from "../src/config/runtime.js";
import {
  BootstrapError,
  BootstrapDatabaseError,
  bootstrapAdministrator,
  checkAdministrator,
} from "../src/services/bootstrap.js";
import type { PrismaClient } from "@prisma/client";

const check = process.argv.includes("--check");
let db: PrismaClient | undefined;
let stage = "configuration";
try {
  const required = [
    "FIREBASE_PROJECT_ID",
    "DATABASE_URL",
    "BOOTSTRAP_ADMIN_UID",
    "BOOTSTRAP_ADMIN_EMAIL",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length)
    throw new BootstrapError(
      "BOOTSTRAP_CONFIGURATION_MISSING",
      "Configure required variables: " + missing.join(", "),
    );
  readRuntimeConfig();
  const database = new URL(process.env.DATABASE_URL!);
  if (!["postgres:", "postgresql:"].includes(database.protocol))
    throw new BootstrapError(
      "BOOTSTRAP_DATABASE_CONFIGURATION_INVALID",
      "DATABASE_URL must use PostgreSQL",
    );
  const config = {
    uid: process.env.BOOTSTRAP_ADMIN_UID,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    enabled: process.env.BOOTSTRAP_ADMIN_ENABLED,
  };
  if (!check && config.enabled !== "true")
    throw new BootstrapError(
      "BOOTSTRAP_NOT_ENABLED",
      "Administrator bootstrap requires BOOTSTRAP_ADMIN_ENABLED=true",
    );
  stage = "firebase";
  const auth = getFirebaseAdminAuth();
  stage = "database";
  db = (await import("../src/config/db.js")).db;
  await db.$queryRaw`SELECT 1`;
  stage = "administrator";
  const result = check
    ? await checkAdministrator(db, auth, config)
    : await bootstrapAdministrator(db, auth, config, (timing) => {
        console.info(
          JSON.stringify({
            event: "administrator_bootstrap_timing",
            ...timing,
          }),
        );
      });
  console.log(
    JSON.stringify({
      event: check
        ? "administrator_provisioning_check"
        : "administrator_bootstrap",
      ...result,
    }),
  );
} catch (error) {
  // Vendor exceptions may contain identities, credentials or connection strings.
  const code =
    error instanceof BootstrapError
      ? error.code
      : stage === "configuration"
        ? "BOOTSTRAP_CONFIGURATION_INVALID"
        : stage === "firebase"
          ? "BOOTSTRAP_FIREBASE_INITIALIZATION_FAILED"
          : stage === "database"
            ? "BOOTSTRAP_DATABASE_CONNECTIVITY_FAILED"
            : "BOOTSTRAP_DATABASE_OPERATION_FAILED";
  console.error(
    JSON.stringify({
      event: "administrator_bootstrap_failed",
      code,
      ...(error instanceof BootstrapError ? { reason: error.message } : {}),
      ...(error instanceof BootstrapDatabaseError ? error.diagnostic : {}),
      readOnly: check,
    }),
  );
  process.exitCode = 1;
} finally {
  if (db) {
    try {
      await db.$disconnect();
    } catch {
      console.error(
        JSON.stringify({
          event: "administrator_bootstrap_cleanup_failed",
          code: "BOOTSTRAP_DATABASE_DISCONNECT_FAILED",
        }),
      );
      process.exitCode = 1;
    }
  }
}
