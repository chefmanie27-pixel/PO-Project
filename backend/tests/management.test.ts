import { describe, it, expect } from "vitest";
import {
  projectCreateSchema,
  projectUpdateSchema,
  teamCreateSchema,
  teamUpdateSchema,
} from "../../shared/management.js";
import { hasCapability } from "../../shared/permissions.js";
describe("Project/team contracts", () => {
  it("allows custom team names and normalizes codes", () => {
    expect(
      teamCreateSchema.parse({
        name: "Any custom delivery squad",
        code: "my-team",
        responsiblePoId: "00000000-0000-4000-8000-000000000001",
      }).code,
    ).toBe("MY-TEAM");
  });
  it("rejects malformed dates and codes", () => {
    expect(
      projectCreateSchema.safeParse({ name: "Product", code: "bad code" })
        .success,
    ).toBe(false);
    expect(
      projectCreateSchema.safeParse({
        name: "Product",
        startDate: "2026-12-01",
        targetDate: "2026-11-01",
      }).success,
    ).toBe(false);
  });
  it("does not fill creation defaults into partial updates", () => {
    expect(teamUpdateSchema.parse({ version: 2, archived: true })).toEqual({
      version: 2,
      archived: true,
    });
    expect(projectUpdateSchema.parse({ version: 3, name: "Updated" })).toEqual({
      version: 3,
      name: "Updated",
    });
  });
  it("requires versions on edits and PO ownership on new teams", () => {
    expect(teamUpdateSchema.safeParse({ name: "No version" }).success).toBe(
      false,
    );
    expect(teamCreateSchema.safeParse({ name: "No owner" }).success).toBe(
      false,
    );
  });
  it("lets approved POs manage projects and teams without granting memberships", () => {
    for (const capability of [
      "project:create",
      "project:edit",
      "teams:manage",
    ] as const)
      expect(hasCapability("PRODUCT_OWNER", capability)).toBe(true);
    expect(hasCapability("PRODUCT_OWNER", "project:manage")).toBe(false);
  });
});
