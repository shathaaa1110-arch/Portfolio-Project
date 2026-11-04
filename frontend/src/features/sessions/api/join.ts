import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";

// The stages an outing moves through.
export type OutingStatus = "invite" | "preferences" | "voting" | "tiebreak" | "result";

// Why a new person cannot join; the same codes the join request returns with 409.
export type JoinBlockedReason = "OUTING_FULL" | "JOINING_CLOSED";

// What the join screen shows before joining, as agreed with Asem for BE-09.
export type InvitePreview = {
  outing_id: string;
  name: string;
  organizer_name: string;
  starts_at: string;
  district: string;
  status: OutingStatus;
  participants_count: number;
  can_join: boolean;
  join_blocked_reason: JoinBlockedReason | null;
};

// A signed-in user's join response.
type JoinResponse = {
  outing_id: string;
  participant_id: string;
  status: OutingStatus;
};

// A guest's join response; the guest token works for this outing only.
export type GuestJoinResponse = {
  outing_id: string;
  participant_id: string;
  guest_token: string;
  status: OutingStatus;
};

// Find the outing behind an invite code; no token, because a guest has none.
export async function lookupInvite(code: string): Promise<InvitePreview> {
  const preview = await request<InvitePreview>(
    "GET",
    `/outings/by-code/${encodeURIComponent(code)}`,
  );

  // A response missing what the screen uses is an error, not a session.
  if (
    !preview ||
    typeof preview.outing_id !== "string" ||
    typeof preview.name !== "string" ||
    typeof preview.organizer_name !== "string" ||
    typeof preview.district !== "string" ||
    typeof preview.status !== "string" ||
    !Number.isSafeInteger(preview.participants_count) ||
    typeof preview.can_join !== "boolean"
  ) {
    throw invalidResponseError(200);
  }
  return preview;
}

// Join as a signed-in user; repeating it keeps one participation.
export async function joinOuting(code: string, token: string) {
  const joined = await request<JoinResponse>(
    "POST",
    `/outings/${encodeURIComponent(code)}/join`,
    { token },
  );

  if (!joined || typeof joined.outing_id !== "string" || typeof joined.participant_id !== "string") {
    throw invalidResponseError(200);
  }
  return joined;
}

// Join as a guest with a name only; a guest has no token yet.
export async function joinOutingAsGuest(code: string, guestName: string) {
  const joined = await request<GuestJoinResponse>(
    "POST",
    `/outings/${encodeURIComponent(code)}/join-guest`,
    { body: { guest_name: guestName } },
  );

  // We keep the guest token for later requests, so it must be real text.
  if (
    !joined ||
    typeof joined.outing_id !== "string" ||
    typeof joined.participant_id !== "string" ||
    typeof joined.guest_token !== "string"
  ) {
    throw invalidResponseError(200);
  }
  return joined;
}