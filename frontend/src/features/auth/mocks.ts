import { ApiError } from "@/shared/api/errors";
import { registerMock } from "@/shared/api/mockTransport";

// Test values for mock mode only
const MOCK_CODE = "123456";
const EXISTING_PHONE = "0500000001"; // A returning account that already saved preferences

type AuthBody = { phone?: string; code?: string; name?: string };

// Same response shape as /auth/request-code and /auth/resend-code
function codeSent() {
  return { message: "verification code sent", code_length: 6, expires_in_seconds: 300 };
}

function checkPhone(phone?: string): void {
  if (!phone || !/^05\d{8}$/.test(phone)) {
    throw new ApiError(422, "INVALID_PHONE", "Phone number must be in the format 05XXXXXXXX.");
  }
}

export function registerAuthMocks(): void {
  registerMock("POST", "/auth/request-code", (body) => {
    checkPhone((body as AuthBody).phone);
    return codeSent();
  });

  registerMock("POST", "/auth/resend-code", (body) => {
    checkPhone((body as AuthBody).phone);
    return codeSent();
  });

  registerMock("POST", "/auth/verify", (body) => {
    const { phone, code, name } = body as AuthBody;
    checkPhone(phone);

    if (code !== MOCK_CODE) {
      throw new ApiError(401, "INVALID_CODE", "This code is incorrect.");
    }

    const isExisting = phone === EXISTING_PHONE;
    if (!isExisting && !name?.trim()) {
      throw new ApiError(422, "NAME_REQUIRED", "Name is required to create a new account.");
    }

    return {
      token: "mock-token",
      expires_in_seconds: 2592000,
      user: { id: "1", name: isExisting ? "Test User" : name, has_saved_preferences: isExisting },
    };
  });
}