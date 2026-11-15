import dotenv from "dotenv";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  firebaseCredentials,
  FirebaseConfigurationError,
  reportFirebaseFailure,
} from "./firebase-credentials.js";
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
  try {
    if (emulatorHost) return initializeApp({ projectId });
    const config = firebaseCredentials();
    let credential;
    try {
      credential =
        config.source === "application-default"
          ? applicationDefault()
          : cert(config.account);
    } catch {
      throw new FirebaseConfigurationError(
        "invalid-credentials",
        "Firebase Admin credentials could not be initialized. Check server credential configuration.",
      );
    }
    const app = initializeApp({ projectId, credential });
    if (process.env.NODE_ENV !== "test")
      console.info(
        JSON.stringify({
          event: "firebase_admin_initialized",
          credentialSource: config.source,
        }),
      );
    return app;
  } catch (error) {
    const failure =
      error instanceof FirebaseConfigurationError
        ? error
        : new FirebaseConfigurationError(
            "invalid-credentials",
            "Firebase Admin initialization failed. Check server credential configuration.",
          );
    reportFirebaseFailure(failure);
    throw failure;
  }
}
export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}
