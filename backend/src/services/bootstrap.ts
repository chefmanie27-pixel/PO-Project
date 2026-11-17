import type { Auth } from "firebase-admin/auth";
import type { PrismaClient } from "@prisma/client";
import { hasCapability } from "../../../shared/permissions.js";
import { z } from "zod";

export class BootstrapError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

// Only fixed operation labels and validated error codes may leave this boundary.
export class BootstrapDatabaseError extends BootstrapError {
  readonly diagnostic: {
    operation: string;
    prismaCode?: string;
    sqlState?: string;
    transactionState?: string;
  };
  constructor(operation: string, error: unknown) {
    super(
      "BOOTSTRAP_DATABASE_OPERATION_FAILED",
      "Administrator database operation failed",
    );
    this.diagnostic = { operation };
    const visit = (value: unknown, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 6) return;
      for (const [key, item] of Object.entries(value)) {
        if (
          ["code", "originalCode", "sqlState", "sqlstate"].includes(key) &&
          typeof item === "string"
        ) {
          if (/^P[0-9]{4}$/.test(item)) this.diagnostic.prismaCode = item;
          else if (/^[0-9A-Z]{5}$/.test(item)) this.diagnostic.sqlState = item;
        }
        if (typeof item === "object") visit(item, depth + 1);
      }
    };
    visit(error);
    if (this.diagnostic.prismaCode === "P2028") {
      const details = error as {
        message?: unknown;
        meta?: { error?: unknown };
      };
      const text = [details?.message, details?.meta?.error]
        .filter((v) => typeof v === "string")
        .join(" ");
      this.diagnostic.transactionState = /expired|timeout|timed out/i.test(text)
        ? "expired"
        : /connection.*(closed|lost|terminated)|connection.*interrupted/i.test(
              text,
            )
          ? "connection_interrupted"
          : /closed/i.test(text)
            ? "closed"
            : "unknown";
    }
  }
}

// Ten serial round trips measured about 4.8 seconds on the operator connection.
// Allow bounded headroom for the lock, integrity reads, four writes and commit.
export const bootstrapTransactionOptions = {
  maxWait: 2000,
  timeout: 15000,
} as const;
export type BootstrapTiming = {
  operation: string;
  durationMs: number;
  elapsedMs: number;
  outcome: "completed" | "failed";
};

type Config = { uid?: string; email?: string; enabled?: string };
const marker = "system.initial_administrator_bootstrapped";

async function trustedIdentity(auth: Pick<Auth, "getUser">, config: Config) {
  const uid = config.uid?.trim();
  const email = config.email?.trim().toLowerCase();
  if (!uid || uid.length > 128 || !z.email().safeParse(email).success)
    throw new BootstrapError(
      "BOOTSTRAP_IDENTITY_CONFIGURATION_INVALID",
      "Configure the trusted bootstrap UID and email",
    );
  let account;
  try {
    account = await auth.getUser(uid);
  } catch (error) {
    throw new BootstrapError(
      (error as { code?: string })?.code === "auth/user-not-found"
        ? "BOOTSTRAP_FIREBASE_IDENTITY_MISMATCH"
        : "BOOTSTRAP_FIREBASE_LOOKUP_FAILED",
      "Trusted Firebase lookup failed; verify identity and Admin credentials privately",
    );
  }
  if (
    account.uid !== uid ||
    account.disabled ||
    account.email?.toLowerCase() !== email
  )
    throw new BootstrapError(
      "BOOTSTRAP_FIREBASE_IDENTITY_MISMATCH",
      "Trusted bootstrap identity does not match active Firebase account",
    );
  return { uid, email: email!, name: account.displayName || "Administrator" };
}

// Read-only operator check. No UIDs, emails or profile data are returned.
export async function checkAdministrator(
  prisma: PrismaClient,
  auth: Pick<Auth, "getUser">,
  config: Config,
) {
  const trusted = await trustedIdentity(auth, config);
  const user = await prisma.user.findUnique({
    where: { firebaseUid: trusted.uid },
  });
  const conflict = await prisma.user.findFirst({
    where: {
      email: { equals: trusted.email, mode: "insensitive" },
      NOT: { firebaseUid: trusted.uid },
    },
    select: { id: true },
  });
  const admin = await prisma.projectMembership.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const completed = await prisma.auditEvent.findFirst({
    where: { action: marker },
    select: { id: true },
  });
  const memberships = user
    ? await prisma.projectMembership.findMany({
        where: { userId: user.id },
        select: { role: true },
      })
    : [];
  return {
    accountProvisioned: !!user,
    identityConflict:
      !!conflict || !!(user && user.email.toLowerCase() !== trusted.email),
    hasProjectAccess: memberships.some((m) =>
      hasCapability(m.role, "project:read"),
    ),
    bootstrapAvailable: !admin && !completed,
  };
}

export async function bootstrapAdministrator(
  prisma: PrismaClient,
  auth: Pick<Auth, "getUser">,
  config: Config,
  reportTiming: (timing: BootstrapTiming) => void = () => {},
) {
  if (config.enabled !== "true")
    throw new BootstrapError(
      "BOOTSTRAP_NOT_ENABLED",
      "Administrator bootstrap requires BOOTSTRAP_ADMIN_ENABLED=true",
    );
  const trusted = await trustedIdentity(auth, config);
  const started = performance.now();
  let operation = "transaction_start";
  let phaseStarted = started;
  const finish = (outcome: "completed" | "failed") => {
    const now = performance.now();
    // Diagnostics must never change a transaction outcome, especially after commit.
    try {
      reportTiming({
        operation,
        durationMs: Math.round(now - phaseStarted),
        elapsedMs: Math.round(now - started),
        outcome,
      });
    } catch {}
    phaseStarted = now;
  };
  const advance = (next: string) => {
    finish("completed");
    operation = next;
  };
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize bootstrap attempts for different UIDs as well as repeated runs.
      // Prisma cannot deserialize PostgreSQL void; casting preserves the same lock.
      advance("advisory_lock");
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(194624, 1)::text`;
      advance("audit_marker_lookup");
      const completed = await tx.auditEvent.findFirst({
        where: { action: marker },
        select: { id: true },
      });
      advance("administrator_lookup");
      const admin = await tx.projectMembership.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      if (completed || admin) {
        advance("transaction_commit");
        return { status: "already_initialized" as const };
      }
      advance("user_lookup");
      const existing = await tx.user.findUnique({
        where: { firebaseUid: trusted.uid },
      });
      advance("identity_conflict_lookup");
      const conflict = await tx.user.findFirst({
        where: {
          email: { equals: trusted.email, mode: "insensitive" },
          NOT: { firebaseUid: trusted.uid },
        },
        select: { id: true },
      });
      if (
        conflict ||
        (existing && existing.email.toLowerCase() !== trusted.email)
      )
        throw new BootstrapError(
          "BOOTSTRAP_ADMINISTRATOR_CONFLICT",
          "Application identity conflicts with trusted Firebase identity; manual review required",
        );
      advance("project_lookup");
      const project = await tx.project.findUnique({ where: { key: "PO" } });
      if (existing && project) {
        advance("membership_lookup");
        const membership = await tx.projectMembership.findUnique({
          where: {
            projectId_userId: { projectId: project.id, userId: existing.id },
          },
        });
        if (membership)
          throw new BootstrapError(
            "BOOTSTRAP_EXISTING_ROLE_CONFLICT",
            "Existing project role must be preserved; use the administrator recovery process",
          );
      }
      advance("user_create");
      const user =
        existing ||
        (await tx.user.create({
          data: {
            firebaseUid: trusted.uid,
            email: trusted.email,
            name: trusted.name,
          },
        }));
      advance("project_create");
      const workspace =
        project ||
        (await tx.project.create({
          data: {
            key: "PO",
            name: "Product workspace",
            description: "Shared software delivery",
            ownerId: user.id,
          },
        }));
      advance("membership_create");
      await tx.projectMembership.create({
        data: {
          projectId: workspace.id,
          userId: user.id,
          role: "ADMIN",
        },
      });
      // Durable completion marker prevents rebootstrap even after access revocation.
      advance("audit_marker_create");
      await tx.auditEvent.create({
        data: {
          projectId: workspace.id,
          actorId: user.id,
          action: marker,
          entityId: workspace.id,
          changes: {},
        },
      });
      advance("transaction_commit");
      return { status: "created" as const };
    }, bootstrapTransactionOptions);
    finish("completed");
    return result;
  } catch (error) {
    finish("failed");
    if (error instanceof BootstrapError) throw error;
    throw new BootstrapDatabaseError(operation, error);
  }
}
