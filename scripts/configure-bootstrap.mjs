import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import {
  applicationDefault,
  initializeApp,
  deleteApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Only resolves an explicitly supplied existing identity; never creates Firebase users.
const email = process.argv[2] || process.env.BOOTSTRAP_ADMIN_EMAIL;
if (!email || !email.includes("@"))
  throw new Error("Provide the explicitly trusted administrator email.");
let trustedSource = readFileSync(".env", "utf8");
const trustedConfig = parse(trustedSource);
if (
  trustedConfig.BOOTSTRAP_ADMIN_EMAIL &&
  trustedConfig.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() !== email.toLowerCase()
)
  throw new Error(
    "A different trusted administrator email is already configured. It was preserved.",
  );
if (!trustedConfig.BOOTSTRAP_ADMIN_EMAIL) {
  const key = "BOOTSTRAP_ADMIN_EMAIL";
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  trustedSource = pattern.test(trustedSource)
    ? trustedSource.replace(pattern, `${key}=${email}`)
    : trustedSource +
      (trustedSource.endsWith("\n") ? "" : "\n") +
      `${key}=${email}\n`;
  writeFileSync(".env", trustedSource);
}
const app = initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
  credential: applicationDefault(),
});
try {
  const user = await getAuth(app).getUserByEmail(email);
  if (user.disabled) throw { code: "LOCAL_ACCOUNT_DISABLED" };
  let source = readFileSync(".env", "utf8");
  const current = parse(source);
  for (const [key, value] of Object.entries({
    BOOTSTRAP_ADMIN_UID: user.uid,
    BOOTSTRAP_ADMIN_EMAIL: user.email,
  })) {
    if (
      current[key] &&
      (key === "BOOTSTRAP_ADMIN_EMAIL"
        ? current[key].toLowerCase() !== value.toLowerCase()
        : current[key] !== value)
    )
      throw { code: "LOCAL_BOOTSTRAP_CONFLICT" };
    if (current[key]) continue;
    const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    source = pattern.test(source)
      ? source.replace(pattern, `${key}=${value}`)
      : source + (source.endsWith("\n") ? "" : "\n") + `${key}=${value}\n`;
  }
  writeFileSync(".env", source);
  console.log(
    JSON.stringify({
      firebaseAdminVerified: true,
      trustedAccountFound: true,
      bootstrapConfigured: true,
      liveResourcesChanged: false,
    }),
  );
} catch (error) {
  const code = error.code || "UNAVAILABLE";
  console.log(
    JSON.stringify({
      firebaseAdminVerified: code === "auth/user-not-found",
      trustedAccountFound: false,
      code,
      liveResourcesChanged: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await deleteApp(app);
}
