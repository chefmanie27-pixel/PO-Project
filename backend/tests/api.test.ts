import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import type { RequestHandler } from "express";
import { createApp } from "../src/app.js";
const projectId = "00000000-0000-4000-8000-000000000001";
const identity: RequestHandler = (req, _res, next) => {
  req.identity = {
    id: "00000000-0000-4000-8000-000000000002",
    firebaseUid: "po",
    email: "po@example.com",
    name: "PO",
  };
  next();
};
function fixture(role: string | null = "PRODUCT_OWNER") {
  const db = {
    projectMembership: {
      findUnique: vi.fn().mockResolvedValue(role ? { role } : null),
    },
    ticket: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (queries: any[]) => Promise.all(queries)),
  } as unknown as PrismaClient;
  return { db, app: createApp(db, identity) };
}
describe("API authorization and validation", () => {
  it("provides a public health endpoint", async () =>
    expect((await request(createApp()).get("/api/v1/health")).status).toBe(
      200,
    ));
  it("requires Firebase authentication", async () =>
    expect((await request(createApp()).get("/api/v1/projects")).status).toBe(
      401,
    ));
  it("denies cross-project nonmembers", async () => {
    const { app, db } = fixture(null);
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}/tickets`)).status,
    ).toBe(403);
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });
  it("denies future roles until granted capabilities", async () => {
    const { app } = fixture("DEVELOPER");
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}/tickets`)).status,
    ).toBe(403);
  });
  it("reserves memberships for administrators", async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${projectId}/memberships`)
          .send({})
      ).status,
    ).toBe(403);
  });
  it("scopes ticket filters and pagination to the authorized project", async () => {
    const { app, db } = fixture();
    const response = await request(app).get(
      `/api/v1/projects/${projectId}/tickets?status=READY&search=hello&limit=10&page=2`,
    );
    expect(response.status).toBe(200);
    expect(db.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId,
          status: "READY",
          archivedAt: null,
        }),
        take: 10,
        skip: 10,
      }),
    );
  });
  it("rejects invalid ticket ownership", async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${projectId}/tickets`)
          .send({ title: "Valid title" })
      ).status,
    ).toBe(400);
  });
  it("rejects missing version on update", async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .patch(`/api/v1/projects/${projectId}/tickets/${projectId}`)
          .send({ title: "Updated title" })
      ).status,
    ).toBe(400);
  });
  it("rejects invalid filter IDs before querying", async () => {
    const { app, db } = fixture();
    expect(
      (
        await request(app).get(
          `/api/v1/projects/${projectId}/tickets?teamId=bad`,
        )
      ).status,
    ).toBe(400);
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });
});
