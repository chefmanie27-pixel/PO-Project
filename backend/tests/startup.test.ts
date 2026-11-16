import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startBackend, repositoryRoot } from "../start.mjs";

const env = {
  DATABASE_URL: "postgresql://localhost:5432/startup_fixture",
  npm_execpath: "/fixture/npm-cli.js",
};
describe("migration-gated backend startup", () => {
  it("runs the root migration script successfully before loading the HTTP server", async () => {
    const order: string[] = [];
    const run = vi.fn(() => {
      order.push("migrate");
      return { status: 0 };
    });
    const loadServer = vi.fn(async () => {
      order.push("listen");
    });
    await startBackend({ env, run, loadServer, log: vi.fn() });
    expect(order).toEqual(["migrate", "listen"]);
    expect(repositoryRoot).toBe(
      fileURLToPath(new URL("../../", import.meta.url)),
    );
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      [env.npm_execpath, "run", "db:deploy", "--workspaces=false"],
      { cwd: repositoryRoot, env, stdio: "ignore" },
    );
  });
  it.each([
    { status: 1 },
    { status: null, signal: "SIGTERM" },
    { status: null, error: new Error("secret connection details") },
  ])("does not load the server when migrations fail: %s", async (result) => {
    const loadServer = vi.fn(),
      log = vi.fn();
    await expect(
      startBackend({ env, run: () => result, loadServer, log }),
    ).rejects.toThrow("HTTP server was not started");
    expect(loadServer).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "secret connection details",
    );
  });
  it("does not leak thrown subprocess errors", async () => {
    const loadServer = vi.fn(),
      log = vi.fn();
    await expect(
      startBackend({
        env,
        run: () => {
          throw new Error("secret");
        },
        loadServer,
        log,
      }),
    ).rejects.toThrow("Database migration could not start");
    expect(loadServer).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
  it.each([undefined, "", "secret-not-a-url", "https://example.invalid/db"])(
    "rejects absent or invalid database configuration without running anything",
    async (url) => {
      const run = vi.fn(),
        loadServer = vi.fn();
      await expect(
        startBackend({
          env: { ...env, DATABASE_URL: url },
          run,
          loadServer,
          log: vi.fn(),
        }),
      ).rejects.toThrow("DATABASE_URL");
      expect(run).not.toHaveBeenCalled();
      expect(loadServer).not.toHaveBeenCalled();
    },
  );
  it("allows subsequent successful no-op migrate deploy runs", async () => {
    const run = vi.fn(() => ({ status: 0 })),
      loadServer = vi.fn();
    await startBackend({ env, run, loadServer, log: vi.fn() });
    await startBackend({ env, run, loadServer, log: vi.fn() });
    expect(run).toHaveBeenCalledTimes(2);
    expect(loadServer).toHaveBeenCalledTimes(2);
  });
  it("keeps the deployed entry point and root migration command wired correctly", () => {
    const backend = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const root = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(backend.scripts.start).toBe("node start.mjs");
    expect(root.scripts["db:deploy"]).toBe(
      "prisma migrate deploy --schema backend/prisma/schema.prisma",
    );
  });
});
