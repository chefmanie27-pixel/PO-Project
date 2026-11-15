import type { PrismaClient, Prisma } from "@prisma/client";
import {
  ticketSchema,
  ticketUpdateSchema,
  canTransition,
  wouldCycle,
} from "../../../shared/schemas.js";
import { ApiError, requireValue } from "./errors.js";
type Tx = Prisma.TransactionClient;
export async function lockProject(
  tx: Tx,
  projectId: string,
  allowArchived = false,
) {
  const rows = await tx.$queryRaw<
    { id: string; archivedAt: Date | null }[]
  >`SELECT id,"archivedAt" FROM "Project" WHERE id = ${projectId}::uuid FOR UPDATE`;
  const project = requireValue(rows[0]);
  if (project.archivedAt && !allowArchived)
    throw new ApiError(
      409,
      "This project is archived. Reactivate it before making changes.",
    );
  return project;
}
export async function audit(
  tx: Tx,
  projectId: string,
  actorId: string,
  action: string,
  entityId: string,
  changes: unknown,
) {
  await tx.auditEvent.create({
    data: {
      projectId,
      actorId,
      action,
      entityId,
      changes: JSON.parse(JSON.stringify(changes)),
    },
  });
}
export async function validateLinks(
  tx: Tx,
  projectId: string,
  data: {
    ownerId?: string;
    teamId?: string | null;
    sprintId?: string | null;
    parentId?: string | null;
    ticketId?: string | null;
  },
  self?: string,
  existingTeamId?: string | null,
  existingSprintId?: string | null,
) {
  if (data.ownerId) {
    const owner = await tx.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId: data.ownerId } },
    });
    if (!owner || !["ADMIN", "PRODUCT_OWNER"].includes(owner.role))
      throw new ApiError(400, "Owner must be a Product Owner in this project");
  }
  for (const [key, model] of [
    ["teamId", "team"],
    ["sprintId", "sprint"],
    ["parentId", "ticket"],
    ["ticketId", "ticket"],
  ] as const) {
    const value = data[key];
    if (value) {
      const found = await (tx[model] as any).findFirst({
        where: {
          id: value,
          projectId,
          ...(model === "ticket" ? { archivedAt: null } : {}),
        },
      });
      if (!found) throw new ApiError(400, `Invalid ${key} for this project`);
      if (model === "team" && found.archivedAt && value !== existingTeamId)
        throw new ApiError(
          400,
          "Archived teams cannot receive new ticket assignments. Reactivate the team first.",
        );
      if (
        model === "sprint" &&
        found.status === "COMPLETED" &&
        value !== existingSprintId
      )
        throw new ApiError(
          400,
          "Completed sprints cannot receive ticket assignments",
        );
    }
  }
  if (self && data.parentId) {
    let parent: string | null = data.parentId;
    const seen = new Set<string>();
    while (parent) {
      if (parent === self || seen.has(parent))
        throw new ApiError(400, "Parent relationship cannot form a cycle");
      seen.add(parent);
      parent =
        (
          await tx.ticket.findUnique({
            where: { id: parent },
            select: { parentId: true },
          })
        )?.parentId ?? null;
    }
  }
}
export function createTicket(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  input: unknown,
) {
  const data = ticketSchema.parse(input);
  if (data.status !== "BACKLOG")
    throw new ApiError(400, "New tickets start in Backlog");
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    await validateLinks(tx, projectId, data);
    const project = await tx.project.update({
      where: { id: projectId },
      data: { ticketCounter: { increment: 1 } },
    });
    const ticket = await tx.ticket.create({
      data: {
        ...data,
        projectId,
        identifier: `${project.key}-${project.ticketCounter}`,
      },
    });
    await audit(tx, projectId, actorId, "ticket.created", ticket.id, data);
    return ticket;
  });
}
export function updateTicket(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  id: string,
  input: unknown,
) {
  const { version, archived, ...data } = ticketUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const current = requireValue(
      await tx.ticket.findFirst({ where: { id, projectId, archivedAt: null } }),
    );
    if (current.version !== version)
      throw new ApiError(
        409,
        "This ticket changed. Refresh and reconcile your edits.",
      );
    await validateLinks(
      tx,
      projectId,
      data,
      id,
      current.teamId,
      current.sprintId,
    );
    if (data.status && !canTransition(current.status, data.status))
      throw new ApiError(
        400,
        `Cannot move from ${current.status} to ${data.status}`,
      );
    if (
      data.status === "DONE" &&
      (await tx.blocker.count({
        where: { ticketId: id, status: { not: "RESOLVED" } },
      }))
    )
      throw new ApiError(
        400,
        "Resolve open blockers before completing this ticket",
      );
    const changed = await tx.ticket.updateMany({
      where: { id, projectId, version },
      data: {
        ...data,
        ...(archived ? { archivedAt: new Date() } : {}),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ApiError(
        409,
        "This ticket changed. Refresh and reconcile your edits.",
      );
    await audit(tx, projectId, actorId, "ticket.updated", id, {
      before: current,
      after: data,
      archived,
    });
    return tx.ticket.findUnique({ where: { id } });
  });
}
export function addDependency(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  ticketId: string,
  dependsOnId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    await validateLinks(tx, projectId, { ticketId, parentId: dependsOnId });
    const edges = await tx.ticketDependency.findMany({ where: { projectId } });
    if (wouldCycle(edges, ticketId, dependsOnId))
      throw new ApiError(400, "Dependency would form a cycle");
    const dependency = await tx.ticketDependency.upsert({
      where: { ticketId_dependsOnId: { ticketId, dependsOnId } },
      create: { projectId, ticketId, dependsOnId },
      update: {},
    });
    await audit(tx, projectId, actorId, "dependency.linked", ticketId, {
      dependsOnId,
    });
    return dependency;
  });
}
export function reorderTicket(
  prisma: PrismaClient,
  projectId: string,
  actorId: string,
  id: string,
  version: number,
  direction: "up" | "down",
) {
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const tickets = await tx.ticket.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
    const index = tickets.findIndex((t) => t.id === id);
    if (index < 0) throw new ApiError(404, "Ticket not found");
    if (tickets[index].version !== version)
      throw new ApiError(
        409,
        "This ticket changed. Refresh before reordering.",
      );
    const target = index + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= tickets.length) return tickets[index];
    [tickets[index], tickets[target]] = [tickets[target], tickets[index]];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.rank !== (i + 1) * 100)
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { rank: (i + 1) * 100, version: { increment: 1 } },
        });
    }
    await audit(tx, projectId, actorId, "ticket.reordered", id, { direction });
    return tx.ticket.findUnique({ where: { id } });
  });
}
