// 1. Define an ApiError class that extends Error, with: status, code, fields (optional)
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: string[];

  constructor(status: number, code: string, message: string, fields?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// 2. Create a function that turns a backend error response into an ApiError
// 3. If the response shape is unexpected -> use a fallback code like "UNKNOWN_ERROR"
export function toApiError(status: number, body: unknown): ApiError {
  const error = (body as { error?: { code?: string; message?: string; fields?: string[] } })?.error;

  if (!error || typeof error.code !== "string") {
    return new ApiError(status, "UNKNOWN_ERROR", "Unexpected error response from the server.");
  }

  return new ApiError(status, error.code, error.message ?? "", error.fields);
}

// 4. Create an ApiError for network failures (no response) -> code "NETWORK_ERROR"
export function networkError(): ApiError {
  return new ApiError(0, "NETWORK_ERROR", "Could not reach the server.");
}
