import { API_BASE_URL, USE_MOCK } from "./config";
import { invalidResponseError, networkError, toApiError } from "./errors";
import { mockTransport } from "./mockTransport";

const TIMEOUT_MS = 15000; // 15 seconds before the request is cancelled

type Method = "GET" | "POST" | "PUT" | "DELETE";

type RequestOptions = {
  body?: unknown;
  token?: string; // Passed in by the caller; client.ts does not store tokens
};

export async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  if (USE_MOCK) {
    return mockTransport<T>(method, path, options.body);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    // Read the whole body while the timeout is still active
    text = await response.text();
  } catch {
    // Connection failed, dropped while reading, or timed out
    throw networkError();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw toApiError(response.status, parseJsonOrNull(text));
  }

  // Intentional empty response, e.g. 204 from /auth/logout
  if (text === "") {
    return null as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw invalidResponseError(response.status);
  }
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}