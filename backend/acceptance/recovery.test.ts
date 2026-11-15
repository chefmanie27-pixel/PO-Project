import { it, expect } from "vitest";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { withIsolatedDatabase } from "../verification/isolated-database.js";
import { createApp } from "../src/app.js";

it("restores a real schema backup into a separate isolated target with history and relationships intact", async () => {
  const report = await withIsolatedDatabase(async (source) => {
    const [scope] = await source.$queryRaw<
      { scope: string }[]
    >`SELECT current_schema() AS scope`;
    const owner = await source.user.create({
      data: {
        firebaseUid: `recovery-${randomUUID()}`,
        email: `${randomUUID()}@recovery.invalid`,
        name: "Recovery verification PO",
      },
    });
    const project = await source.project.create({
      data: {
        key: "RECOVERY",
        name: "Synthetic recovery verification",
        ownerId: owner.id,
        ticketCounter: 2,
      },
    });
    await source.projectMembership.create({
      data: { projectId: project.id, userId: owner.id, role: "ADMIN" },
    });
    const team = await source.team.create({
      data: {
        projectId: project.id,
        name: "Archived history team",
        code: "HISTORY",
        responsiblePoId: owner.id,
      },
    });
    const sprint = await source.sprint.create({
      data: {
        projectId: project.id,
        name: "Recovery sprint",
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-30T00:00:00Z"),
      },
    });
    const parent = await source.ticket.create({
      data: {
        projectId: project.id,
        identifier: "RECOVERY-1",
        title: "Parent requirement",
        ownerId: owner.id,
      },
    });
    const description =
      "Preserve requirements, Unicode résumé and acceptance history.";
    const ticket = await source.ticket.create({
      data: {
        projectId: project.id,
        identifier: "RECOVERY-2",
        title: "Recover the canonical requirement",
        description,
        acceptanceCriteria: "All linked records survive the restore.",
        userStory: "As a PO, I need a recoverable project.",
        ownerId: owner.id,
        teamId: team.id,
        sprintId: sprint.id,
        parentId: parent.id,
        status: "READY",
        version: 3,
      },
    });
    await source.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: owner.id,
        body: "A persistent recovery comment",
      },
    });
    await source.ticketDependency.create({
      data: {
        projectId: project.id,
        ticketId: ticket.id,
        dependsOnId: parent.id,
      },
    });
    await source.blocker.create({
      data: {
        projectId: project.id,
        ticketId: ticket.id,
        title: "Recovery blocker",
        description: "Restore this open blocker",
        ownerId: owner.id,
      },
    });
    await source.reviewItem.create({
      data: {
        projectId: project.id,
        ticketId: ticket.id,
        title: "Recovery review",
        category: "QUESTION",
        ownerId: owner.id,
        notes: "Preserve review notes",
      },
    });
    await source.decision.create({
      data: {
        projectId: project.id,
        title: "Recovery decision",
        description: "Keep one canonical record",
        rationale: "Protect product history",
        makerId: owner.id,
        tickets: { create: { ticketId: ticket.id } },
      },
    });
    await source.auditEvent.create({
      data: {
        projectId: project.id,
        actorId: owner.id,
        action: "verification.created",
        entityId: ticket.id,
        changes: { body: "Persistent audit history" },
      },
    });
    await source.team.update({
      where: { id: team.id },
      data: { status: "ARCHIVED", archivedAt: new Date(), version: 2 },
    });
    mkdirSync(".cache/verification", { recursive: true });
    const dumpPath = resolve(
      ".cache/verification",
      `recovery-${randomUUID()}.sql`,
    );
    const url = new URL(process.env.DATABASE_URL!);
    const executable =
      process.env.PG_DUMP_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"
        : "pg_dump");
    const backup = spawnSync(
      executable,
      [
        "-h",
        url.hostname,
        "-p",
        url.port || "5432",
        "-U",
        decodeURIComponent(url.username),
        "-d",
        decodeURIComponent(url.pathname.slice(1)),
        "--schema",
        scope.scope,
        "--no-owner",
        "--no-privileges",
        "--inserts",
        "-f",
        dumpPath,
      ],
      {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    if (backup.status !== 0)
      throw Error(
        "Isolated schema backup failed; no application records were selected",
      );
    const backupSql = readFileSync(dumpPath, "utf8");
    expect(backupSql).toContain(description);
    const restored = await withIsolatedDatabase(
      async (target) => {
        const [targetScope] = await target.$queryRaw<
          { scope: string }[]
        >`SELECT current_schema() AS scope`;
        expect(targetScope.scope).not.toBe(scope.scope);
        if (
          !/^po_verify_[a-f0-9]{32}$/.test(scope.scope) ||
          !/^po_verify_[a-f0-9]{32}$/.test(targetScope.scope)
        )
          throw Error("Unsafe restore namespace");
        // This drill remaps only two generated test namespaces. It is not a
        // general-purpose rewriter for production backups.
        const sql = backupSql
          .replaceAll(scope.scope, targetScope.scope)
          .replace(/^\\(?:un)?restrict\s+\S+\s*$/gm, "")
          .replace(
            new RegExp(`^CREATE SCHEMA ${targetScope.scope};\\s*$`, "gm"),
            "",
          );
        if (
          /\bpublic\s*\.|\bDROP\s+(?:SCHEMA|DATABASE)|\bCREATE\s+DATABASE/i.test(
            sql,
          )
        )
          throw Error(
            "Restore contains an unexpected namespace or destructive statement",
          );
        const control = new Client({
          connectionString: process.env.DATABASE_URL,
        });
        await control.connect();
        try {
          await control.query("BEGIN");
          await control.query(sql);
          await control.query("COMMIT");
        } catch (error) {
          await control.query("ROLLBACK");
          throw error;
        } finally {
          await control.end();
        }
        const app = createApp(target, (req, _res, next) => {
          req.identity = owner;
          next();
        });
        const response = await request(app).get(
          `/api/v1/projects/${project.id}/tickets/${ticket.id}`,
        );
        expect(response.status).toBe(200);
        const detail = response.body.data;
        expect(detail.id).toBe(ticket.id);
        expect(detail.version).toBe(3);
        expect(detail.description).toBe(description);
        expect(detail.comments[0].body).toBe("A persistent recovery comment");
        expect(detail.parent.id).toBe(parent.id);
        expect(detail.dependencies[0].dependsOnId).toBe(parent.id);
        expect(detail.team.id).toBe(team.id);
        expect(detail.team.archivedAt).toBeTruthy();
        expect(detail.sprint.id).toBe(sprint.id);
        expect(detail.blockers).toHaveLength(1);
        expect(detail.reviews).toHaveLength(1);
        expect(detail.decisions).toHaveLength(1);
        expect(
          (
            await target.auditEvent.findFirstOrThrow({
              where: { entityId: ticket.id },
            })
          ).changes,
        ).toEqual({ body: "Persistent audit history" });
        const counts = {
          users: await target.user.count(),
          projects: await target.project.count(),
          teams: await target.team.count(),
          sprints: await target.sprint.count(),
          tickets: await target.ticket.count(),
          comments: await target.comment.count(),
          blockers: await target.blocker.count(),
          reviews: await target.reviewItem.count(),
          decisions: await target.decision.count(),
          decisionLinks: await target.decisionTicket.count(),
          dependencies: await target.ticketDependency.count(),
          memberships: await target.projectMembership.count(),
          auditEvents: await target.auditEvent.count(),
        };
        expect(counts).toEqual({
          users: 1,
          projects: 1,
          teams: 1,
          sprints: 1,
          tickets: 2,
          comments: 1,
          blockers: 1,
          reviews: 1,
          decisions: 1,
          decisionLinks: 1,
          dependencies: 1,
          memberships: 1,
          auditEvents: 1,
        });
        expect(
          (
            await request(app)
              .post(`/api/v1/projects/${project.id}/tickets`)
              .send({
                title: "Reject archived assignment",
                ownerId: owner.id,
                teamId: team.id,
              })
          ).status,
        ).toBe(400);
        return counts;
      },
      { empty: true },
    );
    expect(await source.ticket.count()).toBe(2);
    return {
      generatedAt: new Date().toISOString(),
      dumpBytes: Buffer.byteLength(backupSql),
      restoredCounts: restored,
      unicodeAndRequirementsPreserved: true,
      relationshipsAndHistoryPreserved: true,
      archivedAssignmentProtectionVerified: true,
    };
  });
  writeFileSync(
    ".cache/verification/recovery-latest.json",
    JSON.stringify(
      {
        ...report,
        isolatedSourceAndTargetDropped: true,
        existingPublicIdsPreserved: true,
      },
      null,
      2,
    ),
  );
});
