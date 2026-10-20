import * as SecureStore from "expo-secure-store";
import type { VerifyResponse } from "./api";

const SESSION_KEY = "thouq.session";

export type AuthSession = {
  token: string;
  expiresAt: number; // Time in milliseconds when the token stops working
  userName: string;
  hasSavedPreferences: boolean;
};

// Builds the session to save from the /auth/verify response
export function sessionFromVerify(response: VerifyResponse): AuthSession {
  return {
    token: response.token,
    expiresAt: Date.now() + response.expires_in_seconds * 1000,
    userName: response.user.name,
    hasSavedPreferences: response.user.has_saved_preferences,
  };
}

export async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

// Returns the saved session, or null when there is none or it has expired
export async function loadSession(): Promise<AuthSession | null> {
  const saved = await SecureStore.getItemAsync(SESSION_KEY);
  if (!saved) {
    return null;
  }

  try {
    const session = JSON.parse(saved) as AuthSession;
    if (Date.now() >= session.expiresAt) {
      await clearSession();
      return null;
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}