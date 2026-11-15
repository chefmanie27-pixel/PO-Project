import { getFirebaseAuth } from "./firebase";
import { apiBaseUrl } from "./apiConfig";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = apiBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    import.meta.env.PROD,
  );
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new ApiError(400, "Invalid API path");
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError(401, "Sign in to continue");
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new ApiError(
      401,
      "Your session could not be refreshed. Sign in again to continue.",
    );
  }
  let response: Response;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Check your connection and try again; your draft is still here.",
    );
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    if (response.ok)
      throw new ApiError(
        502,
        "The server returned an unreadable response. Your draft is still here; please try again.",
      );
    result = {};
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 401
        ? "Your session expired. Sign out and sign in again to continue."
        : result.error?.message ||
            (response.status >= 500
              ? "The server is unavailable. Please try again."
              : "Request failed"),
    );
  return result;
}
export const send = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const label = (value: string = "") =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
