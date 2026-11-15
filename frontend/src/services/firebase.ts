import { getApp, getApps, initializeApp } from "@firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  type Auth,
} from "@firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

export const configured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId,
);
let auth: Auth | undefined;
let initialization: Promise<Auth> | undefined;

export function getFirebaseAuth(): Auth {
  if (!configured)
    throw new Error(
      "Firebase web configuration is missing. Follow docs/firebase-setup.md.",
    );
  if (!auth) {
    const app = getApps().some((app) => app.name === "[DEFAULT]")
      ? getApp()
      : initializeApp(firebaseConfig);
    if (app.options.projectId !== firebaseConfig.projectId)
      throw new Error(
        "Firebase project configuration does not match the initialized app.",
      );
    const instance = getAuth(app);
    const emulatorUrl = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;
    if (emulatorUrl) {
      const url = new URL(emulatorUrl);
      if (
        import.meta.env.MODE !== "emulator" ||
        !firebaseConfig.projectId.startsWith("demo-") ||
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error(
          "Auth emulation requires emulator mode, a demo project and a loopback URL.",
        );
      if (!instance.emulatorConfig)
        connectAuthEmulator(instance, url.origin, { disableWarnings: true });
    }
    auth = instance;
  }
  return auth;
}

export function initializeFirebaseAuth(): Promise<Auth> {
  if (!initialization) {
    try {
      const instance = getFirebaseAuth();
      initialization = setPersistence(instance, browserLocalPersistence)
        .then(() => instance)
        .catch((error) => {
          initialization = undefined;
          throw error;
        });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return initialization;
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect.";
    case "auth/email-already-in-use":
      return "An account already exists for this email.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password that meets the project password policy.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Could not reach the authentication service. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this Firebase project. Contact your administrator.";
    case "auth/user-disabled":
      return "This account is disabled. Contact your administrator.";
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
    case "auth/unauthorized-domain":
      return "Firebase web configuration needs attention. Contact your administrator.";
    default:
      return "Unable to authenticate. Please try again or contact your administrator.";
  }
}
