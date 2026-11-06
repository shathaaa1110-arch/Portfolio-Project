import { loadSession } from "@/features/auth";
import { loadGuestPass } from "./guestPass";

// The token for one outing: the guest pass saved for it, otherwise the member's login.
// Returns null when this device has neither, so the screen can send the person to join.
export async function outingToken(outingId: string): Promise<string | null> {
  const pass = await loadGuestPass(outingId);
  if (pass !== null) {
    return pass.guest_token;
  }
  const session = await loadSession();
  return session?.token ?? null;
}
