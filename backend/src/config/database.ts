import type { PoolConfig } from "pg";

type Env = Record<string, string | undefined>;

// Render internal endpoints support TLS with self-signed certificates.
// Never apply that trust policy to public endpoints or arbitrary private hosts.
export function databaseConfig(env: Env = process.env): {
  pool: PoolConfig;
  target: "local" | "render_internal" | "external";
  tls: "disabled" | "required_internal" | "verified";
} {
  let url: URL;
  try {
    if (!env.DATABASE_URL && env.NODE_ENV === "production") throw new Error();
    url = new URL(
      env.DATABASE_URL || "postgresql://localhost:5432/po_command_center",
    );
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (["host", "hostaddr"].some((key) => url.searchParams.has(key)))
    throw new Error("Database host overrides in URL options are unsupported");
  const host = url.hostname.toLowerCase();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const internal = env.RENDER === "true" && /^dpg-[a-z0-9]+-[a-z]$/.test(host);
  const target = local ? "local" : internal ? "render_internal" : "external";
  const mode = url.searchParams.get("sslmode");
  const ssl = url.searchParams.get("ssl");
  if (
    (mode &&
      ![
        "disable",
        "require",
        "verify-full",
        "verify-ca",
        "prefer",
        "no-verify",
      ].includes(mode)) ||
    (ssl && !["true", "1", "false", "0"].includes(ssl))
  )
    throw new Error("Unsupported database TLS URL option");
  if (
    ["sslcert", "sslkey", "sslrootcert"].some((key) =>
      url.searchParams.has(key),
    )
  )
    throw new Error(
      "Database certificate-file URL options are unsupported; configure trusted CAs with NODE_EXTRA_CA_CERTS",
    );
  const disabled = mode === "disable" || ssl === "false" || ssl === "0";
  if (
    target === "external" &&
    (disabled || mode === "no-verify" || mode === "prefer")
  )
    throw new Error(
      "External PostgreSQL connections require certificate-verified TLS",
    );
  const tls =
    disabled || (local && !mode && !ssl)
      ? "disabled"
      : internal && mode !== "verify-full" && mode !== "verify-ca"
        ? "required_internal"
        : "verified";
  // pg URL SSL options override PoolConfig.ssl. Remove them after resolving policy
  // so require/libpq compatibility cannot silently disable external verification.
  for (const key of ["sslmode", "ssl", "uselibpqcompat"])
    url.searchParams.delete(key);
  return {
    target,
    tls,
    pool: {
      connectionString: url.toString(),
      ssl:
        tls === "disabled"
          ? false
          : { rejectUnauthorized: tls === "verified", minVersion: "TLSv1.2" },
    },
  };
}
