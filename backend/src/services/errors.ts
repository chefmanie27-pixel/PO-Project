export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireValue<T>(
  value: T | null | undefined,
  message = "Resource not found",
): T {
  if (!value) throw new ApiError(404, message);
  return value;
}
