export function apiBaseUrl(
  value: string | undefined,
  production: boolean,
): string {
  if (!value?.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error("VITE_API_BASE_URL must be an HTTPS API origin");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && local && !production)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "VITE_API_BASE_URL must be an HTTPS origin without credentials, path, query or fragment",
    );
  return url.origin;
}
