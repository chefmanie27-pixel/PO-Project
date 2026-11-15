import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Capture CLI output: login:list and SDK configuration can contain sensitive data.
// Only selected non-secret status fields may be printed.
export function firebaseCommand(args) {
  const env = { ...process.env };
  delete env.DEBUG;
  if (!args.every((value) => /^[A-Za-z0-9_:./()@=-]+$/.test(value)))
    throw new Error("Unexpected Firebase CLI argument.");
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec || "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            ["npx", "-y", "firebase-tools@latest", ...args].join(" "),
          ],
          { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env },
        )
      : spawnSync("npx", ["-y", "firebase-tools@latest", ...args], {
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
          env,
        });
  const raw = result.stdout || "";
  let json;
  for (let start = 0; start < raw.length; start++) {
    if (raw[start] !== "{" || (start > 0 && raw[start - 1] !== "\n")) continue;
    let depth = 0,
      inString = false,
      escaped = false;
    for (let end = start; end < raw.length; end++) {
      const char = raw[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          const candidate = JSON.parse(raw.slice(start, end + 1));
          if (["success", "error"].includes(candidate.status)) json = candidate;
        } catch {
          /* Never echo raw CLI output. */
        }
        break;
      }
    }
    if (json) break;
  }
  return {
    ok: result.status === 0 || json?.status === "success",
    exitCode: result.status,
    json,
    needsLogin: /not logged|authentication|login|invalid_grant/i.test(
      (result.stdout || "") + (result.stderr || ""),
    ),
    output: raw,
  };
}

export function configuredProject() {
  const project = JSON.parse(
    readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"),
  ).projects?.default;
  if (typeof project !== "string" || !/^[a-z][a-z0-9-]{4,62}$/.test(project))
    throw new Error("Configure an existing project in .firebaserc first.");
  return project;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const projectId = configuredProject();
  for (const args of [
    ["login:list", "--json"],
    ["projects:list", "--json"],
    ["use"],
  ]) {
    const result = firebaseCommand(args);
    const status = {
      command: `firebase ${args[0]}`,
      ok: result.ok,
      exitCode: result.exitCode,
      configuredProject: projectId,
    };
    if (args[0] === "login:list")
      status.loggedIn = Array.isArray(result.json?.result)
        ? result.json.result.length > 0
        : result.ok && !/no authorized/i.test(result.output);
    if (args[0] === "projects:list")
      status.configuredProjectAccessible =
        result.json?.result?.some?.(
          (project) => project.projectId === projectId,
        ) ?? false;
    if (args[0] === "use")
      status.activeProjectMatches =
        result.ok && result.output.includes(projectId);
    if (!result.ok)
      status.action = result.needsLogin
        ? "Run npx -y firebase-tools@latest login in Git Bash."
        : "Check Firebase CLI/network access locally; raw output was withheld.";
    console.log(JSON.stringify(status));
  }
}
