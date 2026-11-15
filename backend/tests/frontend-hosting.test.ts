import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { registerFrontend } from "../src/routes/frontend.js";
import { resolve } from "node:path";
describe("Combined frontend hosting", () => {
  it("serves built deep links and keeps API and private paths out of SPA fallback", async () => {
    const app = express();
    registerFrontend(app, resolve("backend/tests/fixtures/hosting"));
    app.use((_req, res) => res.status(404).json({ error: "missing" }));
    const page = await request(app)
      .get("/projects/example/tickets")
      .expect(200);
    expect(page.type).toBe("text/html");
    expect(page.headers["cache-control"]).toBe("no-cache");
    await request(app)
      .get("/api/v1/missing")
      .expect(404)
      .expect("Content-Type", /json/);
    await request(app).get("/.env").expect(404);
    await request(app).get("/assets/missing.js").expect(404);
    await request(app)
      .get("/assets/app.js")
      .expect(200)
      .expect("Content-Type", /javascript/);
  });
});
