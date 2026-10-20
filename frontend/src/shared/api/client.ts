import { API_BASE_URL, USE_MOCK } from "./config";
import { networkError, toApiError } from "./errors";
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
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw networkError();
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(response.status, data);
  }
  return data as T;
}
