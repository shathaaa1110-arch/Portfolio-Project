import { request } from "@/shared/api/client";

// Response of /auth/request-code and /auth/resend-code
export type CodeSentResponse = {
  message: string;
  code_length: number;
  expires_in_seconds: number;
};

// Response of /auth/verify
export type VerifyResponse = {
  token: string;
  expires_in_seconds: number;
  user: {
    id: string;
    name: string;
    has_saved_preferences: boolean;
  };
};

export function requestCode(phone: string) {
  return request<CodeSentResponse>("POST", "/auth/request-code", { body: { phone } });
}

export function resendCode(phone: string) {
  return request<CodeSentResponse>("POST", "/auth/resend-code", { body: { phone } });
}

// name is sent only from the sign-up screen; the backend needs it to create a new account
export function verifyCode(phone: string, code: string, name?: string) {
  return request<VerifyResponse>("POST", "/auth/verify", { body: { phone, code, name } });
}

// Clears the push token on the server; the app then deletes the local session
export function logout(token: string) {
  return request<null>("POST", "/auth/logout", { token });
}