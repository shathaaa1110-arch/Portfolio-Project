import { ApiError } from "@/shared/api/errors";
import { registerMock } from "@/shared/api/mockTransport";

// Test values for mock mode only
const MOCK_CODE = "123456";
const EXISTING_PHONE = "0500000001"; // A returning account that already saved preferences
const RESEND_WAIT_SECONDS = 60;

type AuthBody = { phone?: string; code?: string; name?: string };

// Last time a code was sent to each phone, to copy the backend's 60-second limit
const lastSentAt = new Map<string, number>();

// The mock token carries the account, so GET /users/me knows who is asking, even after a reload.
// The real server finds the account from its token in the same way
const MOCK_TOKEN_PREFIX = "mock-token";
type MockAccount = { id: string; name: string; phone: string };

function mockTokenFor(phone: string, name: string): string {
  return `${MOCK_TOKEN_PREFIX}|${phone}|${encodeURIComponent(name)}`;
}

// Returns the account inside a mock token, or null for any other token
function accountFromMockToken(token = ""): MockAccount | null {
  const [prefix, phone, name] = token.split("|");
  if (prefix !== MOCK_TOKEN_PREFIX || !phone || !name) {
    return null;
  }
  try {
    return { id: `mock-${phone}`, name: decodeURIComponent(name), phone };
  } catch {
    return null;
  }
}

// Same cleanup as the backend: Arabic digits become 0-9, then the format is checked
function normalizePhone(raw = ""): string {
  const phone = raw.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!/^05\d{8}$/.test(phone)) {
    throw new ApiError(422, "INVALID_PHONE", "Phone number must be in the format 05XXXXXXXX.");
  }
  return phone;
}

function sendCode(phone: string, message: string) {
  const sentAt = lastSentAt.get(phone);
  const waited = sentAt === undefined ? Infinity : (Date.now() - sentAt) / 1000;
  if (waited < RESEND_WAIT_SECONDS) {
    throw new ApiError(429, "RATE_LIMITED", "Please wait before requesting another code.", undefined,
      Math.ceil(RESEND_WAIT_SECONDS - waited));
  }
  lastSentAt.set(phone, Date.now());
  return { message, code_length: 6, expires_in_seconds: 300 };
}

export function registerAuthMocks(): void {
  registerMock("POST", "/auth/request-code", (body) => {
    const phone = normalizePhone((body as AuthBody).phone);
    return sendCode(phone, "verification code sent");
  });

  registerMock("POST", "/auth/resend-code", (body) => {
    const phone = normalizePhone((body as AuthBody).phone);
    if (!lastSentAt.has(phone)) {
      throw new ApiError(404, "NO_PENDING_CODE", "Request a code first.");
    }
    return sendCode(phone, "new code sent");
  });

  registerMock("POST", "/auth/verify", (body) => {
    const { code, name } = body as AuthBody;
    const phone = normalizePhone((body as AuthBody).phone);

    if (code !== MOCK_CODE) {
      throw new ApiError(401, "INVALID_CODE", "This code is incorrect.");
    }

    const isExisting = phone === EXISTING_PHONE;
    if (!isExisting && !name?.trim()) {
      throw new ApiError(422, "NAME_REQUIRED", "Name is required to create a new account.");
    }

    const accountName = isExisting ? "Test User" : name!.trim();

    return {
      token: mockTokenFor(phone, accountName),
      expires_in_seconds: 2592000,
      user: { id: `mock-${phone}`, name: accountName, has_saved_preferences: isExisting },
    };
  });

  registerMock("POST", "/auth/logout", () => null);

  // A token from before this format, or any unknown token, asks the user to log in again
  registerMock("GET", "/users/me", (_body, token) => {
    const account = accountFromMockToken(token);
    if (!account) {
      throw new ApiError(401, "INVALID_TOKEN", "Please log in again.");
    }
    return account;
  });
}
