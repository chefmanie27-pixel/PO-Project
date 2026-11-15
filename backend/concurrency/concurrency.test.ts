import { it, expect } from "vitest";
import request from "supertest";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { withIsolatedDatabase } from "../verification/isolated-database.js";

async function workers<T>(
  count: number,
  concurrency: number,
  job: (index: number) => Promise<T>,
) {
  const results: T[] = new Array(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const i = next++;
        if (i >= count) return;
        results[i] = await job(i);
      }
    }),
  );
  return results;
}
function timings(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    requests: sorted.length,
    p50Ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    maxMs: Math.round(sorted.at(-1) || 0),
  };
}

it("protects real concurrent writes and serves parallel readers using an isolated schema", async () => {
  const report = await withIsolatedDatabase(async (db) => {
    const users = await Promise.all(
      ["a", "b", "outsider"].map(async (name) =>
        db.user.create({
          data: {
            firebaseUid: `concurrency-${randomUUID()}`,
            email: `${randomUUID()}@concurrency.invalid`,
            name: `Concurrent PO ${name}`,
          },
        }),
      ),
    );
    const project = await db.project.create({
      data: {
        key: `CONCUR-${randomUUID().replaceAll("-", "")}`,
        name: "Isolated concurrency verification",
        ownerId: users[0].id,
      },
    });
    await db.projectMembership.createMany({
      data: users
        .slice(0, 2)
        .map((user) => ({
          projectId: project.id,
          userId: user.id,
          role: "PRODUCT_OWNER",
        })),
    });
    const app = createApp(db, (req, _res, next) => {
      req.identity =
        users[Number(req.headers["x-verification-user"] || 0)] || users[2];
      next();
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const client = request(server),
      base = `/api/v1/projects/${project.id}`;
    try {
      const pids = await Promise.all(
        Array.from({ length: 4 }, () =>
          db.$transaction(async (tx) => {
            const [row] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            await tx.$queryRaw`SELECT 1 AS ready FROM pg_sleep(0.05)`;
            return row.pid;
          }),
        ),
      );
      expect(new Set(pids).size).toBeGreaterThan(1);
      const creationTimes: number[] = [];
      const created = await workers(40, 8, async (i) => {
        const start = performance.now();
        const response = await client
          .post(base + "/tickets")
          .set("x-verification-user", String(i % 2))
          .send({
            title: `Concurrent requirement ${i + 1}`,
            ownerId: users[i % 2].id,
          });
        creationTimes.push(performance.now() - start);
        expect(response.status).toBe(201);
        return response.body.data;
      });
      expect(new Set(created.map((t) => t.id)).size).toBe(40);
      expect(new Set(created.map((t) => t.identifier)).size).toBe(40);
      expect(
        created
          .map((t) => Number(t.identifier.split("-").at(-1)))
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      expect(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .ticketCounter,
      ).toBe(40);
      const conflict = await Promise.all(
        [0, 1].map((actor) =>
          client
            .patch(base + "/tickets/" + created[0].id)
            .set("x-verification-user", String(actor))
            .send({ version: 1, title: `Edit by PO ${actor}` }),
        ),
      );
      expect(conflict.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: created[0].id } }))
          .version,
      ).toBe(2);
      const sprints = await Promise.all(
        ["A", "B"].map((name) =>
          db.sprint.create({
            data: {
              projectId: project.id,
              name: `Contending sprint ${name}`,
              startDate: new Date("2026-11-15T00:00:00Z"),
              endDate: new Date("2026-11-29T00:00:00Z"),
            },
          }),
        ),
      );
      const starts = await Promise.all(
        sprints.map((sprint) =>
          client
            .post(base + `/sprints/${sprint.id}/transition`)
            .send({ version: 1, action: "START" }),
        ),
      );
      expect(starts.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await db.sprint.count({
          where: { projectId: project.id, status: "ACTIVE" },
        }),
      ).toBe(1);
      const paths = [
        "/tickets?limit=10",
        "/dashboard",
        "/teams",
        "/sprints",
        "/audit-events",
      ];
      const readTimes = await workers(50, 10, async (i) => {
        const began = performance.now();
        const response = await client
          .get(base + paths[i % paths.length])
          .set("x-verification-user", String(i % 2));
        expect(response.status).toBe(200);
        return performance.now() - began;
      });
      expect(
        (await client.get(base + "/tickets").set("x-verification-user", "2"))
          .status,
      ).toBe(403);
      const archiveRace = await Promise.all([
        client.patch(base).send({ version: 1, archived: true }),
        client
          .post(base + "/tickets")
          .set("x-verification-user", "1")
          .send({ title: "Work racing with archive", ownerId: users[1].id }),
      ]);
      expect(archiveRace[0].status).toBe(200);
      expect([201, 409]).toContain(archiveRace[1].status);
      expect(
        (
          await client
            .post(base + "/tickets")
            .send({
              title: "Must reject archived writes",
              ownerId: users[0].id,
            })
        ).status,
      ).toBe(409);
      const current = await db.project.findUniqueOrThrow({
        where: { id: project.id },
      });
      expect(
        (
          await client
            .patch(base)
            .send({ version: current.version, archived: false })
        ).status,
      ).toBe(200);
      const reads = timings(readTimes),
        writes = timings(creationTimes);
      expect(reads.p95Ms).toBeLessThan(5000);
      expect(writes.p95Ms).toBeLessThan(5000);
      return {
        generatedAt: new Date().toISOString(),
        distinctDatabaseConnections: new Set(pids).size,
        creates: { concurrency: 8, ...writes },
        reads: { concurrency: 10, ...reads },
        uniqueTicketIdentifiers: 40,
        staleEditStatuses: conflict.map((r) => r.status).sort(),
        sprintStartStatuses: starts.map((r) => r.status).sort(),
        archiveRaceStatuses: archiveRace.map((r) => r.status),
        identity:
          "injected test identities; SQL membership and all application transactions are real",
      };
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  mkdirSync(".cache/verification", { recursive: true });
  writeFileSync(
    ".cache/verification/concurrency-latest.json",
    JSON.stringify(
      {
        ...report,
        isolatedSchemaDropped: true,
        existingPublicIdsPreserved: true,
      },
      null,
      2,
    ),
  );
});
