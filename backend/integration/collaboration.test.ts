import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { getApps, deleteApp } from "firebase-admin/app";
import type { PrismaClient } from "@prisma/client";
import { db } from "../src/config/db.js";
import { createApp } from "../src/app.js";
import { createAuthenticate } from "../src/middleware/auth.js";
import { getFirebaseAdminAuth } from "../src/config/firebase.js";

function requireLocalServices() {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.FIREBASE_PROJECT_ID?.startsWith("demo-") ||
    !host ||
    !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/po_command_center"
  )
    throw Error(
      "Collaboration verification requires demo Firebase emulators and local development PostgreSQL.",
    );
  return host;
}
async function register(host: string) {
  const email = `collaboration-${randomUUID()}@example.invalid`;
  const password = `Local-test-${randomUUID()}`;
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw Error("Local emulator registration failed");
  const created = await response.json();
  const login = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!login.ok) throw Error("Local emulator sign-in failed");
  const session = await login.json();
  return {
    email,
    uid: created.localId as string,
    token: session.idToken as string,
  };
}
afterAll(async () => {
  await db.$disconnect();
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe("Real Firebase identities, Express authorization and PostgreSQL collaboration", () => {
  it("completes a shared delivery journey, rejects stale/unauthorized edits and rolls back all SQL fixtures", async () => {
    const host = requireLocalServices();
    const a = await register(host),
      b = await register(host),
      outsider = await register(host);
    const rollback = Error("ROLLBACK_REAL_COLLABORATION_FIXTURE");
    const runId = randomUUID();
    let projectId = "";
    try {
      await db.$transaction(
        async (tx) => {
          const owner = await tx.user.create({
            data: { firebaseUid: a.uid, email: a.email, name: "Local PO A" },
          });
          await tx.user.create({
            data: { firebaseUid: b.uid, email: b.email, name: "Local PO B" },
          });
          const anchor = await tx.project.create({
            data: {
              key: `AUTH-${runId}`,
              name: "Rollback-only approval anchor",
              ownerId: owner.id,
            },
          });
          await tx.projectMembership.create({
            data: {
              projectId: anchor.id,
              userId: owner.id,
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
          const app = createApp(facade, createAuthenticate(facade));
          const authA = `Bearer ${a.token}`,
            authB = `Bearer ${b.token}`;
          expect(
            (
              await request(app)
                .get("/api/v1/profile")
                .set("Authorization", `Bearer ${outsider.token}`)
            ).status,
          ).toBe(403);
          const created = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", authA)
            .send({ name: "Real authenticated collaboration" });
          expect(created.status).toBe(201);
          projectId = created.body.data.id;
          const base = `/api/v1/projects/${projectId}`;
          expect(
            (await request(app).get(base).set("Authorization", authB)).status,
          ).toBe(403);
          const approval = await request(app)
            .post(base + "/memberships")
            .set("Authorization", authA)
            .send({
              firebaseUid: b.uid,
              email: b.email,
              name: "Local PO B",
              role: "PRODUCT_OWNER",
            });
          expect(approval.status).toBe(201);
          const team = (
            await request(app)
              .post(base + "/teams")
              .set("Authorization", authA)
              .send({ name: "Dynamic delivery", responsiblePoId: owner.id })
          ).body.data;
          const sprint = (
            await request(app)
              .post(base + "/sprints")
              .set("Authorization", authB)
              .send({
                name: "Shared authenticated sprint",
                goal: "Verify the real data flow",
                startDate: "2026-11-15T00:00:00Z",
                endDate: "2026-11-29T00:00:00Z",
              })
          ).body.data;
          const creation = await request(app)
            .post(base + "/tickets")
            .set("Authorization", authA)
            .send({
              title: "Requirement shared by real identities",
              ownerId: owner.id,
              teamId: team.id,
              sprintId: sprint.id,
            });
          expect(creation.status).toBe(201);
          const ticket = creation.body.data;
          expect(
            (
              await request(app)
                .get(base + "/tickets/" + ticket.id)
                .set("Authorization", authB)
            ).body.data.title,
          ).toBe(ticket.title);
          expect(
            (
              await request(app)
                .patch(base + "/tickets/" + ticket.id)
                .set("Authorization", authB)
                .send({ version: 1, description: "Refined by PO B" })
            ).status,
          ).toBe(200);
          expect(
            (
              await request(app)
                .patch(base + "/tickets/" + ticket.id)
                .set("Authorization", authA)
                .send({ version: 1, title: "Stale overwrite" })
            ).status,
          ).toBe(409);
          expect(
            (
              await request(app)
                .get(base + "/tickets/" + ticket.id)
                .set("Authorization", authA)
            ).body.data.description,
          ).toBe("Refined by PO B");
          expect(
            (
              await request(app)
                .post(base + `/sprints/${sprint.id}/transition`)
                .set("Authorization", authB)
                .send({ version: 1, action: "START" })
            ).status,
          ).toBe(200);
          for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"]) {
            const current = (
              await request(app)
                .get(base + "/tickets/" + ticket.id)
                .set("Authorization", authB)
            ).body.data;
            expect(
              (
                await request(app)
                  .patch(base + "/tickets/" + ticket.id)
                  .set("Authorization", authB)
                  .send({ version: current.version, status })
              ).status,
            ).toBe(200);
          }
          expect(
            (
              await request(app)
                .post(base + `/sprints/${sprint.id}/transition`)
                .set("Authorization", authA)
                .send({ version: 2, action: "COMPLETE" })
            ).status,
          ).toBe(200);
          const dashboard = (
            await request(app)
              .get(base + "/dashboard")
              .set("Authorization", authA)
          ).body.data;
          expect(dashboard.counts.DONE).toBe(1);
          expect(dashboard.workload[0].done).toBe(1);
          const history = (
            await request(app)
              .get(base + "/audit-events?entityId=" + ticket.id)
              .set("Authorization", authA)
          ).body;
          expect(
            history.data.some(
              (event: any) => event.actor.name === "Local PO B",
            ),
          ).toBe(true);
          expect(history.meta.total).toBeGreaterThan(3);
          expect(
            (
              await request(app)
                .post(base + "/memberships")
                .set("Authorization", authB)
                .send({
                  firebaseUid: outsider.uid,
                  email: outsider.email,
                  name: "Unapproved identity",
                  role: "ADMIN",
                })
            ).status,
          ).toBe(403);
          await getFirebaseAdminAuth().updateUser(b.uid, { disabled: true });
          expect(
            (
              await request(app)
                .get(base + "/tickets")
                .set("Authorization", authB)
            ).status,
          ).toBe(401);
          throw rollback;
        },
        { timeout: 45000, maxWait: 10000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(
      await db.project.findUnique({ where: { id: projectId } }),
    ).toBeNull();
    expect(
      await db.user.findUnique({ where: { firebaseUid: a.uid } }),
    ).toBeNull();
  }, 55000);
});
