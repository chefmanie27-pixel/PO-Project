// Read-only public acceptance checks. Never signs in or changes records.
const target = process.argv[2];
if (!target)
  throw Error(
    "Usage: npm run staging:smoke -- https://your-service.onrender.com",
  );
const base = new URL(target);
if (
  base.protocol !== "https:" ||
  base.username ||
  base.password ||
  base.pathname !== "/" ||
  base.search ||
  base.hash
)
  throw Error(
    "Provide an HTTPS origin without credentials, path, query or fragment",
  );
const checks = [];
async function check(path, status, kind) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    const contentType = response.headers.get("content-type") || "";
    // Do not read or log content from private-file probes.
    const body = kind === "private" ? "" : await response.text();
    if (kind === "private") await response.body?.cancel();
    let valid = response.status === status;
    if (kind === "html")
      valid &&= contentType.includes("text/html") && body.includes('id="root"');
    if (kind === "json") valid &&= contentType.includes("application/json");
    if (path.endsWith("/ready") && valid) {
      try {
        valid &&= JSON.parse(body).data?.database === "connected";
      } catch {
        valid = false;
      }
    }
    checks.push({
      path,
      expectedStatus: status,
      actualStatus: response.status,
      passed: valid,
    });
    return { response, body };
  } catch {
    checks.push({
      path,
      expectedStatus: status,
      passed: false,
      error: "HTTPS request failed or timed out",
    });
  }
}
await check("/api/v1/health", 200, "json");
await check("/api/v1/ready", 200, "json");
const page = await check("/", 200, "html");
await check("/projects", 200, "html");
await check("/api/v1/profile", 401, "json");
await check("/.env", 404, "private");
await check("/assets/staging-smoke-missing.js", 404, "private");
const asset = page?.body.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
if (asset && !asset.startsWith("//")) await check(asset, 200, "asset");
const passed = checks.every((check) => check.passed);
console.log(
  JSON.stringify(
    {
      origin: base.origin,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      passed,
      checks,
    },
    null,
    2,
  ),
);
if (!passed) process.exitCode = 1;
