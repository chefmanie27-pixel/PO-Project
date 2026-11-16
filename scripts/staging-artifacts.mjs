import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { resolve, relative, join, sep } from "node:path";
import { createHash } from "node:crypto";

export function scanReleaseFile(path, bytes) {
  const name = path.replaceAll("\\", "/");
  if (
    /(?:^|\/)(?:\.env(?:\.|$)|application_default_credentials\.json)|firebase-adminsdk|service[-_]?account|\.(?:pem|key|p12)$/i.test(
      name,
    ) &&
    !name.endsWith(".example")
  )
    throw Error(`Private configuration is not allowed in a release: ${name}`);
  const text = bytes.toString("utf8");
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"|postgres(?:ql)?:\/\/[^/\s:'"]+:[^@\s'"]+@/.test(
      text,
    )
  )
    throw Error(
      `Potential private credential material in release file: ${name}`,
    );
  if (
    name.startsWith("frontend/dist/") &&
    /fixture-password|fixture-email|fixture\.invalid|The e2e fixture does not connect/.test(
      text,
    )
  )
    throw Error("Refusing to package an e2e fixture frontend build");
}
function filesAt(root, path = "") {
  const entry = resolve(root, path);
  const actual = realpathSync(entry),
    actualRoot = realpathSync(root);
  if (actual !== actualRoot && !actual.startsWith(actualRoot + sep))
    throw Error("Release input escaped its directory");
  if (lstatSync(entry).isSymbolicLink())
    throw Error("Release inputs cannot contain symbolic links");
  if (lstatSync(entry).isDirectory())
    return readdirSync(entry).flatMap((name) =>
      filesAt(root, join(path, name)),
    );
  return [path];
}
const inputs = [
  "render.yaml",
  "package.json",
  "package-lock.json",
  "prisma.config.ts",
  "backend/package.json",
  "backend/start.mjs",
  "frontend/package.json",
  "backend/prisma/schema.prisma",
  "backend/prisma/migrations",
  "backend/dist",
  "frontend/dist",
  "deploy",
  "docs/staging-acceptance.md",
];
export function prepareRelease(workspace, output) {
  const root = resolve(workspace),
    target = resolve(output);
  if (!target.startsWith(resolve(root, ".cache/staging") + sep))
    throw Error("Release output must be a new directory under .cache/staging");
  if (existsSync(target))
    throw Error("Release directory already exists; refusing to overwrite it");
  if (
    !existsSync(resolve(root, "frontend/dist/index.html")) ||
    !existsSync(resolve(root, "backend/dist/backend/src/server.js"))
  )
    throw Error("Build frontend and backend before preparing staging");
  const files = [];
  for (const input of inputs) {
    if (!existsSync(resolve(root, input)))
      throw Error(`Required release input is missing: ${input}`);
    for (const source of filesAt(root, input)) {
      const name = relative(root, resolve(root, source)).replaceAll("\\", "/");
      if (name.startsWith("../"))
        throw Error("Release input escaped the workspace");
      const bytes = readFileSync(resolve(root, source));
      scanReleaseFile(name, bytes);
      files.push({
        path: name,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  // All inputs are reviewed before any copying. No environment file or node_modules is included.
  mkdirSync(target, { recursive: true });
  for (const input of inputs)
    cpSync(resolve(root, input), resolve(target, input), { recursive: true });
  const manifest = {
    createdAt: new Date().toISOString(),
    deploymentPerformed: false,
    environmentValidated: false,
    files,
  };
  writeFileSync(
    resolve(target, "release-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}
export function checkRelease(folder) {
  const target = resolve(folder),
    manifest = JSON.parse(
      readFileSync(resolve(target, "release-manifest.json"), "utf8"),
    );
  if (!Array.isArray(manifest.files) || !manifest.files.length)
    throw Error("Invalid release manifest");
  const allowed = new Set([
    "release-manifest.json",
    ...manifest.files.map((file) => file.path),
  ]);
  for (const file of filesAt(target))
    if (!allowed.has(file.replaceAll("\\", "/")))
      throw Error("Unlisted file found in release");
  for (const file of manifest.files) {
    const path = resolve(target, file.path);
    if (!path.startsWith(target + sep))
      throw Error("Invalid path in release manifest");
    const bytes = readFileSync(path);
    scanReleaseFile(file.path, bytes);
    if (
      bytes.length !== file.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw Error(`Release integrity mismatch: ${file.path}`);
  }
  return {
    integrityVerified: true,
    fileCount: manifest.files.length,
    deploymentPerformed: false,
    environmentValidated: false,
  };
}
