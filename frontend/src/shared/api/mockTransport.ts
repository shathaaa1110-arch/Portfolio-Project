import { ApiError } from "./errors";

// A mock handler receives the request body and the caller's token, and returns fake response data
type MockHandler = (body: unknown, token?: string) => unknown;

const handlers = new Map<string, MockHandler>();
const patterns: { method: string; pattern: RegExp; handler: (path: string) => unknown }[] = [];

// Explicit dynamic routes for fixture queries; exact registrations keep precedence.
export function registerMockPattern(method: string, pattern: RegExp, handler: (path: string) => unknown): void {
  const existing = patterns.findIndex(item => item.method === method && item.pattern.source === pattern.source);
  const route = { method, pattern, handler };
  if (existing >= 0) patterns[existing] = route;
  else patterns.push(route);
}

// Each feature registers its fake responses here (wired in the application layer)
export function registerMock(method: string, path: string, handler: MockHandler): void {
  handlers.set(`${method} ${path}`, handler);
}

// Used by client.ts instead of fetch when USE_MOCK is true
export async function mockTransport<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const handler = handlers.get(`${method} ${path}`);
  if (!handler) {
    const dynamic = patterns.find(item => item.method === method && item.pattern.test(path));
    if (dynamic) return dynamic.handler(path) as T;
    throw new ApiError(404, "MOCK_NOT_FOUND", `No mock registered for ${method} ${path}`);
  }
  return handler(body, token) as T;
}
