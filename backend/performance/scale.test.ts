import { it, expect, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { db } from "../src/config/db.js";
import { createApp } from "../src/app.js";
afterAll(async () => {
  await db.$disconnect();
});

it("serves a 10,000-ticket local project within documented latency and payload budgets", async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/po_command_center"
  )
    throw Error(
      "Scale verification is restricted to local development PostgreSQL.",
    );
  const rollback = Error("ROLLBACK_SCALE_FIXTURE"),
    runId = randomUUID();
  let projectId = "";
  const report: any[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            firebaseUid: `scale-${runId}`,
            email: `${runId}@scale.invalid`,
            name: "Scale verification PO",
          },
        });
        const project = await tx.project.create({
          data: {
            key: `SCALE-${runId}`,
            name: "Rollback-only scale verification",
            ownerId: user.id,
            ticketCounter: 10000,
          },
        });
        projectId = project.id;
        await tx.projectMembership.create({
          data: { projectId, userId: user.id, role: "PRODUCT_OWNER" },
        });
        const teams = Array.from({ length: 100 }, (_, i) => ({
          id: randomUUID(),
          projectId,
          name: `Scale team ${i + 1}`,
          code: `TEAM-${i + 1}`,
          responsiblePoId: user.id,
        }));
        await tx.team.createMany({ data: teams });
        const sprints = Array.from({ length: 20 }, (_, i) => ({
          id: randomUUID(),
          projectId,
          name: `Scale sprint ${i + 1}`,
          startDate: new Date("2026-11-01T00:00:00Z"),
          endDate: new Date("2026-11-30T00:00:00Z"),
        }));
        await tx.sprint.createMany({ data: sprints });
        for (let start = 0; start < 10000; start += 500)
          await tx.ticket.createMany({
            data: Array.from({ length: 500 }, (_, offset) => {
              const i = start + offset;
              return {
                id: randomUUID(),
                projectId,
                identifier: `SCALE-${i + 1}`,
                title: `Scale requirement ${i + 1}`,
                description: "Requirement context. ".repeat(75),
                acceptanceCriteria:
                  "Given authorized access, then preserve results. ".repeat(12),
                userStory: "As a PO I want a dependable shared backlog.",
                ownerId: user.id,
                teamId: teams[i % teams.length].id,
                sprintId: sprints[i % sprints.length].id,
                status: [
                  "BACKLOG",
                  "READY",
                  "IN_PROGRESS",
                  "IN_REVIEW",
                  "DONE",
                ][i % 5],
                priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"][i % 4],
                rank: i,
              };
            }),
          });
        const facade = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return async (operation: any) => {
                if (typeof operation === "function") return operation(tx);
                const results = [];
                for (const query of operation) results.push(await query);
                return results;
              };
            return Reflect.get(target, key);
          },
        }) as unknown as PrismaClient;
        const app = createApp(facade, (req, _res, next) => {
          req.identity = {
            id: user.id,
            firebaseUid: user.firebaseUid,
            email: user.email,
            name: user.name,
          };
          next();
        });
        const base = `/api/v1/projects/${projectId}`;
        for (const [name, path, maxBytes] of [
          ["backlog", base + "/tickets?limit=30", 512 * 1024],
          [
            "priority page",
            base + "/tickets?sort=priority&limit=30",
            512 * 1024,
          ],
          ["dashboard", base + "/dashboard", 2 * 1024 * 1024],
          ["team workloads", base + "/teams", 10 * 1024 * 1024],
          ["sprint workloads", base + "/sprints", 10 * 1024 * 1024],
        ] as const) {
          const times: number[] = [];
          let bytes = 0;
          for (let sample = 0; sample < 3; sample++) {
            const began = performance.now(),
              response = await request(app).get(path);
            times.push(Math.round(performance.now() - began));
            bytes = Buffer.byteLength(response.text);
            expect(response.status, `${name}: API status`).toBe(200);
            if (name === "backlog") {
              expect(response.body.meta.total).toBe(10000);
              expect(response.body.data).toHaveLength(30);
            }
            if (name === "dashboard") {
              expect(response.body.data.total).toBe(10000);
              expect(response.body.data.counts.DONE).toBe(2000);
              expect(response.body.data.recent).toHaveLength(6);
            }
          }
          report.push({
            endpoint: name,
            samplesMs: times,
            maxMs: Math.max(...times),
            bytes,
            maxBytes,
          });
        }
        console.log(
          "Local scale verification:",
          JSON.stringify({
            tickets: 10000,
            teams: 100,
            sprints: 20,
            requests: "sequential; three samples per endpoint",
            report,
          }),
        );
        for (const result of report) {
          expect(
            result.maxMs,
            `${result.endpoint}: local latency budget`,
          ).toBeLessThan(5000);
          expect(
            result.bytes,
            `${result.endpoint}: response payload budget`,
          ).toBeLessThan(result.maxBytes);
        }
        throw rollback;
      },
      { timeout: 110000, maxWait: 10000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(await db.project.count({ where: { id: projectId } })).toBe(0);
  mkdirSync(".cache/verification", { recursive: true });
  writeFileSync(
    ".cache/verification/scale-latest.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tickets: 10000,
        teams: 100,
        sprints: 20,
        samplesPerEndpoint: 3,
        latencyBudgetMs: 5000,
        rollbackVerified: true,
        report,
      },
      null,
      2,
    ),
  );
});
