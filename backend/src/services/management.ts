import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  projectCreateSchema,
  projectUpdateSchema,
  teamCreateSchema,
  teamUpdateSchema,
} from "../../../shared/management.js";
import { projectRoles, hasCapability } from "../../../shared/permissions.js";
import { audit, validateLinks, lockProject } from "./tickets.js";
import { ApiError, requireValue } from "./errors.js";
import { workloadTicketSelect } from "./projections.js";

export function listProjects(
  prisma: PrismaClient,
  userId: string,
  includeArchived = false,
) {
  return prisma.project.findMany({
    where: {
      ...(includeArchived ? {} : { archivedAt: null }),
      memberships: {
        some: {
          userId,
          role: {
            in: projectRoles.filter((role) =>
              hasCapability(role, "project:read"),
            ),
          },
        },
      },
    },
    include: {
      owner: { select: { id: true, name: true } },
      memberships: { where: { userId }, select: { role: true } },
      _count: {
        select: {
          teams: true,
          tickets: { where: { archivedAt: null } },
          blockers: { where: { status: { not: "RESOLVED" } } },
        },
      },
      sprints: {
        where: { status: "ACTIVE" },
        take: 1,
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
export async function createProject(
  prisma: PrismaClient,
  actorId: string,
  input: unknown,
) {
  const data = projectCreateSchema.parse(input);
  const approved = await prisma.projectMembership.findFirst({
    where: {
      userId: actorId,
      role: {
        in: projectRoles.filter((role) =>
          hasCapability(role, "project:create"),
        ),
      },
    },
  });
  if (!approved)
    throw new ApiError(403, "Only approved Product Owners can create projects");
  if (data.ownerId && data.ownerId !== actorId)
    throw new ApiError(
      400,
      "A new project must initially be owned by its creator. Invite other POs before transferring ownership.",
    );
  return prisma.$transaction(async (tx) => {
    const { code, startDate, targetDate, ...fields } = data;
    const project = await tx.project.create({
      data: {
        ...fields,
        ownerId: actorId,
        key: code || `P-${randomBytes(6).toString("hex").toUpperCase()}`,
        startDate: startDate ? new Date(`${startDate}T00:00:00Z`) : null,
        targetDate: targetDate ? new Date(`${targetDate}T00:00:00Z`) : null,
      },
    });
    await tx.projectMembership.create({
      data: { projectId: project.id, userId: actorId, role: "ADMIN" },
    });
    await audit(tx, project.id, actorId, "project.created", project.id, {
      name: project.name,
      key: project.key,
    });
    return project;
  });
}
export function updateProject(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  input: unknown,
) {
  const { version, archived, ...data } = projectUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId, true);
    const current = requireValue(
      await tx.project.findUnique({ where: { id: projectId } }),
    );
    if (current.version !== version)
      throw new ApiError(
        409,
        "This project changed. Refresh before saving your edits.",
      );
    if (current.archivedAt && archived !== false)
      throw new ApiError(
        409,
        "Reactivate this project before changing its information.",
      );
    if (data.ownerId)
      await validateLinks(tx, projectId, { ownerId: data.ownerId });
    const changes: any = { ...data, version: { increment: 1 } };
    for (const key of ["startDate", "targetDate"] as const)
      if (data[key] !== undefined)
        changes[key] = data[key] ? new Date(`${data[key]}T00:00:00Z`) : null;
    const start =
        changes.startDate === undefined ? current.startDate : changes.startDate,
      target =
        changes.targetDate === undefined
          ? current.targetDate
          : changes.targetDate;
    if (start && target && target < start)
      throw new ApiError(400, "Target date must be on or after the start date");
    if (archived !== undefined) {
      changes.archivedAt = archived ? new Date() : null;
      changes.status = archived ? "ARCHIVED" : data.status || "ACTIVE";
    } else if (current.archivedAt && data.status)
      throw new ApiError(
        400,
        "Reactivate the project before changing its status",
      );
    const result = await tx.project.updateMany({
      where: { id: projectId, version },
      data: changes,
    });
    if (result.count !== 1)
      throw new ApiError(409, "This project changed. Refresh before saving.");
    await audit(
      tx,
      projectId,
      actorId,
      archived === true
        ? "project.archived"
        : archived === false
          ? "project.reactivated"
          : "project.updated",
      projectId,
      { before: current, after: changes },
    );
    return tx.project.findUnique({ where: { id: projectId } });
  });
}
export const teamInclude = {
  responsiblePo: { select: { id: true, name: true, email: true } },
  tickets: {
    where: { archivedAt: null },
    select: {
      ...workloadTicketSelect,
      sprint: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  },
} as const;
export function createTeam(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  input: unknown,
) {
  const data = teamCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    await validateLinks(tx, projectId, { ownerId: data.responsiblePoId });
    const team = await tx.team.create({
      data: {
        ...data,
        projectId,
        code: data.code || `T-${randomBytes(6).toString("hex").toUpperCase()}`,
      },
    });
    await audit(tx, projectId, actorId, "team.created", team.id, data);
    return team;
  });
}
export function updateTeam(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  id: string,
  input: unknown,
) {
  const { version, archived, ...data } = teamUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const current = requireValue(
      await tx.team.findFirst({ where: { id, projectId } }),
    );
    if (current.version !== version)
      throw new ApiError(
        409,
        "This team changed. Refresh before saving your edits.",
      );
    if (data.responsiblePoId)
      await validateLinks(tx, projectId, { ownerId: data.responsiblePoId });
    const changes: any = { ...data, version: { increment: 1 } };
    if (archived !== undefined) {
      changes.archivedAt = archived ? new Date() : null;
      changes.status = archived ? "ARCHIVED" : data.status || "ACTIVE";
    } else if (current.archivedAt && data.status)
      throw new ApiError(400, "Reactivate the team before changing its status");
    const result = await tx.team.updateMany({
      where: { id, projectId, version },
      data: changes,
    });
    if (result.count !== 1)
      throw new ApiError(409, "This team changed. Refresh before saving.");
    await audit(
      tx,
      projectId,
      actorId,
      archived === true
        ? "team.archived"
        : archived === false
          ? "team.reactivated"
          : "team.updated",
      id,
      { before: current, after: changes },
    );
    return tx.team.findUnique({ where: { id } });
  });
}
