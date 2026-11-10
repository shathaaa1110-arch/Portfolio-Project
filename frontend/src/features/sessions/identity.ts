import { loadSession } from "@/features/auth";
import { ApiError } from "@/shared/api/errors";
import { loadGuestPass } from "./guestPass";

export async function outingToken(id: string, code: string): Promise<string> {
  const guest = await loadGuestPass(code);
  if (guest?.outing_id === id) return guest.guest_token;
  const account = await loadSession();
  if (account) return account.token;
  throw new ApiError(401, "INVALID_TOKEN", "Return through the invitation");
}
