import "dotenv/config";
import { getFirebaseAdminAuth } from "../src/config/firebase.js";
import { db } from "../src/config/db.js";
import { readRuntimeConfig } from "../src/config/runtime.js";
import {
  bootstrapAdministrator,
  checkAdministrator,
} from "../src/services/bootstrap.js";

try {
  readRuntimeConfig();
  const config = {
    uid: process.env.BOOTSTRAP_ADMIN_UID,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    enabled: process.env.BOOTSTRAP_ADMIN_ENABLED,
  };
  const auth = getFirebaseAdminAuth();
  const check = process.argv.includes("--check");
  const result = check
    ? await checkAdministrator(db, auth, config)
    : await bootstrapAdministrator(db, auth, config);
  console.log(
    JSON.stringify({
      event: check
        ? "administrator_provisioning_check"
        : "administrator_bootstrap",
      ...result,
    }),
  );
} catch {
  // Firebase and Prisma exceptions may contain identities or connection details.
  console.error(
    JSON.stringify({
      event: "administrator_bootstrap_failed",
      reason:
        "Check explicit enable flag, trusted Firebase identity, database configuration and existing account conflicts in a private operator session",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
