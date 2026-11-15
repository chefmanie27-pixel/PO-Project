import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
const projectId = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  ticketId = "00000000-0000-4000-8000-000000000003";
function fixture() {
  const model = () => ({
    create: vi.fn(async ({ data }: any) => ({ id: ticketId, ...data })),
    findFirst: vi.fn().mockResolvedValue({ id: ticketId, version: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: ticketId, version: 2, status: "RESOLVED" }),
  });
  const tx: any = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: projectId, archivedAt: null }]),
    projectMembership: {
      findUnique: vi.fn().mockResolvedValue({ role: "PRODUCT_OWNER" }),
    },
    ticket: { findFirst: vi.fn().mockResolvedValue({ id: ticketId }) },
    blocker: model(),
    decision: model(),
    reviewItem: model(),
    decisionTicket: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  const db = { ...tx, $transaction: async (fn: any) => fn(tx) } as PrismaClient;
  const app = createApp(db, (req, _res, next) => {
    req.identity = {
      id: ownerId,
      firebaseUid: "fixture",
      email: "po@fixture.invalid",
      name: "PO",
    };
    next();
  });
  return { app, tx };
}
describe("PO productivity routes", () => {
  it("records an owned project-scoped blocker with audit", async () => {
    const { app, tx } = fixture();
    const response = await request(app)
      .post(`/api/v1/projects/${projectId}/blockers`)
      .send({
        title: "Product input needed",
        description: "Clarify the requirement",
        ownerId,
        ticketId,
      });
    expect(response.status).toBe(201);
    expect(tx.blocker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId,
        ownerId,
        ticketId,
        status: "OPEN",
      }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });
  it("rejects a blocker linked to another project", async () => {
    const { app, tx } = fixture();
    tx.ticket.findFirst.mockResolvedValue(null);
    expect(
      (
        await request(app).post(`/api/v1/projects/${projectId}/blockers`).send({
          title: "Invalid blocker",
          description: "Wrong project ticket",
          ownerId,
          ticketId,
        })
      ).status,
    ).toBe(400);
    expect(tx.blocker.create).not.toHaveBeenCalled();
  });
  it("requires notes before resolving a blocker", async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .patch(`/api/v1/projects/${projectId}/blockers/${ticketId}`)
          .send({
            title: "Resolve blocker",
            description: "Requirement clarified",
            ownerId,
            status: "RESOLVED",
            version: 1,
          })
      ).status,
    ).toBe(400);
  });
  it("creates a traceable decision with server-derived maker", async () => {
    const { app, tx } = fixture();
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${projectId}/decisions`)
          .send({
            title: "Keep canonical backlog",
            description: "Use one ticket across teams",
            rationale: "Prevent duplication",
            ticketIds: [ticketId],
            makerId: "untrusted",
          })
      ).status,
    ).toBe(201);
    expect(tx.decision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId,
        makerId: ownerId,
        tickets: { create: [{ ticketId }] },
      }),
    });
  });
  it("resolves and reopens a versioned review request", async () => {
    const { app, tx } = fixture();
    for (const status of ["RESOLVED", "OPEN"])
      expect(
        (
          await request(app)
            .patch(`/api/v1/projects/${projectId}/reviews/${ticketId}`)
            .send({
              title: "Clarify acceptance",
              ownerId,
              category: "QUESTION",
              status,
              version: 1,
            })
        ).status,
      ).toBe(200);
    expect(tx.reviewItem.updateMany).toHaveBeenCalledTimes(2);
  });
  it("rejects stale decision updates", async () => {
    const { app, tx } = fixture();
    expect(
      (
        await request(app)
          .patch(`/api/v1/projects/${projectId}/decisions/${ticketId}`)
          .send({
            title: "Updated decision",
            description: "A different choice",
            rationale: "New information",
            version: 2,
          })
      ).status,
    ).toBe(409);
    expect(tx.decision.updateMany).not.toHaveBeenCalled();
  });
});
