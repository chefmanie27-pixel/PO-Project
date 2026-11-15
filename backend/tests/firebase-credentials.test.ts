import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { cert } from "firebase-admin/app";
import { join } from "node:path";
import {
  firebaseCredentials,
  reportFirebaseFailure,
} from "../src/config/firebase-credentials.js";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const base = {
  RENDER: "true",
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "admin@test-project.iam.gserviceaccount.com",
};
afterEach(() => vi.restoreAllMocks());
describe("Explicit server credential boundary", () => {
  it.each([
    { label: "actual LF", value: key },
    { label: "escaped LF", value: key.replaceAll("\n", "\\n") },
    { label: "actual CRLF", value: key.replaceAll("\n", "\r\n") },
    { label: "escaped CRLF", value: key.replaceAll("\n", "\\r\\n") },
  ])("normalizes $label without logging private key content", ({ value }) => {
    const result = firebaseCredentials({
      ...base,
      FIREBASE_PRIVATE_KEY: value,
    });
    expect(result.source).toBe("environment");
    expect("account" in result && result.account.privateKey === key).toBe(true);
    if (result.source !== "application-default")
      expect(typeof cert(result.account).getAccessToken).toBe("function");
  });
  it("rejects partial or malformed explicit credentials without falling back", () => {
    expect(() => firebaseCredentials(base)).toThrow("Set both");
    expect(() =>
      firebaseCredentials({
        ...base,
        FIREBASE_PRIVATE_KEY: "not-a-private-key",
      }),
    ).toThrow("private key is invalid");
    expect(() =>
      firebaseCredentials({
        RENDER: "true",
        FIREBASE_PROJECT_ID: "test-project",
      }),
    ).toThrow("Render requires");
    expect(
      firebaseCredentials({ FIREBASE_PROJECT_ID: "local-project" }).source,
    ).toBe("application-default");
  });
  it("loads an explicit service-account file and rejects project mismatches and unreadable files", () => {
    const directory = mkdtempSync(join(tmpdir(), "po-firebase-credentials-"));
    const file = join(directory, "synthetic-account.json");
    try {
      writeFileSync(
        file,
        JSON.stringify({
          type: "service_account",
          project_id: "test-project",
          client_email: base.FIREBASE_CLIENT_EMAIL,
          private_key: key,
        }),
        { mode: 0o600 },
      );
      const result = firebaseCredentials({
        RENDER: "true",
        FIREBASE_PROJECT_ID: "test-project",
        GOOGLE_APPLICATION_CREDENTIALS: file,
      });
      expect(result.source).toBe("service-account-file");
      expect("account" in result && result.account.privateKey === key).toBe(
        true,
      );
      expect(() =>
        firebaseCredentials({
          FIREBASE_PROJECT_ID: "other-project",
          GOOGLE_APPLICATION_CREDENTIALS: file,
        }),
      ).toThrow("does not match");
      writeFileSync(file, "private-invalid-json");
      expect(() =>
        firebaseCredentials({ GOOGLE_APPLICATION_CREDENTIALS: file }),
      ).toThrow("unreadable or invalid JSON");
    } finally {
      // Delete only the exact synthetic file/directory created by this test; no recursive deletion.
      unlinkSync(file);
      rmdirSync(directory);
    }
    expect(() =>
      firebaseCredentials({ GOOGLE_APPLICATION_CREDENTIALS: file }),
    ).toThrow("secret-file mount");
  });
  it("logs only a fixed diagnostic reason, never raw SDK errors or tokens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportFirebaseFailure(new Error("private-key-and-bearer-token-secret"));
    reportFirebaseFailure(new Error("another-secret"));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toBe(
      JSON.stringify({
        event: "firebase_admin_unavailable",
        reason: "verification-service-unavailable",
      }),
    );
  });
});
