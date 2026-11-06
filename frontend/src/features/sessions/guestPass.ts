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

// One saved pass per outing; a guest token works for its own outing only.
function keyFor(outingId: string): string {
  return `thouq.guest.${outingId}`;
}

// Joining already worked, so a storage failure must not undo it.
export async function saveGuestPass(pass: GuestPass): Promise<void> {
  const saved: GuestPass = {
    outing_id: pass.outing_id,
    participant_id: pass.participant_id,
    guest_token: pass.guest_token,
  };
  try {
    await storage.set(keyFor(pass.outing_id), JSON.stringify(saved));
  } catch {
    // The guest stays joined; they just cannot come back after a refresh.
  }
}

// Returns the saved pass for this outing, or null when there is none or it cannot be read.
export async function loadGuestPass(outingId: string): Promise<GuestPass | null> {
  try {
    const saved = await storage.get(keyFor(outingId));
    const pass = saved ? JSON.parse(saved) : null;
    if (
      pass?.outing_id === outingId &&
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
