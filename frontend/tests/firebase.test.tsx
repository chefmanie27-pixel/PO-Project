import { describe, it, expect, vi, beforeEach } from "vitest";
const { apps, getApp, createApp, getAuth, setPersistence, connectEmulator } =
  vi.hoisted(() => ({
    apps: vi.fn(),
    getApp: vi.fn(),
    createApp: vi.fn(),
    getAuth: vi.fn(),
    setPersistence: vi.fn(),
    connectEmulator: vi.fn(),
  }));
vi.mock("@firebase/app", () => ({
  getApps: apps,
  getApp,
  initializeApp: createApp,
}));
vi.mock("@firebase/auth", () => ({
  getAuth,
  setPersistence,
  browserLocalPersistence: { type: "LOCAL" },
  connectAuthEmulator: connectEmulator,
}));
vi.mock("../src/services/firebaseConfig", () => ({
  firebaseConfig: {
    apiKey: "fixture-key",
    authDomain: "fixture.invalid",
    projectId: "fixture",
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  apps.mockReturnValue([]);
  createApp.mockReturnValue({ options: { projectId: "fixture" } });
  getAuth.mockReturnValue({ currentUser: null });
  setPersistence.mockResolvedValue(undefined);
});
describe("Firebase browser initialization", () => {
  it("initializes only one app/auth instance and explicitly enables persistent sessions", async () => {
    const service = await import("../src/services/firebase");
    await Promise.all([
      service.initializeFirebaseAuth(),
      service.initializeFirebaseAuth(),
    ]);
    expect(createApp).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(setPersistence).toHaveBeenCalledWith(expect.anything(), {
      type: "LOCAL",
    });
  });
  it("reuses the default app after hot reload", async () => {
    apps.mockReturnValue([{ name: "[DEFAULT]" }]);
    getApp.mockReturnValue({ options: { projectId: "fixture" } });
    const service = await import("../src/services/firebase");
    await service.initializeFirebaseAuth();
    expect(createApp).not.toHaveBeenCalled();
  });
  it("refuses an already initialized app for a different project", async () => {
    apps.mockReturnValue([{ name: "[DEFAULT]" }]);
    getApp.mockReturnValue({ options: { projectId: "other-project" } });
    const service = await import("../src/services/firebase");
    await expect(service.initializeFirebaseAuth()).rejects.toThrow(
      "does not match",
    );
    expect(setPersistence).not.toHaveBeenCalled();
  });
  it("can retry browser persistence initialization after a storage failure", async () => {
    setPersistence.mockRejectedValueOnce(new Error("storage blocked"));
    const service = await import("../src/services/firebase");
    await expect(service.initializeFirebaseAuth()).rejects.toThrow(
      "storage blocked",
    );
    await expect(service.initializeFirebaseAuth()).resolves.toBeTruthy();
    expect(setPersistence).toHaveBeenCalledTimes(2);
  });
  it("never returns raw Firebase errors or credentials to the screen", async () => {
    const { authErrorMessage } = await import("../src/services/firebase");
    expect(
      authErrorMessage({ code: "unknown", message: "private credential" }),
    ).not.toContain("credential");
    expect(authErrorMessage({ code: "auth/network-request-failed" })).toContain(
      "connection",
    );
    expect(authErrorMessage({ code: "auth/operation-not-allowed" })).toContain(
      "not enabled",
    );
    expect(authErrorMessage({ code: "auth/invalid-api-key" })).not.toContain(
      "fixture-key",
    );
  });
});
