import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sprintSchema } from "../../../shared/schemas.js";
import { lockProject, audit } from "./tickets.js";
import { ApiError, requireValue } from "./errors.js";

export function createSprint(
  db: PrismaClient,
  projectId: string,
  actorId: string,
  input: unknown,
) {
  const data = sprintSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const sprint = await tx.sprint.create({ data: { ...data, projectId } });
    await audit(tx, projectId, actorId, "sprint.created", sprint.id, data);
    return sprint;
  });
}
export function updateSprint(
  db: PrismaClient,
  projectId: string,
  actorId: string,
  id: string,
  input: unknown,
) {
  const data = sprintSchema.parse(input);
  const version = z
    .object({ version: z.number().int().positive() })
    .parse(input).version;
  return db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const current = requireValue(
      await tx.sprint.findFirst({ where: { id, projectId } }),
    );
    if (current.version !== version)
      throw new ApiError(
        409,
        "This sprint changed. Refresh before saving your draft.",
      );
    if (current.status === "COMPLETED")
      throw new ApiError(409, "Completed sprint history cannot be edited.");
    const changed = await tx.sprint.updateMany({
      where: { id, projectId, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new ApiError(409, "This sprint changed. Refresh before saving.");
    await audit(tx, projectId, actorId, "sprint.updated", id, {
      before: current,
      after: data,
    });
    return tx.sprint.findUnique({ where: { id } });
  });
}
export function transitionSprint(
  db: PrismaClient,
  projectId: string,
  actorId: string,
  id: string,
  input: unknown,
) {
  const { version, action, returnUnfinishedToBacklog } = z
    .object({
      version: z.number().int().positive(),
      action: z.enum(["START", "COMPLETE"]),
      returnUnfinishedToBacklog: z.boolean().default(false),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const sprint = requireValue(
      await tx.sprint.findFirst({ where: { id, projectId } }),
    );
    if (sprint.version !== version)
      throw new ApiError(
        409,
        "This sprint changed. Refresh before continuing.",
      );
    if (action === "START") {
      if (sprint.status !== "PLANNED")
        throw new ApiError(400, "Only a planned sprint can be started.");
      if (await tx.sprint.findFirst({ where: { projectId, status: "ACTIVE" } }))
        throw new ApiError(
          409,
          "Complete the active sprint before starting another.",
        );
      await tx.sprint.update({
        where: { id },
        data: {
          status: "ACTIVE",
          startedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const moved = await tx.ticket.findMany({
        where: { projectId, sprintId: id, archivedAt: null, status: "BACKLOG" },
        select: { id: true },
      });
      await tx.ticket.updateMany({
        where: { projectId, sprintId: id, archivedAt: null, status: "BACKLOG" },
        data: { status: "READY", version: { increment: 1 } },
      });
      for (const ticket of moved)
        await audit(
          tx,
          projectId,
          actorId,
          "ticket.sprint_started",
          ticket.id,
          { sprintId: id, from: "BACKLOG", to: "READY" },
        );
    } else {
      if (sprint.status !== "ACTIVE")
        throw new ApiError(400, "Only an active sprint can be completed.");
      const unfinished = await tx.ticket.count({
        where: {
          projectId,
          sprintId: id,
          archivedAt: null,
          status: { not: "DONE" },
        },
      });
      if (unfinished && !returnUnfinishedToBacklog)
        throw new ApiError(
          400,
          "Return unfinished tickets to the backlog before completing this sprint.",
        );
      const moved = await tx.ticket.findMany({
        where: {
          projectId,
          sprintId: id,
          archivedAt: null,
          status: { not: "DONE" },
        },
        select: { id: true, status: true },
      });
      await tx.ticket.updateMany({
        where: {
          projectId,
          sprintId: id,
          archivedAt: null,
          status: { not: "DONE" },
        },
        data: { sprintId: null, status: "BACKLOG", version: { increment: 1 } },
      });
      for (const ticket of moved)
        await audit(
          tx,
          projectId,
          actorId,
          "ticket.returned_to_backlog",
          ticket.id,
          { previousSprintId: id, from: ticket.status, to: "BACKLOG" },
        );
      await tx.sprint.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
    await audit(
      tx,
      projectId,
      actorId,
      action === "START" ? "sprint.started" : "sprint.completed",
      id,
      { before: sprint, returnUnfinishedToBacklog },
    );
    return tx.sprint.findUnique({ where: { id } });
  });
}
