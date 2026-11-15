import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { apps, getApp, initialize, credential, certificate } = vi.hoisted(
  () => ({
    apps: vi.fn(),
    getApp: vi.fn(),
    initialize: vi.fn(),
    credential: vi.fn(),
    certificate: vi.fn(),
  }),
);
vi.mock("firebase-admin/app", () => ({
  getApps: apps,
  getApp,
  initializeApp: initialize,
  applicationDefault: credential,
  cert: certificate,
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
import { getFirebaseAdminApp } from "../src/config/firebase.js";
import { generateKeyPairSync } from "node:crypto";
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-po-command-center");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("RENDER", "false");
  apps.mockReturnValue([]);
  credential.mockReturnValue({ private: "server-only" });
});
afterEach(() => vi.unstubAllEnvs());
describe("Firebase server initialization", () => {
  it("uses explicit Render credentials without default credential discovery", () => {
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "existing-project");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv(
      "FIREBASE_CLIENT_EMAIL",
      "admin@existing-project.iam.gserviceaccount.com",
    );
    vi.stubEnv("FIREBASE_PRIVATE_KEY", privateKey.replaceAll("\n", "\\n"));
    certificate.mockReturnValue({ explicit: true });
    getFirebaseAdminApp();
    expect(credential).not.toHaveBeenCalled();
    // Boolean assertions prevent a failed test from printing the generated private key.
    expect(certificate.mock.calls[0][0].privateKey === privateKey).toBe(true);
    expect(initialize.mock.calls[0][0].credential).toEqual({ explicit: true });
  });
  it("fails on Render without credentials instead of querying metadata", () => {
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "existing-project");
    vi.stubEnv("RENDER", "true");
    expect(() => getFirebaseAdminApp()).toThrow("Render requires");
    expect(credential).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });
  it("uses an explicit demo project without credentials only for local emulation", () => {
    getFirebaseAdminApp();
    expect(initialize).toHaveBeenCalledWith({
      projectId: "demo-po-command-center",
    });
    expect(credential).not.toHaveBeenCalled();
  });
  it("rejects emulator tokens in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getFirebaseAdminApp()).toThrow("non-production");
    expect(initialize).not.toHaveBeenCalled();
  });
  it("rejects remote emulator addresses and real project IDs", () => {
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "remote.example:9099");
    expect(() => getFirebaseAdminApp()).toThrow("loopback");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    vi.stubEnv("FIREBASE_PROJECT_ID", "real-project");
    expect(() => getFirebaseAdminApp()).toThrow("demo project");
  });
  it("requires explicit server project configuration", () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    expect(() => getFirebaseAdminApp()).toThrow("must be configured");
  });
  it("uses application default credentials for the existing real project", () => {
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "existing-project");
    getFirebaseAdminApp();
    expect(initialize).toHaveBeenCalledWith({
      projectId: "existing-project",
      credential: { private: "server-only" },
    });
  });
  it("refuses to reuse a mismatched Admin app", () => {
    apps.mockReturnValue([{ name: "[DEFAULT]" }]);
    getApp.mockReturnValue({ options: { projectId: "wrong-project" } });
    expect(() => getFirebaseAdminApp()).toThrow("does not match");
  });
});
