import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join, delimiter } from "node:path";
const env = { ...process.env };
delete env.DEBUG; // Firebase CLI debug mode can dump the full child environment.
const cache = resolve(".cache/java-runtime");
if (!env.JAVA_HOME && existsSync(cache)) {
  const runtime = readdirSync(cache, { withFileTypes: true }).find(
    (entry) =>
      entry.isDirectory() &&
      existsSync(
        join(
          cache,
          entry.name,
          "bin",
          process.platform === "win32" ? "java.exe" : "java",
        ),
      ),
  );
  if (runtime) {
    env.JAVA_HOME = join(cache, runtime.name);
    env.PATH = join(env.JAVA_HOME, "bin") + delimiter + (env.PATH || "");
  }
}
const args = [
  "-y",
  "firebase-tools@latest",
  "emulators:exec",
  "--config",
  "firebase.emulators.json",
  "--project",
  "demo-po-command-center",
  "--only",
  "auth,firestore",
  "npm run test:auth:integration && npm run test:auth:browser",
];
const child =
  process.platform === "win32"
    ? spawn(
        process.env.ComSpec || "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          "npx " + args.slice(0, -1).join(" ") + " scripts\\firebase-tests.cmd",
        ],
        { stdio: "inherit", env },
      )
    : spawn("npx", args, { stdio: "inherit", env });
child.on("error", () => {
  console.error(
    "Could not start the local Firebase emulator suite. Check Node and Java 21.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
