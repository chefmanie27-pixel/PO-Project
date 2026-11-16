import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("../src/config/firebase.js", () => ({
  getFirebaseAdminAuth: () => ({ verifyIdToken: verify }),
}));
import { createApp } from "../src/app.js";
const projectId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  verify.mockReset().mockResolvedValue({ uid: "invited-firebase-uid" });
});
function fixture(role: string | null) {
  const user = {
    id: "00000000-0000-4000-8000-000000000002",
    firebaseUid: "invited-firebase-uid",
    email: "invited@example.invalid",
    name: "Invited",
  };
  const member = vi
    .fn()
    .mockResolvedValue(role ? { role, project: { archivedAt: null } } : null);
  const read = vi.fn().mockResolvedValue({ id: projectId });
  const findUser = vi.fn().mockResolvedValue(user);
  const projects = vi.fn().mockResolvedValue([]);
  const app = createApp({
    user: { findUnique: findUser },
    projectMembership: { findUnique: member },
    project: { findUnique: read, findMany: projects },
  } as unknown as PrismaClient);
  return { app, member, read, findUser, projects };
}
describe("verified project membership authorization", () => {
  it.each(["ADMIN", "PRODUCT_OWNER"])(
    "allows an invited %s to read their project",
    async (role) => {
      const f = fixture(role);
      const response = await request(f.app)
        .get("/api/v1/projects/" + projectId)
        .set("Authorization", "Bearer valid");
      expect(response.status).toBe(200);
      expect(verify).toHaveBeenCalledWith("valid", true);
      expect(f.findUser).toHaveBeenCalledWith({
        where: { firebaseUid: "invited-firebase-uid" },
      });
      expect(f.member).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_userId: {
              projectId,
              userId: "00000000-0000-4000-8000-000000000002",
            },
          },
        }),
      );
    },
  );
  it("denies a Product Owner permission to grant memberships", async () => {
    const f = fixture("PRODUCT_OWNER");
    expect(
      (
        await request(f.app)
          .post("/api/v1/projects/" + projectId + "/memberships")
          .set("Authorization", "Bearer valid")
          .send({})
      ).status,
    ).toBe(403);
  });
  it.each([null, "DEVELOPER", "UNKNOWN"])(
    "denies absent or ungranted project membership %s",
    async (role) => {
      const f = fixture(role);
      expect(
        (
          await request(f.app)
            .get("/api/v1/projects/" + projectId)
            .set("Authorization", "Bearer valid")
        ).status,
      ).toBe(403);
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it("rechecks membership after access is revoked", async () => {
    const f = fixture("ADMIN");
    expect(
      (
        await request(f.app)
          .get("/api/v1/projects/" + projectId)
          .set("Authorization", "Bearer valid")
      ).status,
    ).toBe(200);
    f.member.mockResolvedValueOnce(null);
    expect(
      (
        await request(f.app)
          .get("/api/v1/projects/" + projectId)
          .set("Authorization", "Bearer valid")
      ).status,
    ).toBe(403);
    expect(f.read).toHaveBeenCalledOnce();
  });
  it.each(["auth/id-token-revoked", "auth/user-disabled"])(
    "rejects Firebase access revoked by %s before reading database",
    async (code) => {
      const f = fixture("ADMIN");
      verify.mockRejectedValue({ code });
      expect(
        (
          await request(f.app)
            .get("/api/v1/projects/" + projectId)
            .set("Authorization", "Bearer valid")
        ).status,
      ).toBe(401);
      expect(f.findUser).not.toHaveBeenCalled();
      expect(f.member).not.toHaveBeenCalled();
    },
  );
  it("does not fall back to matching email or caller-supplied UID", async () => {
    const f = fixture("ADMIN");
    f.findUser.mockResolvedValue(null);
    verify.mockResolvedValue({
      uid: "new-uid",
      email: "invited@example.invalid",
    });
    expect(
      (
        await request(f.app)
          .get("/api/v1/projects")
          .set("Authorization", "Bearer valid")
          .query({ firebaseUid: "invited-firebase-uid", role: "ADMIN" })
      ).status,
    ).toBe(403);
    expect(f.findUser).toHaveBeenCalledWith({
      where: { firebaseUid: "new-uid" },
    });
    expect(f.projects).not.toHaveBeenCalled();
  });
  it("scopes project listing to the approved user's authorized memberships", async () => {
    const f = fixture("PRODUCT_OWNER");
    expect(
      (
        await request(f.app)
          .get("/api/v1/projects")
          .set("Authorization", "Bearer valid")
      ).status,
    ).toBe(200);
    expect(f.projects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: {
            some: {
              userId: "00000000-0000-4000-8000-000000000002",
              role: { in: ["ADMIN", "PRODUCT_OWNER"] },
            },
          },
        }),
      }),
    );
  });
});
