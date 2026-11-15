import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prepareRelease, checkRelease } from "./staging-artifacts.mjs";
const output = resolve(
  ".cache/staging",
  `release-${Date.now()}-${randomUUID().slice(0, 8)}`,
);
const manifest = prepareRelease(process.cwd(), output);
const result = checkRelease(output);
console.log(
  JSON.stringify(
    {
      ...result,
      output,
      totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
      next: "Configure an isolated staging environment and obtain deployment approval; no deployment was performed.",
    },
    null,
    2,
  ),
);
