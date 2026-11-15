import "dotenv/config";
import { db } from "../src/config/db.js";
if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw new Error(
    "Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment.",
  );
try {
  await db.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { key: "DEMO" } });
    if (existing) {
      if (!existing.demo)
        throw new Error("DEMO key belongs to a real project; refusing seed.");
      console.log("Demonstration project already exists; no records changed.");
      return;
    }
    const user = await tx.user.upsert({
      where: { firebaseUid: "demo-po-not-a-login" },
      create: {
        firebaseUid: "demo-po-not-a-login",
        email: "po@demo.invalid",
        name: "Demo Product Owner",
      },
      update: {},
    });
    const project = await tx.project.create({
      data: {
        key: "DEMO",
        name: "Atlas platform · demonstration",
        demo: true,
        description: "Demonstration data only. Not production progress.",
        ticketCounter: 10,
      },
    });
    await tx.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: "PRODUCT_OWNER" },
    });
    const teams = [];
    for (const [name, description] of [
      ["Platform", "Shared infrastructure and services"],
      ["Experience", "Frontend and customer journeys"],
      ["Commerce", "Checkout and payments"],
      ["Identity", "Secure accounts and access"],
      ["Insights", "Analytics and reporting"],
      ["Quality", "Quality engineering and automation"],
    ])
      teams.push(
        await tx.team.create({
          data: { projectId: project.id, name, description },
        }),
      );
    const sprints = [];
    for (let i = 0; i < 2; i++)
      sprints.push(
        await tx.sprint.create({
          data: {
            projectId: project.id,
            name: `Demo sprint ${i + 1}`,
            goal: i
              ? "Improve trust and visibility"
              : "Build a dependable product foundation",
            startDate: new Date(Date.UTC(2026, 10, 9 + i * 14)),
            endDate: new Date(Date.UTC(2026, 10, 22 + i * 14, 23, 59)),
          },
        }),
      );
    const titles = [
      "Unify account onboarding",
      "Define checkout acceptance criteria",
      "Introduce workspace access controls",
      "Build team workload overview",
      "Improve payment retry handling",
      "Capture product decision history",
      "Review accessibility of navigation",
      "Create delivery health endpoint",
      "Validate cross-project isolation",
      "Refine notification preferences",
    ];
    const tickets = [];
    for (let i = 0; i < titles.length; i++)
      tickets.push(
        await tx.ticket.create({
          data: {
            projectId: project.id,
            identifier: `DEMO-${i + 1}`,
            title: titles[i],
            description:
              i === 1
                ? ""
                : "Demonstration requirement for the Atlas platform.",
            userStory:
              "As a Product Owner, I want clear ownership so that teams can deliver confidently.",
            acceptanceCriteria:
              i === 1
                ? ""
                : "Given authorized project access, when the workflow completes, then the result is persisted and audited.",
            ownerId: user.id,
            teamId: teams[i % 6].id,
            sprintId: sprints[i % 2].id,
            status: ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE"][
              i % 5
            ],
            priority: ["HIGH", "MEDIUM", "LOW"][i % 3],
            rank: (i + 1) * 100,
          },
        }),
      );
    await tx.blocker.create({
      data: {
        projectId: project.id,
        ticketId: tickets[2].id,
        ownerId: user.id,
        title: "Confirm identity policy",
        description:
          "Demonstration blocker: align account requirements with product policy.",
        severity: "HIGH",
      },
    });
    const decision = await tx.decision.create({
      data: {
        projectId: project.id,
        title: "Use a single canonical backlog",
        description: "All six teams share one authoritative ticket register.",
        rationale: "Avoid duplicated requirements and fragmented ownership.",
        impact: "Team and sprint assignment reference the same ticket.",
        makerId: user.id,
        status: "APPROVED",
      },
    });
    await tx.decisionTicket.create({
      data: {
        projectId: project.id,
        decisionId: decision.id,
        ticketId: tickets[0].id,
      },
    });
    await tx.reviewItem.create({
      data: {
        projectId: project.id,
        ticketId: tickets[1].id,
        ownerId: user.id,
        title: "Clarify checkout requirements",
        category: "MISSING_REQUIREMENTS",
        priority: "HIGH",
        notes: "Demonstration review request.",
      },
    });
    console.log(
      "Demonstration project seeded. No real project records changed. Grant a real Firebase user DEMO membership explicitly if desired.",
    );
  });
} finally {
  await db.$disconnect();
}
