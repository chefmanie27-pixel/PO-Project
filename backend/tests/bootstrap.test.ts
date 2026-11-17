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
  const transaction = vi.fn(async (fn: any, _options?: unknown) => fn(tx));
  const db = { ...tx, $transaction: transaction } as unknown as PrismaClient;
  const auth = {
    getUser: vi.fn().mockResolvedValue({
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

describe("sanitized bootstrap failures", () => {
  it("reports missing identity configuration before querying Firebase", async () => {
    const f = fixture();
    await expect(checkAdministrator(f.db, f.auth, {})).rejects.toMatchObject({
      code: "BOOTSTRAP_IDENTITY_CONFIGURATION_INVALID",
    });
    expect(f.auth.getUser).not.toHaveBeenCalled();
  });
  it.each([
    ["auth/user-not-found", "BOOTSTRAP_FIREBASE_IDENTITY_MISMATCH"],
    ["auth/insufficient-permission", "BOOTSTRAP_FIREBASE_LOOKUP_FAILED"],
  ])("sanitizes Firebase failure %s", async (code, expected) => {
    const f = fixture();
    f.auth.getUser.mockRejectedValue({
      code,
      message: "private vendor details",
    });
    await expect(
      checkAdministrator(f.db, f.auth, config),
    ).rejects.toMatchObject({ code: expected });
    await expect(checkAdministrator(f.db, f.auth, config)).rejects.not.toThrow(
      "private vendor details",
    );
    expect(f.tx.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("bootstrap database diagnostics", () => {
  it("casts the void lock result while preserving the transaction lock", async () => {
    const f = fixture();
    await bootstrapAdministrator(f.db, f.auth, config);
    expect(f.tx.$queryRaw.mock.calls[0][0][0]).toBe(
      "SELECT pg_advisory_xact_lock(194624, 1)::text",
    );
  });
  it("reports only the failed operation and database codes", async () => {
    const f = fixture();
    f.tx.auditEvent.create.mockRejectedValue({
      code: "P2010",
      meta: { code: "42501", message: "private identity and SQL" },
    });
    try {
      await bootstrapAdministrator(f.db, f.auth, config);
      throw new Error("expected failure");
    } catch (error: any) {
      expect(error.code).toBe("BOOTSTRAP_DATABASE_OPERATION_FAILED");
      expect(error.diagnostic).toEqual({
        operation: "audit_marker_create",
        prismaCode: "P2010",
        sqlState: "42501",
      });
      expect(JSON.stringify(error)).not.toContain("private identity");
    }
  });
});

describe("bootstrap transaction expiry and commit", () => {
  it("uses a bounded bootstrap timeout and verifies Firebase before the transaction", async () => {
    const f = fixture();
    const timings: any[] = [];
    await bootstrapAdministrator(f.db, f.auth, config, (t) => timings.push(t));
    expect(f.transaction.mock.calls[0][1]).toEqual({
      maxWait: 2000,
      timeout: 15000,
    });
    expect(f.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      f.transaction.mock.invocationCallOrder[0],
    );
    expect(timings.map((t) => t.operation)).toEqual(
      expect.arrayContaining([
        "transaction_start",
        "advisory_lock",
        "user_create",
        "project_create",
        "membership_create",
        "audit_marker_create",
        "transaction_commit",
      ]),
    );
    expect(timings.every((t) => t.durationMs >= 0 && t.elapsedMs >= 0)).toBe(
      true,
    );
    expect(timings.at(-1)).toMatchObject({
      operation: "transaction_commit",
      outcome: "completed",
    });
  });
  it("reports an expired transaction during a write and stops subsequent writes", async () => {
    const f = fixture();
    f.tx.user.create.mockRejectedValue({
      code: "P2028",
      meta: {
        error:
          "Transaction already closed: expired transaction. private details",
      },
    });
    await expect(
      bootstrapAdministrator(f.db, f.auth, config),
    ).rejects.toMatchObject({
      diagnostic: {
        operation: "user_create",
        prismaCode: "P2028",
        transactionState: "expired",
      },
    });
    expect(f.tx.project.create).not.toHaveBeenCalled();
    expect(f.tx.projectMembership.create).not.toHaveBeenCalled();
  });
  it.each([
    ["Transaction expired: timeout 5000 ms", "expired"],
    ["Connection terminated unexpectedly", "connection_interrupted"],
    ["Transaction state invalid", "unknown"],
  ])(
    "does not report success or retry when commit fails: %s",
    async (message, state) => {
      const f = fixture();
      f.transaction.mockImplementation(async (fn: any) => {
        await fn(f.tx);
        throw { code: "P2028", meta: { error: message } };
      });
      const timings: any[] = [];
      await expect(
        bootstrapAdministrator(f.db, f.auth, config, (t) => timings.push(t)),
      ).rejects.toMatchObject({
        diagnostic: {
          operation: "transaction_commit",
          prismaCode: "P2028",
          transactionState: state,
        },
      });
      expect(f.transaction).toHaveBeenCalledOnce();
      expect(timings.at(-1)).toMatchObject({
        operation: "transaction_commit",
        outcome: "failed",
      });
    },
  );
  it("does not turn successful commit into failure when timing output fails", async () => {
    const f = fixture();
    await expect(
      bootstrapAdministrator(f.db, f.auth, config, () => {
        throw Error("logger failure");
      }),
    ).resolves.toEqual({ status: "created" });
  });
});
