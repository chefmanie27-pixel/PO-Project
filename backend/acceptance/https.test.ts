import { it, expect, vi } from "vitest";
import {
  createServer as httpsServer,
  request as httpsRequest,
} from "node:https";
import {
  createServer as httpServer,
  request as httpRequest,
  type Server,
} from "node:http";
import type { TLSSocket } from "node:tls";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { withIsolatedDatabase } from "../verification/isolated-database.js";
import { createApp } from "../src/app.js";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("No local test port");
  return address.port;
}
async function close(server?: Server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
function get(
  url: string,
  certificate?: Buffer,
  headers: Record<string, string> = {},
) {
  return new Promise<{
    status: number;
    headers: Record<string, any>;
    body: string;
    encrypted: boolean;
    authorized: boolean;
  }>((resolve, reject) => {
    const callback = (response: any) => {
      const encrypted = !!(response.socket as TLSSocket).encrypted,
        authorized = !!(response.socket as TLSSocket).authorized;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          encrypted,
          authorized,
        }),
      );
    };
    const request = certificate
      ? httpsRequest(
          url,
          {
            ca: certificate,
            servername: "localhost",
            rejectUnauthorized: true,
            headers,
            agent: false,
          },
          callback,
        )
      : httpRequest(url, { headers, agent: false }, callback);
    request.setTimeout(10000, () =>
      request.destroy(Error("Local HTTPS acceptance request timed out")),
    );
    request.on("error", reject);
    request.end();
  });
}

it("verifies certificate-validated HTTPS, SPA fallback, API routing and proxy-header boundaries", async () => {
  mkdirSync(".cache/verification", { recursive: true });
  const directory = resolve(".cache/verification", `tls-${randomUUID()}`);
  mkdirSync(directory, { mode: 0o700 });
  const keyPath = resolve(directory, "key.pem"),
    certPath = resolve(directory, "certificate.pem");
  const executable =
    process.env.OPENSSL_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl");
  const generated = spawnSync(
    executable,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  if (generated.status !== 0)
    throw Error(
      "OpenSSL is required for the local HTTPS verification certificate",
    );
  const cert = readFileSync(certPath),
    key = readFileSync(keyPath);
  let api: Server | undefined,
    proxy: Server | undefined,
    redirect: Server | undefined;
  try {
    const report = await withIsolatedDatabase(async (db) => {
      const user = await db.user.create({
        data: {
          firebaseUid: `https-${randomUUID()}`,
          email: `${randomUUID()}@https.invalid`,
          name: "Local HTTPS verification PO",
        },
      });
      let origin = "",
        observed = { ip: "", secure: false };
      proxy = httpsServer({ key, cert }, (request, response) => {
        const address = api?.address();
        if (!address || typeof address === "string") {
          response.writeHead(503).end();
          return;
        }
        const upstream = httpRequest(
          {
            host: "127.0.0.1",
            port: address.port,
            path: request.url,
            method: request.method,
            headers: {
              ...request.headers,
              host: `127.0.0.1:${address.port}`,
              "x-forwarded-for": request.socket.remoteAddress || "127.0.0.1",
              "x-forwarded-proto": "https",
            },
          },
          (result) => {
            response.writeHead(result.statusCode || 502, result.headers);
            result.pipe(response);
          },
        );
        upstream.on("error", () =>
          response.writeHead(502).end("Upstream unavailable"),
        );
        request.pipe(upstream);
      });
      const port = await listen(proxy);
      origin = `https://127.0.0.1:${port}`;
      vi.stubEnv("WEB_ORIGIN", origin);
      vi.stubEnv("TRUST_PROXY", "loopback");
      vi.stubEnv("SERVE_FRONTEND", "true");
      vi.stubEnv("FIREBASE_PROJECT_ID", "demo-po-command-center");
      api = createApp(db, (request, _response, next) => {
        observed = { ip: request.ip || "", secure: request.secure };
        request.identity = user;
        next();
      }).listen(0, "127.0.0.1");
      await once(api, "listening");
      redirect = httpServer((request, response) => {
        response.writeHead(301, { Location: origin + (request.url || "/") });
        response.end();
      });
      const redirectPort = await listen(redirect);
      const redirectResponse = await get(
        `http://127.0.0.1:${redirectPort}/projects`,
        undefined,
        { Host: "untrusted.invalid" },
      );
      expect(redirectResponse.status).toBe(301);
      expect(redirectResponse.headers.location).toBe(origin + "/projects");
      const page = await get(origin + "/projects/verification/backlog", cert);
      expect(page.status).toBe(200);
      expect(page.encrypted).toBe(true);
      expect(page.authorized).toBe(true);
      expect(page.body).toContain('id="root"');
      expect(page.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(page.headers["cache-control"]).toBe("no-cache");
      const csp = page.headers["content-security-policy"];
      expect(csp).toContain(
        "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      );
      expect(csp).toContain(
        "frame-src 'self' https://demo-po-command-center.firebaseapp.com",
      );
      expect(csp).not.toContain("unsafe-eval");
      const asset = page.body.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
      expect(asset).toBeTruthy();
      expect((await get(origin + asset, cert)).status).toBe(200);
      expect((await get(origin + "/assets/missing.js", cert)).status).toBe(404);
      expect((await get(origin + "/.env", cert)).status).toBe(404);
      const ready = await get(origin + "/api/v1/ready", cert);
      expect(ready.status).toBe(200);
      expect(JSON.parse(ready.body).data.database).toBe("connected");
      const missing = await get(origin + "/api/v1/unknown-endpoint", cert);
      expect(missing.status).toBe(404);
      expect(missing.headers["content-type"]).toContain("application/json");
      expect(missing.body).not.toContain('id="root"');
      const profile = await get(origin + "/api/v1/profile", cert, {
        Origin: origin,
        "X-Forwarded-For": "203.0.113.99",
        "X-Forwarded-Proto": "http",
      });
      expect(profile.status).toBe(200);
      expect(JSON.parse(profile.body).data.id).toBe(user.id);
      expect(profile.headers["access-control-allow-origin"]).toBe(origin);
      expect(observed).toEqual({ ip: "127.0.0.1", secure: true });
      const wrongOrigin = await get(origin + "/api/v1/profile", cert, {
        Origin: "https://untrusted.invalid",
      });
      expect(wrongOrigin.headers["access-control-allow-origin"]).not.toBe(
        "https://untrusted.invalid",
      );
      return {
        generatedAt: new Date().toISOString(),
        certificateValidationEnabled: true,
        httpsAndRedirectVerified: true,
        spaAndAssetRoutingVerified: true,
        combinedExpressHostingVerified: true,
        firebaseCspEndpointsVerified: true,
        api404RemainsJson: true,
        privateFilesNotServed: true,
        spoofedForwardingHeadersOverwritten: true,
        explicitOriginVerified: true,
        proxy:
          "local Node HTTPS proxy exercising the supplied one-proxy contract; actual hosting proxy still requires acceptance",
      };
    });
    writeFileSync(
      ".cache/verification/https-latest.json",
      JSON.stringify(
        {
          ...report,
          isolatedSchemaDropped: true,
          existingPublicIdsPreserved: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await close(redirect);
    await close(proxy);
    await close(api);
    vi.unstubAllEnvs();
    if (
      dirname(keyPath) !== directory ||
      !directory.startsWith(resolve(".cache/verification") + sep)
    )
      throw Error("Unsafe temporary key cleanup path");
    if (existsSync(keyPath)) unlinkSync(keyPath);
  }
});
