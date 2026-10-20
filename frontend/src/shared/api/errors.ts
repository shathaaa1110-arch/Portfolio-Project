// 1. Define an ApiError class that extends Error, with: status, code, fields (optional)
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: string[];
  retryAfterSeconds?: number; // Sent with 429 errors: seconds to wait before trying again

  constructor(status: number, code: string, message: string, fields?: string[], retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// 2. Create a function that turns a backend error response into an ApiError
// 3. If the response shape is unexpected -> use a fallback code like "UNKNOWN_ERROR"
export function toApiError(status: number, body: unknown): ApiError {
  const error = (body as {
    error?: { code?: string; message?: string; fields?: string[]; retry_after_seconds?: number };
  })?.error;

  if (!error || typeof error.code !== "string") {
    return new ApiError(status, "UNKNOWN_ERROR", "Unexpected error response from the server.");
  }

  return new ApiError(status, error.code, error.message ?? "", error.fields, error.retry_after_seconds);
}

// 4. Create an ApiError for network failures (no response) -> code "NETWORK_ERROR"
export function networkError(): ApiError {
  return new ApiError(0, "NETWORK_ERROR", "Could not reach the server.");
}

// 5. Create an ApiError for a success response whose body is not valid JSON
export function invalidResponseError(status: number): ApiError {
  return new ApiError(status, "INVALID_RESPONSE", "The server sent an invalid response.");
}