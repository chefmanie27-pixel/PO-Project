import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  bootstrapAdministrator,
  checkAdministrator,
} from "../src/services/bootstrap.js";
const config = {
  enabled: "true",
  uid: "trusted-uid",
  email: "Admin@Example.invalid",
};
function fixture() {
  const user = {
    id: "user-id",
    firebaseUid: config.uid,
    email: "admin@example.invalid",
    name: "Admin",
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "project-id" }),
    },
    projectMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const transaction = vi.fn(async (fn: any) => fn(tx));
  const db = { ...tx, $transaction: transaction } as unknown as PrismaClient;
  const auth = {
    getUser: vi
      .fn()
      .mockResolvedValue({
        uid: config.uid,
        email: "admin@example.invalid",
        disabled: false,
        displayName: "Admin",
      }),
  };
  return { tx, db, auth, transaction, user };
}
describe("explicit one-time administrator bootstrap", () => {
  it("requires explicit server enablement before any identity or database operation", async () => {
    const f = fixture();
    await expect(
      bootstrapAdministrator(f.db, f.auth, { ...config, enabled: undefined }),
    ).rejects.toThrow("ENABLED");
    expect(f.auth.getUser).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { uid: "different", email: "admin@example.invalid" },
    { uid: config.uid, email: "other@example.invalid" },
    { uid: config.uid, email: "admin@example.invalid", disabled: true },
  ])("rejects mismatched or disabled Firebase identities", async (account) => {
    const f = fixture();
    f.auth.getUser.mockResolvedValue(account as any);
    await expect(bootstrapAdministrator(f.db, f.auth, config)).rejects.toThrow(
      "does not match",
    );
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("creates only the explicitly trusted admin and a durable marker in one transaction", async () => {
    const f = fixture();
    expect(await bootstrapAdministrator(f.db, f.auth, config)).toEqual({
      status: "created",
    });
    expect(f.transaction).toHaveBeenCalledOnce();
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(f.tx.user.create).toHaveBeenCalledWith({
      data: {
        firebaseUid: config.uid,
        email: "admin@example.invalid",
        name: "Admin",
      },
    });
    expect(f.tx.projectMembership.create).toHaveBeenCalledWith({
      data: { projectId: "project-id", userId: "user-id", role: "ADMIN" },
    });
    expect(f.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "system.initial_administrator_bootstrapped",
      }),
    });
  });
  it.each(["existing admin", "completion marker"])(
    "does not grant access after %s",
    async (kind) => {
      const f = fixture();
      if (kind === "existing admin")
        f.tx.projectMembership.findFirst.mockResolvedValue({
          id: "existing",
        } as any);
      else
        f.tx.auditEvent.findFirst.mockResolvedValue({ id: "completed" } as any);
      expect(await bootstrapAdministrator(f.db, f.auth, config)).toEqual({
        status: "already_initialized",
      });
      expect(f.tx.user.create).not.toHaveBeenCalled();
      expect(f.tx.projectMembership.create).not.toHaveBeenCalled();
      expect(f.tx.auditEvent.create).not.toHaveBeenCalled();
    },
  );
  it("preserves an existing user and project without overwriting fields", async () => {
    const f = fixture();
    f.tx.user.findUnique.mockResolvedValue(f.user as any);
    f.tx.project.findUnique.mockResolvedValue({
      id: "existing-project",
    } as any);
    await bootstrapAdministrator(f.db, f.auth, config);
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.project.create).not.toHaveBeenCalled();
    expect(f.tx.projectMembership.create).toHaveBeenCalledWith({
      data: { projectId: "existing-project", userId: f.user.id, role: "ADMIN" },
    });
  });
  it("does not elevate an existing Product Owner membership", async () => {
    const f = fixture();
    f.tx.user.findUnique.mockResolvedValue(f.user as any);
    f.tx.project.findUnique.mockResolvedValue({
      id: "existing-project",
    } as any);
    f.tx.projectMembership.findUnique.mockResolvedValue({
      role: "PRODUCT_OWNER",
    } as any);
    await expect(bootstrapAdministrator(f.db, f.auth, config)).rejects.toThrow(
      "role must be preserved",
    );
    expect(f.tx.projectMembership.create).not.toHaveBeenCalled();
  });
  it.each(["email linked to another UID", "stored email mismatch"])(
    "refuses %s without relinking accounts",
    async (kind) => {
      const f = fixture();
      if (kind.startsWith("email"))
        f.tx.user.findFirst.mockResolvedValue({ id: "other-user" } as any);
      else
        f.tx.user.findUnique.mockResolvedValue({
          ...f.user,
          email: "old@example.invalid",
        } as any);
      await expect(
        bootstrapAdministrator(f.db, f.auth, config),
      ).rejects.toThrow("identity conflicts");
      expect(f.tx.user.create).not.toHaveBeenCalled();
      expect(f.tx.projectMembership.create).not.toHaveBeenCalled();
    },
  );
  it("supports a read-only sanitized provisioning diagnosis", async () => {
    const f = fixture();
    expect(await checkAdministrator(f.db, f.auth, config)).toEqual({
      accountProvisioned: false,
      identityConflict: false,
      hasProjectAccess: false,
      bootstrapAvailable: true,
    });
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.projectMembership.create).not.toHaveBeenCalled();
  });
});
