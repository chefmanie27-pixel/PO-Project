import { describe, it, expect } from "vitest";
import { apiBaseUrl } from "../src/services/apiConfig";
describe("API destination boundary", () => {
  it("supports same-origin and separate HTTPS API hosting", () => {
    expect(apiBaseUrl(undefined, true)).toBe("");
    expect(apiBaseUrl("https://po-project-rogv.onrender.com/", true)).toBe(
      "https://po-project-rogv.onrender.com",
    );
    expect(apiBaseUrl("http://localhost:4000", false)).toBe(
      "http://localhost:4000",
    );
  });
  it.each([
    "http://localhost:4000",
    "https://user:password@api.invalid",
    "https://api.invalid/api/v1",
    "https://api.invalid?secret=value",
    "//api.invalid",
    "javascript:alert(1)",
  ])("rejects unsafe production configuration %s", (value) => {
    expect(() => apiBaseUrl(value, true)).toThrow("VITE_API_BASE_URL");
  });
});
