import { it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
afterEach(() => vi.unstubAllEnvs());
it("allows authenticated preflight only for the configured frontend origin", async () => {
  const origin = "https://po-frontend.example.invalid";
  vi.stubEnv("WEB_ORIGIN", origin);
  const app = createApp();
  const allowed = await request(app)
    .options("/api/v1/projects")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "authorization,content-type");
  expect(allowed.status).toBe(204);
  expect(allowed.headers["access-control-allow-origin"]).toBe(origin);
  expect(
    allowed.headers["access-control-allow-headers"].toLowerCase(),
  ).toContain("authorization");
  const rejected = await request(app)
    .options("/api/v1/projects")
    .set("Origin", "https://untrusted.invalid")
    .set("Access-Control-Request-Method", "POST");
  expect(rejected.headers["access-control-allow-origin"]).not.toBe(
    "https://untrusted.invalid",
  );
  expect(rejected.headers["access-control-allow-origin"]).not.toBe("*");
  expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
});
