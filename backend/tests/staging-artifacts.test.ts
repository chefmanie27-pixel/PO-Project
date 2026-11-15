import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";
import {
  scanReleaseFile,
  checkRelease,
} from "../../scripts/staging-artifacts.mjs";
import { createHash } from "node:crypto";
describe("Reviewable staging artifacts", () => {
  it("rejects private credentials and fixture-mode frontends", () => {
    expect(() =>
      scanReleaseFile(".env", Buffer.from("not for release")),
    ).toThrow("Private configuration");
    expect(() =>
      scanReleaseFile(
        "frontend/dist/assets/app.js",
        Buffer.from("fixture-password"),
      ),
    ).toThrow("fixture");
    expect(() =>
      scanReleaseFile(
        "backend/dist/app.js",
        Buffer.from("-----BEGIN PRIVATE KEY-----"),
      ),
    ).toThrow("credential");
    expect(() =>
      scanReleaseFile("config.json", Buffer.from('{"type":"service_account"}')),
    ).toThrow("credential");
  });
  it("accepts empty configuration templates and normal compiled code", () => {
    expect(() =>
      scanReleaseFile(
        "deploy/staging.env.example",
        Buffer.from("DATABASE_URL=\n"),
      ),
    ).not.toThrow();
    expect(() =>
      scanReleaseFile(
        "frontend/dist/assets/app.js",
        Buffer.from("console.log('PO Command Center')"),
      ),
    ).not.toThrow();
  });
  it("detects modified or unlisted files in a release", () => {
    const temporary = mkdtempSync(join(tmpdir(), "po-staging-test-"));
    try {
      const file = "frontend/dist/index.html",
        content = Buffer.from("<html>Release</html>");
      mkdirSync(join(temporary, "frontend/dist"), { recursive: true });
      writeFileSync(join(temporary, file), content);
      writeFileSync(
        join(temporary, "release-manifest.json"),
        JSON.stringify({
          files: [
            {
              path: file,
              bytes: content.length,
              sha256: createHash("sha256").update(content).digest("hex"),
            },
          ],
        }),
      );
      expect(checkRelease(temporary).integrityVerified).toBe(true);
      writeFileSync(join(temporary, file), "Changed");
      expect(() => checkRelease(temporary)).toThrow("integrity mismatch");
      writeFileSync(join(temporary, file), content);
      writeFileSync(join(temporary, "unexpected.txt"), "extra");
      expect(() => checkRelease(temporary)).toThrow("Unlisted file");
    } finally {
      // Only the temporary directory created by this test is eligible for deletion.
      if (
        dirname(resolve(temporary)) !== resolve(tmpdir()) ||
        !basename(temporary).startsWith("po-staging-test-")
      )
        throw Error("Unsafe temporary test cleanup target");
      rmSync(temporary, { recursive: true });
    }
  });
});
