import { test, expect } from "@playwright/test";
test("real Auth emulator registration, persistent session, logout and approval boundary", async ({
  page,
}) => {
  if (
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-po-command-center"
  )
    throw new Error(
      "Run through test:firebase:emulators; never against a live project.",
    );
  const email = `po-${crypto.randomUUID()}@example.invalid`,
    password = "emulator-browser-password";
  const projectId = "00000000-0000-4000-8000-000000000001";
  let approved = true;
  await page.route("**/api/v1/**", async (route) => {
    // Only application data is a fixture. Firebase sign-up/sign-in uses the real local SDK/emulator.
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/profile")) {
      if (!approved)
        return route.fulfill({
          status: 403,
          json: {
            error: {
              message:
                "Your account needs an invitation from a project administrator",
            },
          },
        });
      return route.fulfill({
        json: {
          data: {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Emulator PO",
            email,
            notifications: true,
            memberships: [
              {
                projectId,
                role: "PRODUCT_OWNER",
                project: {
                  id: projectId,
                  name: "Local emulator fixture",
                  key: "LOCAL",
                },
              },
            ],
          },
        },
      });
    }
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          data: {
            total: 0,
            counts: {
              BACKLOG: 0,
              READY: 0,
              IN_PROGRESS: 0,
              IN_REVIEW: 0,
              DONE: 0,
            },
            blocked: 0,
            sprints: [],
            recent: [],
            reviews: [],
            indicators: [],
            blockers: [],
            decisions: [],
          },
        },
      });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/register");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: /Create account/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Emulator." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Emulator." }),
  ).toBeVisible();
  await page.locator(".profile-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in to workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Emulator." }),
  ).toBeVisible();
  await page.locator(".profile-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  approved = false;
  await page.goto("/register");
  await page
    .getByLabel("Email address")
    .fill(`unapproved-${crypto.randomUUID()}@example.invalid`);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: /Create account/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("needs an invitation");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Emulator." }),
  ).not.toBeVisible();
});
