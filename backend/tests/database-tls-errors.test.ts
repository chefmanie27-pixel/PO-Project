import { expect, it } from "vitest";
import { databaseFailure } from "../src/services/database-errors.js";
it.each([
  ["self-signed certificate private-data", "self_signed_certificate"],
  ["certificate has expired private-data", "certificate_expired"],
  ["ERR_TLS_CERT_ALTNAME_INVALID private-data", "hostname_mismatch"],
  [
    "unable to verify the first certificate private-data",
    "certificate_chain_untrusted",
  ],
  ["private-data", "unclassified"],
])("sanitizes TLS detail %s", (reason, tlsDetail) => {
  const result = databaseFailure({
    code: "P1011",
    meta: { driverAdapterError: { cause: { reason } } },
  });
  expect(result).toEqual({ code: "P1011", reason: "database_tls", tlsDetail });
  expect(JSON.stringify(result)).not.toContain("private-data");
});
