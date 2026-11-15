import { describe, it, expect, vi, beforeEach } from "vitest";
const { verify, findUser } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
}));
vi.mock("../src/config/firebase.js", () => ({
  getFirebaseAdminAuth: () => ({ verifyIdToken: verify }),
}));
vi.mock("../src/config/db.js", () => ({
  db: { user: { findUnique: findUser } },
}));
import { authenticate } from "../src/middleware/auth.js";
beforeEach(() => {
  verify.mockReset();
  findUser.mockReset();
});
const run = (req: any) =>
  new Promise<any>((resolve) => authenticate(req, {} as any, resolve));
describe("Firebase identity boundary", () => {
  it("requires a bearer token", async () => {
    expect(await run({ headers: {} })).toMatchObject({ status: 401 });
    expect(verify).not.toHaveBeenCalled();
  });
  it("rejects invalid or revoked tokens", async () => {
    verify.mockRejectedValue({ code: "auth/id-token-revoked" });
    expect(
      await run({ headers: { authorization: "Bearer invalid" } }),
    ).toMatchObject({ status: 401 });
    expect(verify).toHaveBeenCalledWith("invalid", true);
  });
  it("denies authenticated but unapproved identities", async () => {
    verify.mockResolvedValue({ uid: "unapproved" });
    findUser.mockResolvedValue(null);
    expect(
      await run({ headers: { authorization: "Bearer valid" } }),
    ).toMatchObject({ status: 403 });
  });
  it("returns a safe service error when Firebase credentials are missing", async () => {
    verify.mockRejectedValue(
      new Error("PRIVATE KEY contents must never be returned"),
    );
    const result = await run({ headers: { authorization: "Bearer valid" } });
    expect(result).toMatchObject({ status: 503 });
    expect(result.message).not.toContain("PRIVATE KEY");
  });
  it("does not mistake a database outage for invalid credentials", async () => {
    verify.mockResolvedValue({ uid: "approved" });
    findUser.mockRejectedValue(new Error("database connection password"));
    const result = await run({ headers: { authorization: "Bearer valid" } });
    expect(result).toMatchObject({ status: 503 });
    expect(result.message).not.toContain("password");
  });
  it("derives identity only from the verified UID", async () => {
    verify.mockResolvedValue({ uid: "verified-uid" });
    findUser.mockResolvedValue({
      id: "trusted-database-id",
      firebaseUid: "verified-uid",
      name: "Ada",
      email: "ada@fixture.invalid",
    });
    const req: any = {
      headers: { authorization: "Bearer valid" },
      body: { userId: "attacker", role: "ADMIN" },
    };
    expect(await run(req)).toBeUndefined();
    expect(findUser).toHaveBeenCalledWith({
      where: { firebaseUid: "verified-uid" },
    });
    expect(req.identity.id).toBe("trusted-database-id");
  });
});
