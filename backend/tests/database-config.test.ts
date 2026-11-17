import { describe, expect, it } from "vitest";
import pg from "pg";
import { databaseConfig } from "../src/config/database.js";

const internal = "postgresql://fixture:fixture@dpg-fixture123-a/fixture";
const external =
  "postgresql://fixture:fixture@dpg-fixture123-a.oregon-postgres.render.com/fixture";
// Check pg's effective config too: URL parsing takes precedence over PoolConfig.ssl.
function effective(env: Record<string, string>) {
  const config = databaseConfig(env);
  const client = new pg.Client(config.pool);
  return { config, ssl: (client as any).connectionParameters.ssl };
}
describe("database TLS configuration", () => {
  it("supports ordinary local PostgreSQL without TLS", () => {
    expect(effective({}).ssl).toBe(false);
  });
  it("requires TLS for Render internal connections using Render's self-signed policy", () => {
    const { config, ssl } = effective({
      DATABASE_URL: internal,
      RENDER: "true",
    });
    expect(config.target).toBe("render_internal");
    expect(ssl).toEqual({ rejectUnauthorized: false, minVersion: "TLSv1.2" });
  });
  it.each([
    "",
    "?sslmode=require",
    "?sslmode=require&uselibpqcompat=true",
    "?ssl=true",
    "?sslmode=verify-full",
  ])("verifies external certificates: %s", (suffix) => {
    const { config, ssl } = effective({
      DATABASE_URL: external + suffix,
      RENDER: "true",
    });
    expect(config.target).toBe("external");
    expect(ssl).toMatchObject({ rejectUnauthorized: true });
  });
  it.each([
    "?sslmode=disable",
    "?ssl=false",
    "?ssl=0",
    "?sslmode=no-verify",
    "?sslmode=prefer",
  ])("rejects external TLS downgrade: %s", (suffix) => {
    expect(() => databaseConfig({ DATABASE_URL: external + suffix })).toThrow(
      "certificate-verified TLS",
    );
  });
  it.each(["dpg-fixture123-a.evil.invalid", "private.example", "10.0.0.1"])(
    "does not trust arbitrary hosts as Render internal: %s",
    (host) => {
      expect(
        effective({
          RENDER: "true",
          DATABASE_URL: "postgresql://" + host + "/fixture",
        }).ssl,
      ).toMatchObject({ rejectUnauthorized: true });
    },
  );
  it("does not use Render internal trust outside Render", () => {
    expect(effective({ DATABASE_URL: internal }).ssl).toMatchObject({
      rejectUnauthorized: true,
    });
  });
  it("honors explicit internal plaintext and explicit verified TLS", () => {
    expect(
      effective({ RENDER: "true", DATABASE_URL: internal + "?sslmode=disable" })
        .ssl,
    ).toBe(false);
    expect(
      effective({
        RENDER: "true",
        DATABASE_URL: internal + "?sslmode=verify-full",
      }).ssl,
    ).toMatchObject({ rejectUnauthorized: true });
  });
  it("supports verified local TLS when explicitly requested", () => {
    expect(
      effective({
        DATABASE_URL: "postgresql://localhost/fixture?sslmode=verify-full",
      }).ssl,
    ).toMatchObject({ rejectUnauthorized: true });
  });
  it("rejects malformed configuration without echoing input", () => {
    for (const DATABASE_URL of [
      "secret-invalid",
      "https://secret.invalid",
      external + "?sslmode=secret",
      external + "?sslrootcert=secret",
    ]) {
      try {
        databaseConfig({ DATABASE_URL });
        throw Error("expected rejection");
      } catch (error) {
        expect(String(error)).not.toContain("secret");
      }
    }
    expect(() => databaseConfig({ NODE_ENV: "production" })).toThrow(
      "valid PostgreSQL URL",
    );
  });
});

it("rejects query host overrides before choosing internal trust", () => {
  expect(() =>
    databaseConfig({
      RENDER: "true",
      DATABASE_URL: internal + "?host=public.example",
    }),
  ).toThrow("host overrides");
});
