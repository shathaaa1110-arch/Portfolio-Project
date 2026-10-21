import { ApiError } from "./errors";

// A mock handler receives the request body and returns fake response data
type MockHandler = (body: unknown) => unknown;

const handlers = new Map<string, MockHandler>();

// Each feature registers its fake responses here (wired in the application layer)
export function registerMock(method: string, path: string, handler: MockHandler): void {
  handlers.set(`${method} ${path}`, handler);
}

// Used by client.ts instead of fetch when USE_MOCK is true
export async function mockTransport<T>(method: string, path: string, body?: unknown): Promise<T> {
  const handler = handlers.get(`${method} ${path}`);
  if (!handler) {
    throw new ApiError(404, "MOCK_NOT_FOUND", `No mock registered for ${method} ${path}`);
  }
  return handler(body) as T;
}
