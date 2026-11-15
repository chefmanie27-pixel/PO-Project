import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export async function checkAccessibility(page: Page, name: string) {
  await expect(page.locator("h1")).toHaveCount(1);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  const report = JSON.stringify(
    {
      name,
      violations,
      passedRules: result.passes.length,
      incompleteRules: result.incomplete.map((r) => r.id),
      manualReview: result.incomplete.map((r) => ({
        id: r.id,
        nodes: r.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    },
    null,
    2,
  );
  const output = test.info().outputPath(`accessibility-${name}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, report);
  await test.info().attach(`accessibility-${name}`, {
    path: output,
    contentType: "application/json",
  });
  expect(violations, `WCAG accessibility violations in ${name}`).toEqual([]);
}
