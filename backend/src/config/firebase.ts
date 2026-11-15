import dotenv from "dotenv";
import {
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
dotenv.config({ path: [".env", "../.env"] });

export function getFirebaseAdminApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId)
    throw new Error("FIREBASE_PROJECT_ID must be configured on the server.");
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (
    emulatorHost &&
    (process.env.NODE_ENV === "production" ||
      !projectId.startsWith("demo-") ||
      !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(emulatorHost))
  )
    throw new Error(
      "Auth emulation requires a non-production demo project and loopback host.",
    );
  if (getApps().some((app) => app.name === "[DEFAULT]")) {
    const app = getApp();
    if (app.options.projectId !== projectId)
      throw new Error(
        "Initialized Firebase Admin project does not match configuration.",
      );
    return app;
  }
  return initializeApp({
    projectId,
    ...(emulatorHost ? {} : { credential: applicationDefault() }),
  });
}
export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}
