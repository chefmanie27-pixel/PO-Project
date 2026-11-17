// Never log driver messages, SQL, metadata, connection strings or identities.
const reasons: Record<string, string> = {
  P1000: "database_authentication",
  P1001: "database_unreachable",
  P1002: "database_timeout",
  P1003: "database_missing",
  P1008: "database_timeout",
  P1010: "database_permission",
  P1011: "database_tls",
  P1017: "database_connection_closed",
  P2021: "database_table_missing",
  P2022: "database_column_missing",
  P2024: "database_pool_timeout",
  P2037: "database_connection_limit",
  "42P01": "database_table_missing",
  "42703": "database_column_missing",
  "42501": "database_permission",
  "28P01": "database_authentication",
  "3D000": "database_missing",
  "53300": "database_connection_limit",
  ECONNREFUSED: "database_unreachable",
  ENOTFOUND: "database_unreachable",
  ETIMEDOUT: "database_timeout",
  ECONNRESET: "database_connection_closed",
};
export function databaseFailure(error: unknown) {
  const e = error as {
    code?: unknown;
    errorCode?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown } };
    };
    cause?: { code?: unknown; originalCode?: unknown };
  } | null;
  const candidates = [
    e?.code,
    e?.errorCode,
    e?.meta?.code,
    e?.meta?.driverAdapterError?.cause?.originalCode,
    e?.cause?.code,
    e?.cause?.originalCode,
  ];
  const code =
    candidates.find(
      (value): value is string =>
        typeof value === "string" && Object.hasOwn(reasons, value),
    ) || "UNKNOWN";
  const result = { code, reason: reasons[code] || "database_request_failed" };
  if (code !== "P1011") return result;
  // Inspect vendor detail privately; emit only fixed classifications.
  let tlsDetail: string | undefined;
  const visit = (value: unknown, depth = 0) => {
    if (!value || depth > 6) return;
    if (typeof value === "string") {
      if (/self.signed|SELF_SIGNED_CERT/i.test(value))
        tlsDetail = "self_signed_certificate";
      else if (
        !tlsDetail &&
        /CERT_HAS_EXPIRED|certificate has expired/i.test(value)
      )
        tlsDetail = "certificate_expired";
      else if (
        !tlsDetail &&
        /ERR_TLS_CERT_ALTNAME_INVALID|hostname.*match/i.test(value)
      )
        tlsDetail = "hostname_mismatch";
      else if (
        !tlsDetail &&
        /UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|unable to verify|unable to get.*issuer/i.test(
          value,
        )
      )
        tlsDetail = "certificate_chain_untrusted";
      return;
    }
    if (typeof value === "object") {
      for (const key of [
        "code",
        "reason",
        "message",
        "meta",
        "cause",
        "driverAdapterError",
        "originalCode",
        "originalMessage",
        "error",
      ])
        visit((value as Record<string, unknown>)[key], depth + 1);
    }
  };
  visit(error);
  return { ...result, tlsDetail: tlsDetail || "unclassified" };
}
export function reportDatabaseFailure(
  operation: "account_lookup" | "profile_read" | "readiness" | "request",
  error: unknown,
) {
  console.error(
    JSON.stringify({
      event: "database_operation_failed",
      operation,
      ...databaseFailure(error),
    }),
  );
}
