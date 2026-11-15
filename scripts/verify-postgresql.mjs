import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/po_command_center"
)
  throw new Error(
    "This verification is restricted to the local po_command_center development database.",
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const rollback = new Error("LOCAL_VERIFICATION_ROLLBACK");
let verified = false,
  crossProjectDenied = false;
try {
  await db.$queryRaw`SELECT 1`;
  const roles =
    await db.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
  if (roles[0].rolsuper || roles[0].rolcreatedb || roles[0].rolcreaterole)
    throw new Error(
      "Use the restricted application database role for verification.",
    );
  const baseline = await db.project.count();
  try {
    await db.$transaction(
      async (tx) => {
        const run = randomUUID();
        const user = await tx.user.create({
          data: {
            firebaseUid: `local-verification-${run}`,
            email: `${run}@local.invalid`,
            name: "Rollback verification",
          },
        });
        const project = await tx.project.create({
          data: { key: `VERIFY-${run}`, name: "Rollback-only verification" },
        });
        await tx.projectMembership.create({
          data: {
            projectId: project.id,
            userId: user.id,
            role: "PRODUCT_OWNER",
          },
        });
        const team = await tx.team.create({
          data: { projectId: project.id, name: "Verification team" },
        });
        const sprint = await tx.sprint.create({
          data: {
            projectId: project.id,
            name: "Verification sprint",
            startDate: new Date("2026-11-01T00:00:00Z"),
            endDate: new Date("2026-11-30T00:00:00Z"),
          },
        });
        const ticket = await tx.ticket.create({
          data: {
            projectId: project.id,
            identifier: "VERIFY-1",
            title: "Rollback-only ticket",
            ownerId: user.id,
            teamId: team.id,
            sprintId: sprint.id,
          },
        });
        await tx.comment.create({
          data: {
            ticketId: ticket.id,
            authorId: user.id,
            body: "Rollback-only verification",
          },
        });
        await tx.blocker.create({
          data: {
            projectId: project.id,
            ticketId: ticket.id,
            ownerId: user.id,
            title: "Verification blocker",
            description: "Rollback-only",
          },
        });
        await tx.reviewItem.create({
          data: {
            projectId: project.id,
            ticketId: ticket.id,
            ownerId: user.id,
            title: "Verification review",
            category: "QUESTION",
          },
        });
        const decision = await tx.decision.create({
          data: {
            projectId: project.id,
            makerId: user.id,
            title: "Verification decision",
            description: "Rollback-only",
            rationale: "Verify real SQL persistence",
          },
        });
        await tx.decisionTicket.create({
          data: {
            projectId: project.id,
            decisionId: decision.id,
            ticketId: ticket.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            projectId: project.id,
            actorId: user.id,
            action: "verification",
            entityId: ticket.id,
            changes: { rollback: true },
          },
        });
        const first = await tx.ticket.updateMany({
          where: { id: ticket.id, version: 1 },
          data: { title: "Updated verification", version: { increment: 1 } },
        });
        const stale = await tx.ticket.updateMany({
          where: { id: ticket.id, version: 1 },
          data: { title: "Must not overwrite", version: { increment: 1 } },
        });
        if (
          first.count !== 1 ||
          stale.count !== 0 ||
          (await tx.blocker.count({
            where: { ticketId: ticket.id, status: "OPEN" },
          })) !== 1
        )
          throw new Error("Ticket persistence or version checks failed.");
        const other = await tx.project.create({
          data: { key: `OTHER-${run}`, name: "Rollback-only other project" },
        });
        try {
          await tx.ticket.create({
            data: {
              projectId: other.id,
              identifier: "OTHER-1",
              title: "Must be rejected",
              ownerId: user.id,
              teamId: team.id,
            },
          });
        } catch (error) {
          crossProjectDenied = error.code === "P2003";
        }
        if (!crossProjectDenied)
          throw new Error(
            "Cross-project database relationships were not rejected.",
          );
        verified = true;
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if ((await db.project.count()) !== baseline)
    throw new Error(
      "Verification fixture rollback did not preserve project counts.",
    );
  console.log(
    JSON.stringify({
      databaseConnected: true,
      restrictedRole: true,
      relationalWritesVerified: verified,
      staleUpdateRejected: true,
      crossProjectRelationshipRejected: crossProjectDenied,
      fixtureTransactionRolledBack: true,
      existingDataPreserved: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      verificationFailed: true,
      code: error.code || "CHECK_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
