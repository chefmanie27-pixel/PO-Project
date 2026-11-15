import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "../src/services/api";
const { getIdToken } = vi.hoisted(() => ({
  getIdToken: vi.fn(async () => "fixture-token"),
}));
vi.mock("../src/services/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken } }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  getIdToken.mockReset();
  getIdToken.mockResolvedValue("fixture-token");
});
describe("Recoverable API failures", () => {
  it("rejects an unreadable success response without claiming a save", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Unexpected proxy response</html>", {
            status: 200,
          }),
        ),
    );
    await expect(api("/projects")).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("unreadable response"),
    });
  });
  it("explains an offline failure while retaining the caller's draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api("/projects")).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("your draft is still here"),
    });
  });
  it("explains session expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "Invalid token" } }),
            { status: 401 },
          ),
        ),
    );
    await expect(api("/projects")).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("session expired"),
    });
  });
  it("handles an unavailable server returning HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Unavailable</html>", { status: 503 }),
        ),
    );
    await expect(api("/projects")).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("server is unavailable"),
    });
  });
});
