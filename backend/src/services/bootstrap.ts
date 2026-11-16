import type { Auth } from "firebase-admin/auth";
import type { PrismaClient } from "@prisma/client";
import { hasCapability } from "../../../shared/permissions.js";
import { z } from "zod";

type Config = { uid?: string; email?: string; enabled?: string };
const marker = "system.initial_administrator_bootstrapped";

async function trustedIdentity(auth: Pick<Auth, "getUser">, config: Config) {
  const uid = config.uid?.trim();
  const email = config.email?.trim().toLowerCase();
  if (!uid || uid.length > 128 || !z.email().safeParse(email).success)
    throw new Error("Configure the trusted bootstrap UID and email");
  const account = await auth.getUser(uid);
  if (
    account.uid !== uid ||
    account.disabled ||
    account.email?.toLowerCase() !== email
  )
    throw new Error(
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
) {
  if (config.enabled !== "true")
    throw new Error(
      "Administrator bootstrap requires BOOTSTRAP_ADMIN_ENABLED=true",
    );
  const trusted = await trustedIdentity(auth, config);
  return prisma.$transaction(async (tx) => {
    // Serialize bootstrap attempts for different UIDs as well as repeated runs.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(194624, 1)`;
    const completed = await tx.auditEvent.findFirst({
      where: { action: marker },
      select: { id: true },
    });
    const admin = await tx.projectMembership.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (completed || admin) return { status: "already_initialized" as const };
    const existing = await tx.user.findUnique({
      where: { firebaseUid: trusted.uid },
    });
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
      throw new Error(
        "Application identity conflicts with trusted Firebase identity; manual review required",
      );
    const project = await tx.project.findUnique({ where: { key: "PO" } });
    if (existing && project) {
      const membership = await tx.projectMembership.findUnique({
        where: {
          projectId_userId: { projectId: project.id, userId: existing.id },
        },
      });
      if (membership)
        throw new Error(
          "Existing project role must be preserved; use the administrator recovery process",
        );
    }
    const user =
      existing ||
      (await tx.user.create({
        data: {
          firebaseUid: trusted.uid,
          email: trusted.email,
          name: trusted.name,
        },
      }));
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
    await tx.projectMembership.create({
      data: {
        projectId: workspace.id,
        userId: user.id,
        role: "ADMIN",
      },
    });
    // Durable completion marker prevents rebootstrap even after access revocation.
    await tx.auditEvent.create({
      data: {
        projectId: workspace.id,
        actorId: user.id,
        action: marker,
        entityId: workspace.id,
        changes: {},
      },
    });
    return { status: "created" as const };
  });
}
