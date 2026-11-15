import { checkAccessibility } from "./accessibility";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("project-first navigation, custom teams, history and isolated workspaces", async ({
  page,
}) => {
  test.setTimeout(120000);
  const owner = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Ada Owner",
    email: "ada@fixture.invalid",
  };
  const projects: any[] = [
    {
      id: randomUUID(),
      key: "START",
      name: "Starter project",
      description: "Existing shared workspace",
      status: "ACTIVE",
      version: 1,
      ownerId: owner.id,
      updatedAt: new Date().toISOString(),
    },
  ];
  const teams: any[] = [],
    tickets: any[] = [],
    sprints: any[] = [];
  const related = (ticket: any) => ({
    ...ticket,
    owner,
    team: teams.find((t) => t.id === ticket.teamId) || null,
    sprint: sprints.find((s) => s.id === ticket.sprintId) || null,
    comments: [],
    dependencies: [],
    children: [],
    reviews: [],
    decisions: [],
    blockers: [],
  });
  const summary = (project: any) => ({
    ...project,
    owner,
    memberships: [
      { role: project.key === "START" ? "PRODUCT_OWNER" : "ADMIN" },
    ],
    _count: {
      teams: teams.filter((t) => t.projectId === project.id).length,
      tickets: tickets.filter((t) => t.projectId === project.id).length,
      blockers: 0,
    },
    sprints: [],
  });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      parts = url.pathname.replace("/api/v1", "").split("/").filter(Boolean),
      body = req.postDataJSON() || {},
      method = req.method();
    let data: any = [];
    let status = 200;
    if (parts[0] === "profile")
      data = {
        ...owner,
        notifications: true,
        memberships: projects.map((p) => ({
          projectId: p.id,
          role: p.key === "START" ? "PRODUCT_OWNER" : "ADMIN",
          project: p,
        })),
      };
    else if (parts[0] === "projects" && parts.length === 1) {
      if (method === "POST") {
        const p = {
          id: randomUUID(),
          key: body.code || "AUTO",
          ...body,
          version: 1,
          ownerId: owner.id,
          updatedAt: new Date().toISOString(),
        };
        projects.push(p);
        data = p;
        status = 201;
      } else data = projects.map(summary);
    } else if (parts[0] === "projects") {
      const project = projects.find((p) => p.id === parts[1]);
      if (!project)
        return route.fulfill({
          status: 403,
          json: { error: { message: "Project access denied" } },
        });
      const projectTeams = teams.filter((t) => t.projectId === project.id),
        projectTickets = tickets.filter((t) => t.projectId === project.id);
      if (parts.length === 2) {
        if (method === "PATCH")
          Object.assign(project, body, {
            version: project.version + 1,
            ...(body.archived !== undefined
              ? {
                  archivedAt: body.archived ? new Date().toISOString() : null,
                  status: body.archived ? "ARCHIVED" : "ACTIVE",
                }
              : {}),
          });
        data = { ...project, currentRole: "ADMIN" };
      } else if (parts[2] === "memberships")
        data = [{ id: "member", user: owner, role: "ADMIN" }];
      else if (parts[2] === "sprints") {
        if (method === "POST" && parts[4] === "transition") {
          const sp = sprints.find((s) => s.id === parts[3]);
          sp.status = body.action === "START" ? "ACTIVE" : "COMPLETED";
          sp.version++;
          for (const t of projectTickets.filter((t) => t.sprintId === sp.id)) {
            if (body.action === "START" && t.status === "BACKLOG") {
              t.status = "READY";
              t.version++;
            } else if (body.action === "COMPLETE" && t.status !== "DONE") {
              t.sprintId = null;
              t.status = "BACKLOG";
              t.version++;
            }
          }
          data = sp;
        } else if (method === "POST") {
          data = {
            ...body,
            id: randomUUID(),
            projectId: project.id,
            status: "PLANNED",
            version: 1,
          };
          sprints.push(data);
          status = 201;
        } else if (method === "PATCH") {
          data = sprints.find((s) => s.id === parts[3]);
          Object.assign(data, body, { version: data.version + 1 });
        } else
          data = sprints
            .filter((s) => s.projectId === project.id)
            .map((s) => ({
              ...s,
              tickets: projectTickets
                .filter((t) => t.sprintId === s.id)
                .map(related),
            }));
      } else if (parts[2] === "teams") {
        if (method === "POST") {
          data = {
            ...body,
            id: randomUUID(),
            projectId: project.id,
            version: 1,
            code: body.code || "AUTO-TEAM",
            status: body.status || "ACTIVE",
            archivedAt: null,
            updatedAt: new Date().toISOString(),
          };
          teams.push(data);
          status = 201;
        } else if (method === "PATCH") {
          data = projectTeams.find((t) => t.id === parts[3]);
          Object.assign(data, body, {
            version: data.version + 1,
            ...(body.archived !== undefined
              ? {
                  archivedAt: body.archived ? new Date().toISOString() : null,
                  status: body.archived ? "ARCHIVED" : "ACTIVE",
                }
              : {}),
          });
        } else {
          const rows = projectTeams.map((t) => ({
            ...t,
            responsiblePo: owner,
            tickets: projectTickets
              .filter((ticket) => ticket.teamId === t.id)
              .map(related),
          }));
          data = parts[3]
            ? rows.find((t) => t.id === parts[3])
            : rows.filter(
                (t) =>
                  url.searchParams.get("includeArchived") === "true" ||
                  !t.archivedAt,
              );
        }
      } else if (parts[2] === "tickets") {
        if (method === "POST") {
          data = {
            ...body,
            id: randomUUID(),
            identifier: `${project.key}-${projectTickets.length + 1}`,
            projectId: project.id,
            version: 1,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          };
          tickets.push(data);
          status = 201;
        } else if (method === "PATCH") {
          data = projectTickets.find((t) => t.id === parts[3]);
          Object.assign(data, body, { version: data.version + 1 });
        } else
          data = parts[3]
            ? related(projectTickets.find((t) => t.id === parts[3]))
            : projectTickets
                .filter(
                  (t) =>
                    !url.searchParams.get("teamId") ||
                    t.teamId === url.searchParams.get("teamId"),
                )
                .map(related);
      } else if (parts[2] === "dashboard")
        data = {
          total: projectTickets.length,
          counts: Object.fromEntries(
            ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE"].map(
              (s) => [s, projectTickets.filter((t) => t.status === s).length],
            ),
          ),
          blocked: 0,
          recent: projectTickets.map(related),
          sprints: sprints.filter((s) => s.projectId === project.id),
          reviews: [],
          indicators: [],
          blockers: [],
          decisions: [],
        };
    }
    await route.fulfill({
      status,
      json: {
        data,
        meta: {
          total: Array.isArray(data) ? data.length : 1,
          page: 1,
          limit: 30,
        },
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: /Sign in to workspace/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("heading", { name: "My Projects" }),
  ).toBeVisible();
  async function createProject(name: string, code: string) {
    await page.getByRole("button", { name: /Create New Project/ }).click();
    const form = page.getByRole("dialog");
    await expect(
      form.getByLabel("Project name", { exact: true }),
    ).toBeFocused();
    await form.getByRole("button", { name: "Save project" }).focus();
    await page.keyboard.press("Tab");
    await expect(
      form.getByRole("button", { name: "Close dialog" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      form.getByRole("button", { name: "Save project" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(form).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create New Project/ }),
    ).toBeFocused();
    await page.getByRole("button", { name: /Create New Project/ }).click();
    await checkAccessibility(page, "project-editor-" + code);
    await page.screenshot({
      path: `test-results/project-editor-${code}-desktop.png`,
    });
    await form.getByLabel("Project name", { exact: true }).fill(name);
    await form.getByLabel("Project code", { exact: true }).fill(code);
    await form
      .getByLabel("Description", { exact: true })
      .fill(`Delivery workspace for ${name}`);
    await form.getByRole("button", { name: "Save project" }).click();
    await expect(
      page.getByRole("heading", { name: "Good to see you, Ada." }),
    ).toBeVisible();
    return projects.find((p) => p.key === code);
  }
  const a = await createProject("Aurora platform", "AUR");
  await expect(page).toHaveURL(new RegExp(`/projects/${a.id}/dashboard$`));
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: "Create Team" }).click();
  let form = page.getByRole("dialog");
  await form.getByLabel("Team name", { exact: true }).fill("Team Alpha");
  await form.getByLabel("Team code", { exact: true }).fill("ALPHA");
  await form
    .getByLabel("Description", { exact: true })
    .fill("A custom frontend team");
  await form.getByRole("button", { name: "Save team" }).click();
  await expect(
    page.getByRole("link", { name: "Team Alpha", exact: true }),
  ).toBeVisible();
  const team = teams[0];
  await checkAccessibility(page, "team-list");
  await page
    .getByRole("link", { name: "Product backlog", exact: true })
    .click();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Title", { exact: true }).fill("Aurora requirement");
  await form
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(team.id);
  await form
    .getByText("Requirements (optional for a backlog draft)", { exact: true })
    .click();
  await form
    .getByLabel("Description", { exact: true })
    .fill("A canonical project-scoped requirement");
  await form
    .getByLabel("Acceptance criteria")
    .fill("The team and project relationship is preserved");
  await form.getByRole("button", { name: "Save ticket" }).click();
  await expect(
    page.getByRole("link", { name: "Aurora requirement", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sprints", exact: true }).click();
  await page.getByRole("button", { name: "New sprint", exact: true }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Sprint name", { exact: true }).fill("Aurora delivery");
  await form.getByLabel("Sprint goal").fill("Finish the first requirement");
  await form.getByLabel("Start date").fill("2026-11-16T09:00");
  await form.getByLabel("End date").fill("2026-11-30T17:00");
  await form.getByRole("button", { name: "Save sprint" }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Aurora delivery", exact: true }),
    })
    .click();
  await page.getByText("Plan sprint tickets", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Ticket to add", exact: true })
    .selectOption(tickets[0].id);
  await page
    .getByRole("button", { name: "Add to sprint", exact: true })
    .click();
  await expect(page.getByText("Ticket assigned to sprint.")).toBeVisible();
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm start", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Move AUR-1", exact: true })
    .selectOption("IN_PROGRESS");
  await expect(
    page
      .getByRole("region", { name: "In Progress" })
      .getByText("Aurora requirement", { exact: true }),
  ).toBeVisible();
  await checkAccessibility(page, "sprint-board");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Move AUR-1", exact: true }),
  ).toHaveValue("IN_PROGRESS");
  await page
    .getByRole("button", { name: "Complete sprint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "unfinished tickets will return",
  );
  await page
    .getByRole("button", { name: "Confirm completion", exact: true })
    .click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Product backlog", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Aurora requirement", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await page.getByRole("link", { name: "Team Alpha", exact: true }).click();
  await checkAccessibility(page, "team-detail");
  await page.getByRole("button", { name: "Edit Team", exact: true }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Team name", { exact: true }).fill("Team Nebula");
  await form.getByLabel("Team code", { exact: true }).fill("NEBULA");
  await form.getByRole("button", { name: "Save team" }).click();
  await expect(
    page.getByRole("heading", { name: "Team Nebula", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Team Nebula", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Aurora requirement", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${a.id}/tickets/`));
  await expect(page.getByText("Team Nebula", { exact: true })).toBeVisible();
  await page.goto(`/projects/${a.id}/teams/${team.id}`);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Keep existing tickets");
  await page.getByRole("button", { name: "Archive team", exact: true }).click();
  await expect(
    page.getByText(/Archived team · Existing tickets/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Aurora requirement", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Product backlog", exact: true })
    .click();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Team", exact: true })
      .getByRole("option", { name: "Team Nebula" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: /My Projects/ }).click();
  const b = await createProject("Borealis platform", "BOR");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Total tickets" })
      .locator("strong"),
  ).toHaveText("0");
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Team Nebula", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Product backlog", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Aurora requirement", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Select project" })
    .selectOption(a.id);
  await expect(page).toHaveURL(new RegExp(`/projects/${a.id}/dashboard$`));
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Total tickets" })
      .locator("strong"),
  ).toHaveText("1");
  await page.getByRole("link", { name: /My Projects/ }).click();
  let card = page.locator(".project-card").filter({
    has: page.getByRole("heading", {
      name: "Borealis platform",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  form = page.getByRole("dialog");
  await form
    .getByLabel("Project name", { exact: true })
    .fill("Borealis product");
  await form.getByLabel("Start date", { exact: true }).fill("2026-11-01");
  await form.getByLabel("Target completion date").fill("2026-12-01");
  await form.getByRole("button", { name: "Save project" }).click();
  await expect(
    page.getByRole("heading", { name: "Borealis product", exact: true }),
  ).toBeVisible();
  card = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Borealis product", exact: true }),
  });
  await card.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Borealis product", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filter projects by status" })
    .selectOption("ARCHIVED");
  await expect(
    page.getByRole("heading", { name: "Borealis product", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await page
    .getByRole("button", { name: "Reactivate project", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filter projects by status" })
    .selectOption("");
  await page.getByRole("textbox", { name: "Search projects" }).fill("Aurora");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search projects" }).fill("");
  await page.screenshot({
    path: "test-results/my-projects-desktop.png",
    fullPage: true,
  });
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/my-projects-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(`/projects/${a.id}/teams/${team.id}`);
  await expect(
    page.getByRole("heading", { name: "Team Nebula", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/team-history-mobile.png",
    fullPage: true,
  });
  expect(tickets.filter((t) => t.projectId === b.id)).toHaveLength(0);
  expect(tickets.filter((t) => t.projectId === a.id)).toHaveLength(1);
});
