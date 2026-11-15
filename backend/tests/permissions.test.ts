import { describe, it, expect } from "vitest";
import { hasCapability, projectRoles } from "../../shared/permissions.js";
describe("Explicit project capabilities", () => {
  it("allows delivery work but forbids Product Owners from granting roles", () => {
    expect(hasCapability("PRODUCT_OWNER", "project:read")).toBe(true);
    expect(hasCapability("PRODUCT_OWNER", "delivery:write")).toBe(true);
    expect(hasCapability("PRODUCT_OWNER", "project:manage")).toBe(false);
    expect(hasCapability("ADMIN", "project:manage")).toBe(true);
  });
  it("denies unknown, inherited and future roles until deliberately granted", () => {
    for (const role of [
      ...projectRoles.filter((r) => !["ADMIN", "PRODUCT_OWNER"].includes(r)),
      "toString",
      "__proto__",
      "admin",
      "",
    ])
      expect(hasCapability(role, "project:read")).toBe(false);
  });
});
