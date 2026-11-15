import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { apps, getApp, initialize, credential } = vi.hoisted(() => ({
  apps: vi.fn(),
  getApp: vi.fn(),
  initialize: vi.fn(),
  credential: vi.fn(),
}));
vi.mock("firebase-admin/app", () => ({
  getApps: apps,
  getApp,
  initializeApp: initialize,
  applicationDefault: credential,
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
import { getFirebaseAdminApp } from "../src/config/firebase.js";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-po-command-center");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
  vi.stubEnv("NODE_ENV", "test");
  apps.mockReturnValue([]);
  credential.mockReturnValue({ private: "server-only" });
});
afterEach(() => vi.unstubAllEnvs());
describe("Firebase server initialization", () => {
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
