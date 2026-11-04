import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// What a guest needs to come back to an outing they joined.
export type GuestPass = {
  outing_id: string;
  participant_id: string;
  guest_token: string;
};

// expo-secure-store has no web support, so the browser uses localStorage instead, like auth.
const storage = {
  get: (key: string) =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.setItem(key, value)) : SecureStore.setItemAsync(key, value),
};

// One saved pass per invite code, so the same guest is not added twice.
function keyFor(code: string): string {
  return `thouq.guest.${code}`;
}

// Joining already worked, so a storage failure must not undo it.
export async function saveGuestPass(code: string, pass: GuestPass): Promise<void> {
  const saved: GuestPass = {
    outing_id: pass.outing_id,
    participant_id: pass.participant_id,
    guest_token: pass.guest_token,
  };
  try {
    await storage.set(keyFor(code), JSON.stringify(saved));
  } catch {
    // The guest stays joined; they just cannot come back after a refresh.
  }
}

// Returns the saved pass for this code, or null when there is none or it cannot be read.
export async function loadGuestPass(code: string): Promise<GuestPass | null> {
  try {
    const saved = await storage.get(keyFor(code));
    const pass = saved ? JSON.parse(saved) : null;
    if (
      typeof pass?.outing_id === "string" &&
      typeof pass?.participant_id === "string" &&
      typeof pass?.guest_token === "string"
    ) {
      return pass;
    }
  } catch {
    // A broken saved value counts as no pass.
  }
  return null;
}