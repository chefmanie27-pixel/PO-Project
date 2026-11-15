import { describe, it, expect } from "vitest";
import { readRuntimeConfig } from "../src/config/runtime.js";
const staging = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  WEB_ORIGIN: "https://staging.example.com",
  DATABASE_URL:
    "postgresql://stage_user:synthetic-test-password@db.example.invalid/staging",
  FIREBASE_PROJECT_ID: "authorized-project",
  TRUST_PROXY: "loopback",
};
describe("Deployment runtime boundaries", () => {
  it("supports Render's explicit public listener and assigned HTTPS origin", () => {
    expect(
      readRuntimeConfig({
        ...staging,
        WEB_ORIGIN: undefined,
        RENDER: "true",
        RENDER_EXTERNAL_URL: "https://po-stage.onrender.com",
        PORT: "10000",
      }),
    ).toMatchObject({
      host: "0.0.0.0",
      port: 10000,
      serveFrontend: true,
      webOrigin: "https://po-stage.onrender.com",
    });
    expect(() => readRuntimeConfig({ HOST: "invalid" })).toThrow("HOST");
  });
  it("preserves an explicit API-only Render deployment", () => {
    expect(
      readRuntimeConfig({ ...staging, RENDER: "true", SERVE_FRONTEND: "false" })
        .serveFrontend,
    ).toBe(false);
    expect(readRuntimeConfig({}).serveFrontend).toBe(false);
  });
  it("keeps development loopback defaults", () => {
    expect(readRuntimeConfig({})).toMatchObject({
      host: "127.0.0.1",
      port: 4000,
      webOrigin: "http://localhost:5173",
      trustProxy: false,
    });
  });
  it("accepts explicit isolated HTTPS staging configuration", () => {
    expect(readRuntimeConfig(staging)).toMatchObject({
      webOrigin: staging.WEB_ORIGIN,
      trustProxy: "loopback",
    });
  });
  it("refuses production without an explicit database", () => {
    expect(() =>
      readRuntimeConfig({ ...staging, DATABASE_URL: undefined }),
    ).toThrow("DATABASE_URL");
  });
  it("refuses plaintext production origins and emulator settings", () => {
    expect(() =>
      readRuntimeConfig({
        ...staging,
        WEB_ORIGIN: "http://staging.example.com",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      readRuntimeConfig({
        ...staging,
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      }),
    ).toThrow("emulator");
  });
  it("refuses the existing local database as a staging target", () => {
    expect(() =>
      readRuntimeConfig({
        ...staging,
        DATABASE_URL: "postgresql://localhost:5432/po_command_center",
      }),
    ).toThrow("separate database");
  });
  it("does not expose malformed connection values in configuration errors", () => {
    const privateValue = "private connection credential";
    try {
      readRuntimeConfig({ ...staging, DATABASE_URL: privateValue });
      throw Error("Expected rejection");
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL is invalid");
      expect(String(error)).not.toContain(privateValue);
    }
  });
  it("refuses blanket proxy trust and invalid ports", () => {
    expect(() =>
      readRuntimeConfig({ ...staging, TRUST_PROXY: "true" }),
    ).toThrow("TRUST_PROXY");
    expect(() => readRuntimeConfig({ ...staging, PORT: "70000" })).toThrow(
      "PORT",
    );
  });
});
