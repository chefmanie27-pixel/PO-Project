import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
vi.mock("../src/services/invitations.js", () => ({
  validateInvitedIdentity: vi.fn().mockResolvedValue(undefined),
}));
const projectId = "00000000-0000-4000-8000-000000000001",
  userId = "00000000-0000-4000-8000-000000000002";
describe("Membership authorization inside the project transaction", () => {
  it.each([{ role: "PRODUCT_OWNER" }, null])(
    "denies a formerly authorized administrator whose locked membership is %j",
    async (member) => {
      const write = vi.fn();
      const tx = {
        $queryRaw: vi
          .fn()
          .mockResolvedValue([{ id: projectId, archivedAt: null }]),
        projectMembership: { findUnique: vi.fn().mockResolvedValue(member) },
        user: { upsert: write },
      };
      const database = {
        projectMembership: {
          findUnique: vi
            .fn()
            .mockResolvedValue({
              role: "ADMIN",
              project: { archivedAt: null },
            }),
        },
        $transaction: async (fn: any) => fn(tx),
      } as unknown as PrismaClient;
      const app = createApp(database, (req, _res, next) => {
        req.identity = {
          id: userId,
          firebaseUid: "approved-test",
          email: "po@example.invalid",
          name: "Approved PO",
        };
        next();
      });
      const response = await request(app)
        .post(`/api/v1/projects/${projectId}/memberships`)
        .send({
          firebaseUid: "target-test",
          email: "target@example.invalid",
          name: "Target PO",
          role: "ADMIN",
        });
      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain(
        "Administrator access changed",
      );
      expect(write).not.toHaveBeenCalled();
    },
  );
});
