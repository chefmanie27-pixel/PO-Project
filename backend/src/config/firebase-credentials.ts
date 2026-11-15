import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ServiceAccount } from "firebase-admin/app";
type Env = Record<string, string | undefined>;
export class FirebaseConfigurationError extends Error {
  constructor(
    public readonly reason:
      | "missing-credentials"
      | "partial-credentials"
      | "invalid-credentials"
      | "invalid-credential-file"
      | "credential-project-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "FirebaseConfigurationError";
  }
}
function account(
  projectId: string,
  clientEmail: unknown,
  key: unknown,
): ServiceAccount {
  if (
    typeof clientEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) ||
    typeof key !== "string"
  )
    throw new FirebaseConfigurationError(
      "invalid-credentials",
      "Firebase service account email or private key is invalid.",
    );
  const privateKey =
    key
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .trim() + "\n";
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== "rsa") throw Error();
  } catch {
    throw new FirebaseConfigurationError(
      "invalid-credentials",
      "Firebase service account private key is invalid. Check multiline formatting.",
    );
  }
  return { projectId, clientEmail, privateKey };
}
export function firebaseCredentials(
  env: Env = process.env,
):
  | { source: "environment" | "service-account-file"; account: ServiceAccount }
  | { source: "application-default" } {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() || "";
  const email = env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = env.FIREBASE_PRIVATE_KEY?.trim();
  if (email || key) {
    if (!email || !key)
      throw new FirebaseConfigurationError(
        "partial-credentials",
        "Set both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or remove both to use a credential file.",
      );
    return { source: "environment", account: account(projectId, email, key) };
  }
  const path = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (path) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new FirebaseConfigurationError(
        "invalid-credential-file",
        "Firebase credential file is unreadable or invalid JSON. Check the server secret-file mount.",
      );
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("type" in value) ||
      value.type !== "service_account"
    )
      throw new FirebaseConfigurationError(
        "invalid-credential-file",
        "Firebase credential file must contain a service account.",
      );
    if (!("project_id" in value) || value.project_id !== projectId)
      throw new FirebaseConfigurationError(
        "credential-project-mismatch",
        "Firebase credential file project does not match FIREBASE_PROJECT_ID.",
      );
    return {
      source: "service-account-file",
      account: account(
        projectId,
        "client_email" in value ? value.client_email : undefined,
        "private_key" in value ? value.private_key : undefined,
      ),
    };
  }
  if (env.RENDER === "true")
    throw new FirebaseConfigurationError(
      "missing-credentials",
      "Render requires FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or a GOOGLE_APPLICATION_CREDENTIALS secret file.",
    );
  return { source: "application-default" };
}
const reported = new Set<string>();
export function reportFirebaseFailure(error: unknown) {
  const reason =
    error instanceof FirebaseConfigurationError
      ? error.reason
      : "verification-service-unavailable";
  if (reported.has(reason)) return;
  reported.add(reason);
  console.warn(JSON.stringify({ event: "firebase_admin_unavailable", reason }));
}
