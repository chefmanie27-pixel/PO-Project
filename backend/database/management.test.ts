import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import { createApp } from "../src/app.js";
import type { PrismaClient, Prisma } from "@prisma/client";

async function fixture(run: (c: any) => Promise<void>) {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/po_command_center"
  )
    throw Error(
      "Database tests are restricted to the local development database.",
    );
  const rollback = new Error("ROLLBACK_TEST_FIXTURE");
  try {
    await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const uid = randomUUID();
        const actor = await tx.user.create({
          data: {
            firebaseUid: `test-${uid}`,
            email: `${uid}@test.invalid`,
            name: "Test Product Owner",
          },
        });
        const outsider = await tx.user.create({
          data: {
            firebaseUid: `other-${uid}`,
            email: `other-${uid}@test.invalid`,
            name: "Unapproved test identity",
          },
        });
        const anchor = await tx.project.create({
          data: {
            key: `A-${uid.replaceAll("-", "").toUpperCase()}`,
            name: "Rollback fixture anchor",
            ownerId: actor.id,
          },
        });
        await tx.projectMembership.create({
          data: {
            projectId: anchor.id,
            userId: actor.id,
            role: "PRODUCT_OWNER",
          },
        });
        const facade = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return (operation: any) =>
                typeof operation === "function"
                  ? operation(tx)
                  : Promise.all(operation);
            return Reflect.get(target, key);
          },
        }) as unknown as PrismaClient;
        const context = { actorId: actor.id };
        const app = createApp(facade, (req, _res, next) => {
          req.identity = {
            id: context.actorId,
            firebaseUid: "fixture",
            name: "Test PO",
            email: "test@example.invalid",
          };
          next();
        });
        await run({ tx, app, actor, outsider, context, anchor });
        throw rollback;
      },
      { timeout: 55000, maxWait: 10000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
describe("Real PostgreSQL project/team API with rolled-back fixtures", () => {
  it("lets an approved PO create projects, list metrics and manage scoped teams", async () =>
    fixture(async ({ app, actor }) => {
      const created = await request(app).post("/api/v1/projects").send({
        name: "A custom product",
        description: "Independent workspace",
      });
      expect(created.status, created.text).toBe(201);
      const project = created.body.data;
      expect(project.key).toMatch(/^P-/);
      expect(project.ownerId).toBe(actor.id);
      const list = await request(app).get("/api/v1/projects");
      expect(
        list.body.data.find((p: any) => p.id === project.id)._count.teams,
      ).toBe(0);
      const teamResponse = await request(app)
        .post(`/api/v1/projects/${project.id}/teams`)
        .send({
          name: "Frontend Owls",
          code: "OWLS",
          responsiblePoId: actor.id,
        });
      expect(teamResponse.status, teamResponse.text).toBe(201);
      const team = teamResponse.body.data;
      const edit = await request(app)
        .patch(`/api/v1/projects/${project.id}/teams/${team.id}`)
        .send({
          version: team.version,
          name: "Experience Owls",
          description: "Renamed without copying tickets",
          code: "UX-OWLS",
        });
      expect(edit.status, edit.text).toBe(200);
      const refreshed = await request(app).get(
        `/api/v1/projects/${project.id}/teams/${team.id}`,
      );
      expect(refreshed.body.data).toMatchObject({
        name: "Experience Owls",
        code: "UX-OWLS",
        responsiblePoId: actor.id,
      });
      const stale = await request(app)
        .patch(`/api/v1/projects/${project.id}/teams/${team.id}`)
        .send({ version: 1, name: "Stale overwrite" });
      expect(stale.status).toBe(409);
      const stats = await request(app).get("/api/v1/projects");
      expect(
        stats.body.data.find((p: any) => p.id === project.id)._count.teams,
      ).toBe(1);
    }));
  it("preserves tickets on team rename/archive, blocks new archived assignments and supports reactivation", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      const team = (
        await request(app)
          .post(`${base}/teams`)
          .send({ name: "Custom QA", responsiblePoId: actor.id })
      ).body.data;
      const ticket = (
        await request(app).post(`${base}/tickets`).send({
          title: "Canonical requirement",
          ownerId: actor.id,
          teamId: team.id,
          description: "Keep requirements intact",
          acceptanceCriteria: "One canonical row",
        })
      ).body.data;
      expect(ticket.id).toBeTruthy();
      expect(
        (
          await request(app)
            .patch(`${base}/teams/${team.id}`)
            .send({ version: 1, name: "Quality Guild" })
        ).status,
      ).toBe(200);
      expect(
        (await request(app).get(`${base}/tickets/${ticket.id}`)).body.data.team
          .name,
      ).toBe("Quality Guild");
      expect(
        (
          await request(app)
            .patch(`${base}/teams/${team.id}`)
            .send({ version: 2, archived: true })
        ).status,
      ).toBe(200);
      expect((await request(app).get(`${base}/teams`)).body.data).toHaveLength(
        0,
      );
      const history = (await request(app).get(`${base}/teams/${team.id}`)).body
        .data;
      expect(history.archivedAt).toBeTruthy();
      expect(history.tickets[0].id).toBe(ticket.id);
      expect(history.tickets[0]).not.toHaveProperty("description");
      expect(
        (await request(app).get(`${base}/tickets/${ticket.id}`)).body.data
          .description,
      ).toBe("Keep requirements intact");
      expect(
        (
          await request(app).post(`${base}/tickets`).send({
            title: "New assignment must fail",
            ownerId: actor.id,
            teamId: team.id,
          })
        ).status,
      ).toBe(400);
      const edit = await request(app)
        .patch(`${base}/tickets/${ticket.id}`)
        .send({
          version: ticket.version,
          teamId: team.id,
          title: "Existing requirement updated",
        });
      expect(edit.status, edit.text).toBe(200);
      expect((await request(app).get(`${base}/tickets`)).body.meta.total).toBe(
        1,
      );
      expect(
        (
          await request(app)
            .patch(`${base}/teams/${team.id}`)
            .send({ version: 3, archived: false })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app).post(`${base}/tickets`).send({
            title: "Reactivated team assignment",
            ownerId: actor.id,
            teamId: team.id,
          })
        ).status,
      ).toBe(201);
    }));
  it("enforces project, owner, sprint and team isolation in real API calls", async () =>
    fixture(async ({ app, actor, outsider, context, anchor, tx }) => {
      const other = (
        await request(app)
          .post("/api/v1/projects")
          .send({ name: "Separate product B" })
      ).body.data;
      const a = `/api/v1/projects/${anchor.id}`,
        b = `/api/v1/projects/${other.id}`;
      const team = (
        await request(app)
          .post(`${a}/teams`)
          .send({ name: "Project A only", responsiblePoId: actor.id })
      ).body.data;
      const sprint = await tx.sprint.create({
        data: {
          projectId: anchor.id,
          name: "A sprint",
          startDate: new Date("2026-11-01T00:00:00Z"),
          endDate: new Date("2026-11-30T00:00:00Z"),
        },
      });
      expect(
        (
          await request(app).post(`${b}/tickets`).send({
            title: "Cross-project team",
            ownerId: actor.id,
            teamId: team.id,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app).post(`${b}/tickets`).send({
            title: "Cross-project sprint",
            ownerId: actor.id,
            sprintId: sprint.id,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`${a}/teams`)
            .send({ name: "Wrong owner", responsiblePoId: outsider.id })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .patch(`${b}/teams/${team.id}`)
            .send({ version: 1, name: "Wrong project" })
        ).status,
      ).toBe(404);
      await request(app).post(`${a}/tickets`).send({
        title: "Only visible in A",
        ownerId: actor.id,
        teamId: team.id,
      });
      expect((await request(app).get(`${b}/tickets`)).body.data).toHaveLength(
        0,
      );
      expect((await request(app).get(`${b}/teams`)).body.data).toHaveLength(0);
      context.actorId = outsider.id;
      expect((await request(app).get(`${a}/tickets`)).status).toBe(403);
      expect(
        (
          await request(app)
            .post("/api/v1/projects")
            .send({ name: "Unapproved project" })
        ).status,
      ).toBe(403);
      expect(
        (await request(app).get("/api/v1/projects")).body.data,
      ).toHaveLength(0);
    }));
  it("archives projects without deleting history and can reactivate/edit dates and ownership", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      expect(
        (
          await request(app).patch(base).send({
            version: 1,
            startDate: "2026-11-01",
            targetDate: "2026-12-01",
            ownerId: actor.id,
            name: "Edited product",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .patch(base)
            .send({ version: 1, name: "Stale project edit" })
        ).status,
      ).toBe(409);
      expect(
        (await request(app).patch(base).send({ version: 2, archived: true }))
          .status,
      ).toBe(200);
      expect(
        (await request(app).get("/api/v1/projects")).body.data,
      ).toHaveLength(0);
      expect(
        (await request(app).get("/api/v1/projects?status=ARCHIVED")).body
          .data[0].id,
      ).toBe(anchor.id);
      expect((await request(app).get(`${base}/dashboard`)).status).toBe(200);
      expect(
        (
          await request(app)
            .patch(base)
            .send({ version: 3, name: "Must remain read only" })
        ).status,
      ).toBe(409);
      expect((await request(app).get(base)).body.data.name).not.toBe(
        "Must remain read only",
      );
      expect(
        (
          await request(app)
            .post(`${base}/teams`)
            .send({ name: "Archived project work", responsiblePoId: actor.id })
        ).status,
      ).toBe(409);
      expect(
        (await request(app).patch(base).send({ version: 3, archived: false }))
          .status,
      ).toBe(200);
      expect((await request(app).get(base)).body.data.status).toBe("ACTIVE");
    }));
  it("rejects duplicate project codes without replacing existing projects", async () =>
    fixture(async ({ app, anchor }) => {
      const response = await request(app)
        .post("/api/v1/projects")
        .send({ name: "Duplicate", code: anchor.key });
      expect(response.status).toBe(409);
    }));
  it("rejects duplicate team codes within a project", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const url = `/api/v1/projects/${anchor.id}/teams`;
      expect(
        (
          await request(app).post(url).send({
            name: "First team",
            code: "SAME",
            responsiblePoId: actor.id,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app).post(url).send({
            name: "Second team",
            code: "SAME",
            responsiblePoId: actor.id,
          })
        ).status,
      ).toBe(409);
    }));
});

describe("Complete dynamic delivery journeys on PostgreSQL", () => {
  it("creates linked decisions on PostgreSQL, deduplicates links and rejects cross-project tickets", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      const ticket = (
        await request(app)
          .post(base + "/tickets")
          .send({ title: "Decision requirement", ownerId: actor.id })
      ).body.data;
      const fields = {
        title: "Keep the canonical requirement",
        description: "A persisted product decision",
        rationale: "Preserve traceability",
      };
      const response = await request(app)
        .post(base + "/decisions")
        .send({
          ...fields,
          ticketIds: [ticket.id, ticket.id],
          makerId: "forged",
        });
      expect(response.status).toBe(201);
      const persisted = (await request(app).get(base + "/decisions")).body
        .data[0];
      expect(persisted.makerId).toBe(actor.id);
      expect(persisted.tickets).toHaveLength(1);
      expect(persisted.tickets[0].projectId).toBe(anchor.id);
      expect(persisted.tickets[0].ticketId).toBe(ticket.id);
      const other = (
        await request(app)
          .post("/api/v1/projects")
          .send({ name: "Other decision scope" })
      ).body.data;
      const foreign = (
        await request(app)
          .post(`/api/v1/projects/${other.id}/tickets`)
          .send({ title: "Other project's requirement", ownerId: actor.id })
      ).body.data;
      expect(
        (
          await request(app)
            .post(base + "/decisions")
            .send({ ...fields, ticketIds: [foreign.id] })
        ).status,
      ).toBe(400);
      expect(
        (await request(app).get(base + "/decisions")).body.meta.total,
      ).toBe(1);
      expect(
        (
          await request(app)
            .patch(base + "/decisions/" + persisted.id)
            .send({
              ...fields,
              rationale: "Reconciled rationale",
              ticketIds: [],
              version: 1,
            })
        ).status,
      ).toBe(200);
      expect(
        (await request(app).get(base + "/decisions")).body.data[0].tickets,
      ).toHaveLength(0);
      expect(
        (
          await request(app)
            .patch(base + "/decisions/" + persisted.id)
            .send({ ...fields, ticketIds: [], version: 1 })
        ).status,
      ).toBe(409);
    }));
  it("shares canonical tickets between POs and protects stale edits", async () =>
    fixture(async ({ app, actor, anchor, tx, context, outsider }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      const ticket = (
        await request(app)
          .post(base + "/tickets")
          .send({ title: "Shared daily delivery", ownerId: actor.id })
      ).body.data;
      await tx.projectMembership.create({
        data: {
          projectId: anchor.id,
          userId: outsider.id,
          role: "PRODUCT_OWNER",
        },
      });
      context.actorId = outsider.id;
      expect(
        (await request(app).get(base + "/tickets/" + ticket.id)).body.data
          .title,
      ).toBe(ticket.title);
      expect(
        (
          await request(app)
            .patch(base + "/tickets/" + ticket.id)
            .send({ version: 1, title: "Refined together" })
        ).status,
      ).toBe(200);
      context.actorId = actor.id;
      expect(
        (
          await request(app)
            .patch(base + "/tickets/" + ticket.id)
            .send({ version: 1, title: "Stale overwrite" })
        ).status,
      ).toBe(409);
      expect(
        (await request(app).get(base + "/tickets/" + ticket.id)).body.data
          .title,
      ).toBe("Refined together");
      expect(
        (
          await request(app).get(base + "/audit-events?entityId=" + ticket.id)
        ).body.data.some((e: any) => e.actor.name === outsider.name),
      ).toBe(true);
    }));
  it("sorts priority by business order before paginating", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}/tickets`;
      for (const priority of ["LOW", "MEDIUM", "CRITICAL", "HIGH"])
        await request(app)
          .post(base)
          .send({
            title: `${priority} priority requirement`,
            ownerId: actor.id,
            priority,
          });
      const first = await request(app).get(
        base + "?sort=priority&direction=asc&limit=2",
      );
      expect(first.status).toBe(200);
      expect(first.body.data.map((t: any) => t.priority)).toEqual([
        "CRITICAL",
        "HIGH",
      ]);
      expect(first.body.meta.total).toBe(4);
      const last = await request(app).get(
        base + "?sort=priority&direction=desc&limit=2",
      );
      expect(last.body.data.map((t: any) => t.priority)).toEqual([
        "LOW",
        "MEDIUM",
      ]);
    }));
  it("plans, starts and completes a sprint without losing unfinished work", async () =>
    fixture(async ({ app, actor, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      const sprint = await request(app)
        .post(base + "/sprints")
        .send({
          name: "Dynamic sprint",
          goal: "Ship safely",
          startDate: "2026-11-15T00:00:00Z",
          endDate: "2026-11-29T00:00:00Z",
        });
      expect(sprint.status).toBe(201);
      const sp = sprint.body.data;
      const team = (
        await request(app)
          .post(base + "/teams")
          .send({ name: "Delivery team", responsiblePoId: actor.id })
      ).body.data;
      const ticket = (
        await request(app)
          .post(base + "/tickets")
          .send({
            title: "Keep my unfinished work",
            ownerId: actor.id,
            sprintId: sp.id,
            teamId: team.id,
          })
      ).body.data;
      let board = (await request(app).get(base + "/sprints")).body.data[0];
      expect(board.tickets[0].team.name).toBe("Delivery team");
      expect(board.tickets[0].owner.name).toBe(actor.name);
      expect(
        (
          await request(app)
            .patch(base + "/teams/" + team.id)
            .send({ version: 1, name: "Renamed delivery" })
        ).status,
      ).toBe(200);
      board = (await request(app).get(base + "/sprints")).body.data[0];
      expect(board.tickets[0].team.name).toBe("Renamed delivery");
      expect(
        (
          await request(app)
            .post(base + `/sprints/${sp.id}/transition`)
            .send({ version: 1, action: "START" })
        ).status,
      ).toBe(200);
      let current = (await request(app).get(base + "/tickets/" + ticket.id))
        .body.data;
      expect(current.status).toBe("READY");
      expect(current.version).toBe(2);
      expect(
        (
          await request(app)
            .patch(base + "/sprints/" + sp.id)
            .send({
              name: "Stale edit",
              startDate: sp.startDate,
              endDate: sp.endDate,
              version: 1,
            })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app)
            .post(base + `/sprints/${sp.id}/transition`)
            .send({ version: 2, action: "COMPLETE" })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(base + `/sprints/${sp.id}/transition`)
            .send({
              version: 2,
              action: "COMPLETE",
              returnUnfinishedToBacklog: true,
            })
        ).status,
      ).toBe(200);
      current = (await request(app).get(base + "/tickets/" + ticket.id)).body
        .data;
      expect(current.sprintId).toBeNull();
      expect(current.status).toBe("BACKLOG");
      expect(current.id).toBe(ticket.id);
      expect(
        (
          await request(app)
            .patch(base + "/tickets/" + ticket.id)
            .send({ version: current.version, sprintId: sp.id })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(base + `/sprints/${sp.id}/transition`)
            .send({ version: 3, action: "START" })
        ).status,
      ).toBe(400);
      const dashboard = await request(app).get(base + "/dashboard");
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.data.total).toBe(1);
      expect(dashboard.body.data.counts.BACKLOG).toBe(1);
    }));
  it("allows one active sprint and rejects invalid dates and stale metadata", async () =>
    fixture(async ({ app, anchor }) => {
      const base = `/api/v1/projects/${anchor.id}/sprints`;
      const dates = {
        startDate: "2026-11-15T00:00:00Z",
        endDate: "2026-11-29T00:00:00Z",
      };
      expect(
        (
          await request(app).post(base).send({
            name: "Bad dates",
            startDate: dates.endDate,
            endDate: dates.startDate,
          })
        ).status,
      ).toBe(400);
      const a = (
        await request(app)
          .post(base)
          .send({ name: "First sprint", ...dates })
      ).body.data;
      const b = (
        await request(app)
          .post(base)
          .send({ name: "Second sprint", ...dates })
      ).body.data;
      expect(
        (
          await request(app)
            .post(base + "/" + a.id + "/transition")
            .send({ version: 1, action: "START" })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post(base + "/" + b.id + "/transition")
            .send({ version: 1, action: "START" })
        ).status,
      ).toBe(409);
    }));
  it("persists PO updates, filters before pagination, and identifies shared edits", async () =>
    fixture(async ({ app, actor, anchor, tx, context, outsider }) => {
      const base = `/api/v1/projects/${anchor.id}`;
      const review = (
        await request(app)
          .post(base + "/reviews")
          .send({
            title: "Clarify dynamic requirements",
            category: "QUESTION",
            ownerId: actor.id,
          })
      ).body.data;
      expect(
        (
          await request(app)
            .post(base + "/reviews/" + review.id + "/updates")
            .send({ body: "Clarification from the Product Owner" })
        ).status,
      ).toBe(201);
      let result = await request(app).get(
        base + "/reviews?status=RESOLVED&search=dynamic",
      );
      expect(result.body.meta.total).toBe(0);
      await tx.projectMembership.create({
        data: {
          projectId: anchor.id,
          userId: outsider.id,
          role: "PRODUCT_OWNER",
        },
      });
      context.actorId = outsider.id;
      const changed = await request(app)
        .patch(base + "/reviews/" + review.id)
        .send({
          ...review,
          status: "RESOLVED",
          notes: "Reviewed together",
          version: 1,
        });
      expect(changed.status).toBe(200);
      context.actorId = actor.id;
      expect(
        (
          await request(app)
            .patch(base + "/reviews/" + review.id)
            .send({ ...review, version: 1 })
        ).status,
      ).toBe(409);
      result = await request(app).get(
        base + "/reviews?status=RESOLVED&search=dynamic",
      );
      expect(result.body.meta.total).toBe(1);
      const history = (
        await request(app).get(base + "/audit-events?entityId=" + review.id)
      ).body.data;
      expect(
        history.some(
          (e: any) => e.changes.body === "Clarification from the Product Owner",
        ),
      ).toBe(true);
      expect(
        history.some(
          (e: any) =>
            e.actor.name === outsider.name && e.action === "reviewItem.updated",
        ),
      ).toBe(true);
    }));
});
