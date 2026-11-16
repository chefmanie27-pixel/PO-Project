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
  return { code, reason: reasons[code] || "database_request_failed" };
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
