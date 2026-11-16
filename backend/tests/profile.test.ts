import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("../src/config/firebase.js", () => ({
  getFirebaseAdminAuth: () => ({ verifyIdToken: verify }),
}));
import { createApp } from "../src/app.js";
import { databaseFailure } from "../src/services/database-errors.js";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  firebaseUid: "verified-uid",
  name: "Fixture",
  email: "fixture@example.invalid",
};
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  verify.mockReset().mockResolvedValue({ uid: user.firebaseUid });
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const findUnique = vi.fn().mockResolvedValue(user);
  const query = vi.fn().mockResolvedValue([]);
  const app = createApp({
    user: { findUnique },
    $queryRaw: query,
  } as unknown as PrismaClient);
  return { app, findUnique, query };
}
const get = (app: ReturnType<typeof createApp>) =>
  request(app)
    .get("/api/v1/profile")
    .set("Authorization", "Bearer fixture-token");
describe("profile authentication and database failures", () => {
  it("requires a token before querying accounts", async () => {
    const { app, findUnique } = fixture();
    expect((await request(app).get("/api/v1/profile")).status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("returns verified profile using the injected database", async () => {
    const { app, findUnique } = fixture();
    findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, memberships: [] });
    const response = await get(app);
    expect(response.status).toBe(200);
    expect(response.body.data.memberships).toEqual([]);
    expect(verify).toHaveBeenCalledWith("fixture-token", true);
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { firebaseUid: user.firebaseUid },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: user.id },
      include: { memberships: { include: { project: true } } },
    });
  });
  it("keeps uninvited accounts forbidden", async () => {
    const { app, findUnique } = fixture();
    findUnique.mockResolvedValue(null);
    expect((await get(app)).status).toBe(403);
    expect(findUnique).toHaveBeenCalledOnce();
  });
  it("keeps revoked tokens unauthorized", async () => {
    const { app, findUnique } = fixture();
    verify.mockRejectedValue({ code: "auth/id-token-revoked" });
    expect((await get(app)).status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each(["P1001", "P2021", "P2022", "42501", "ECONNREFUSED"])(
    "logs safe account failure diagnostics for %s",
    async (code) => {
      const { app, findUnique } = fixture();
      findUnique.mockRejectedValue({
        code,
        message: "secret-password",
        meta: { uid: user.firebaseUid },
      });
      const response = await get(app);
      expect(response.status).toBe(503);
      expect(response.text).not.toContain("secret-password");
      const output = JSON.stringify(log.mock.calls);
      expect(output).toContain("account_lookup");
      expect(output).toContain(code);
      for (const secret of [
        "secret-password",
        user.firebaseUid,
        "fixture-token",
        user.email,
      ])
        expect(output).not.toContain(secret);
    },
  );
  it("handles profile membership query failure safely", async () => {
    const { app, findUnique } = fixture();
    findUnique
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce({ code: "P2022", message: "secret" });
    const response = await get(app);
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).toContain("profile_read");
  });
  it("returns 404 if account disappears after authentication", async () => {
    const { app, findUnique } = fixture();
    findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    expect((await get(app)).status).toBe(404);
  });
  it("fails readiness if connection works but profile schema is absent", async () => {
    const { app, query } = fixture();
    query.mockResolvedValueOnce([]).mockRejectedValueOnce({ code: "42P01" });
    expect((await request(app).get("/api/v1/ready")).status).toBe(503);
    expect(JSON.stringify(log.mock.calls)).toContain("database_table_missing");
    expect(query.mock.calls[1][0].join("")).toContain("LIMIT 0");
  });
  it("does not log arbitrary error codes", () => {
    expect(databaseFailure({ code: "secret-password" })).toEqual({
      code: "UNKNOWN",
      reason: "database_request_failed",
    });
    expect(
      databaseFailure({
        code: "P2010",
        meta: { code: "42P01", message: "private" },
      }).reason,
    ).toBe("database_table_missing");
    expect(
      databaseFailure({
        meta: { driverAdapterError: { cause: { originalCode: "42501" } } },
      }).reason,
    ).toBe("database_permission");
    expect(databaseFailure({ errorCode: "P1000" }).reason).toBe(
      "database_authentication",
    );
  });
});
