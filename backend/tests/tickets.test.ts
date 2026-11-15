import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createTicket,
  updateTicket,
  addDependency,
} from "../src/services/tickets.js";
const projectId = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  ticketId = "00000000-0000-4000-8000-000000000003";
function fixture() {
  let counter = 0;
  const tx: any = {
    $queryRaw: vi.fn(),
    projectMembership: {
      findUnique: vi.fn().mockResolvedValue({ role: "PRODUCT_OWNER" }),
    },
    project: {
      update: vi.fn(async () => ({ key: "PO", ticketCounter: ++counter })),
    },
    ticket: {
      create: vi.fn(async ({ data }) => ({
        ...data,
        id: ticketId,
        version: 1,
      })),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: ticketId, version: 2, status: "READY" }),
      findUnique: vi.fn().mockResolvedValue({ id: ticketId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    team: { findFirst: vi.fn().mockResolvedValue({ id: projectId }) },
    sprint: { findFirst: vi.fn().mockResolvedValue({ id: projectId }) },
    auditEvent: { create: vi.fn() },
    blocker: { count: vi.fn().mockResolvedValue(0) },
    ticketDependency: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
  };
  const db = { $transaction: (fn: any) => fn(tx) } as PrismaClient;
  return { tx, db };
}
describe("Transactional ticket service", () => {
  it("generates unique IDs and audits creation", async () => {
    const { tx, db } = fixture();
    const a = await createTicket(db, projectId, ownerId, {
      title: "First ticket",
      ownerId,
    });
    const b = await createTicket(db, projectId, ownerId, {
      title: "Same title is allowed",
      ownerId,
    });
    expect(a.identifier).toBe("PO-1");
    expect(b.identifier).toBe("PO-2");
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
  });
  it("rejects an owner outside the project", async () => {
    const { tx, db } = fixture();
    tx.projectMembership.findUnique.mockResolvedValue(null);
    await expect(
      createTicket(db, projectId, ownerId, { title: "Ticket", ownerId }),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });
  it("validates team and sprint assignment", async () => {
    const { tx, db } = fixture();
    await createTicket(db, projectId, ownerId, {
      title: "Assigned ticket",
      ownerId,
      teamId: projectId,
      sprintId: projectId,
    });
    expect(tx.sprint.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, projectId },
    });
    tx.sprint.findFirst.mockResolvedValue(null);
    await expect(
      createTicket(db, projectId, ownerId, {
        title: "Invalid sprint",
        ownerId,
        sprintId: projectId,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("returns conflict before overwriting a newer ticket", async () => {
    const { tx, db } = fixture();
    await expect(
      updateTicket(db, projectId, ownerId, ticketId, {
        version: 1,
        title: "Stale edit",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });
  it("uses a compare-and-swap update and audits changes", async () => {
    const { tx, db } = fixture();
    await updateTicket(db, projectId, ownerId, ticketId, {
      version: 2,
      status: "IN_PROGRESS",
    });
    expect(tx.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ticketId, projectId, version: 2 },
        data: expect.objectContaining({
          version: { increment: 1 },
          status: "IN_PROGRESS",
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });
  it("rejects invalid workflow jumps", async () => {
    const { db } = fixture();
    await expect(
      updateTicket(db, projectId, ownerId, ticketId, {
        version: 2,
        status: "DONE",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects self dependencies before writing", async () => {
    const { tx, db } = fixture();
    await expect(
      addDependency(db, projectId, ownerId, ticketId, ticketId),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.ticketDependency.upsert).not.toHaveBeenCalled();
  });
});
