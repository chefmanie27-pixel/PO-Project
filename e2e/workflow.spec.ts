import { test, expect, type Page } from "@playwright/test";
const projectId = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  teamId = "00000000-0000-4000-8000-000000000003",
  sprintId = "00000000-0000-4000-8000-000000000004",
  ticketId = "00000000-0000-4000-8000-000000000005";
test("two POs share a ticket, sprint, blocker, review and decision (local fixtures)", async ({
  browser,
}) => {
  const project = { id: projectId, key: "PO", name: "Fixture workspace" },
    owner = { id: ownerId, name: "Ada Owner", email: "ada@fixture.invalid" },
    secondOwner = {
      id: "00000000-0000-4000-8000-000000000006",
      name: "Bea Owner",
      email: "bea@fixture.invalid",
    },
    team = { id: teamId, name: "Platform" },
    sprint = {
      id: sprintId,
      name: "Sprint 1",
      goal: "A clear shared backlog",
      startDate: "2026-11-01T00:00:00Z",
      endDate: "2026-11-30T00:00:00Z",
    };
  let ticket: any = null;
  const records: Record<string, any[]> = {
    blockers: [],
    decisions: [],
    reviews: [
      {
        id: "review",
        title: "Clarify scope",
        category: "QUESTION",
        priority: "HIGH",
        status: "OPEN",
        ownerId,
        owner,
        notes: "Confirm the scope.",
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const install = async (page: Page) => {
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.replace("/api/v1", ""),
        body = req.postDataJSON?.() || {};
      let data: any = [];
      if (path === "/profile")
        data = {
          ...(req.headers().authorization?.includes("bea@")
            ? secondOwner
            : owner),
          notifications: true,
          memberships: [{ projectId, role: "ADMIN", project }],
        };
      else if (path.endsWith("/memberships"))
        data = [
          { id: "member", user: owner },
          { id: "second-member", user: secondOwner },
        ];
      else if (path.endsWith("/teams"))
        data = [{ ...team, tickets: ticket ? [ticket] : [] }];
      else if (path.endsWith("/sprints"))
        data = [{ ...sprint, tickets: ticket ? [ticket] : [] }];
      else if (path.endsWith("/dashboard"))
        data = {
          total: ticket ? 1 : 0,
          counts: Object.fromEntries(
            ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE"].map(
              (s) => [s, ticket?.status === s ? 1 : 0],
            ),
          ),
          blocked: records.blockers.filter((b) => b.status !== "RESOLVED")
            .length,
          recent: ticket ? [ticket] : [],
          sprints: [sprint],
          decisions: records.decisions,
          reviews: records.reviews.filter((r) => r.status === "OPEN"),
          blockers: records.blockers,
          indicators: [],
        };
      else if (
        path.endsWith("/review-indicators") ||
        path.endsWith("/audit-events")
      )
        data = [];
      else if (path.includes("/tickets")) {
        if (req.method() === "POST") {
          ticket = {
            ...body,
            id: ticketId,
            identifier: "PO-1",
            version: 1,
            owner,
            team: body.teamId ? team : null,
            sprint: body.sprintId ? sprint : null,
            blockers: [],
            comments: [],
            children: [],
            dependencies: [],
            decisions: [],
            reviews: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          data = ticket;
        } else if (req.method() === "PATCH") {
          ticket = {
            ...ticket,
            ...body,
            version: ticket.version + 1,
            team: body.teamId ? team : ticket.team,
            sprint: body.sprintId ? sprint : ticket.sprint,
          };
          data = ticket;
        } else
          data = path.endsWith("/tickets") ? (ticket ? [ticket] : []) : ticket;
      } else {
        const kind = Object.keys(records).find((k) => path.includes("/" + k));
        if (kind) {
          if (req.method() === "POST") {
            data = {
              ...body,
              id: `${kind}-${records[kind].length}`,
              version: 1,
              owner,
              maker: owner,
              ticket: ticket || null,
              tickets:
                kind === "decisions" && ticket
                  ? [{ id: "link", ticketId, ticket }]
                  : [],
              updatedAt: new Date().toISOString(),
              decisionDate: new Date().toISOString(),
            };
            records[kind].push(data);
          } else if (req.method() === "PATCH") {
            const record = records[kind].find(
              (r) => r.id === path.split("/").pop(),
            );
            Object.assign(record, body, { version: record.version + 1 });
            data = record;
          } else data = records[kind];
        }
      }
      await route.fulfill({
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
  };
  const page = await browser.newPage();
  await install(page);
  await page.goto("/login");
  await page.getByLabel("Email address").fill("ada@fixture.invalid");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: /Sign in to workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Ada." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Collaborative ticket");
  await dialog
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(teamId);
  await dialog
    .getByRole("combobox", { name: "Sprint", exact: true })
    .selectOption(sprintId);
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("A shared persisted requirement.");
  await dialog
    .getByLabel("Acceptance criteria")
    .fill("Both POs can see updates.");
  await dialog.getByRole("button", { name: "Save ticket" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Edit ticket" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("READY");
  await page.getByRole("button", { name: "Save ticket" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const other = await browser.newPage();
  await install(other);
  await other.goto("/login");
  await other.getByLabel("Email address").fill("bea@fixture.invalid");
  await other.getByLabel("Password").fill("fixture-password");
  await other.getByRole("button", { name: /Sign in to workspace/ }).click();
  await expect(
    other.getByRole("heading", { name: "Good to see you, Bea." }),
  ).toBeVisible();
  await other.goto(`/tickets/${ticketId}`);
  await expect(
    other.getByRole("heading", { name: "Collaborative ticket" }),
  ).toBeVisible();
  await expect(other.getByText("Ready", { exact: true })).toBeVisible();
  await page.goto("/blockers");
  await page.getByRole("button", { name: "New blocker" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Await product input");
  await page
    .getByRole("dialog")
    .getByLabel("Description", { exact: true })
    .fill("Need a clear direction");
  await page
    .getByRole("dialog")
    .getByLabel("Related ticket UUID (optional)")
    .fill(ticketId);
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Await product input" }),
  ).toBeVisible();
  await page.goto("/reviews");
  await page.getByRole("button", { name: "Manage →" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("RESOLVED");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("article").getByText("Resolved", { exact: true }),
  ).toBeVisible();
  await page.goto("/decisions");
  await page.getByRole("button", { name: "New decision" }).click();
  const decisionDialog = page.getByRole("dialog");
  await decisionDialog
    .getByLabel("Title", { exact: true })
    .fill("Keep one shared backlog");
  await decisionDialog
    .getByLabel("Description", { exact: true })
    .fill("All teams use the canonical ticket");
  await decisionDialog
    .getByLabel("Rationale", { exact: true })
    .fill("Prevent duplicated requirements");
  await decisionDialog
    .getByLabel("Related ticket UUIDs (comma separated)")
    .fill(ticketId);
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep one shared backlog" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Ada." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Ada." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.close();
  await other.close();
});
