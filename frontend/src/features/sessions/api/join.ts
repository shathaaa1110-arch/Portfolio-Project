import { request } from "@/shared/api/client";

// The stages an outing moves through.
export type OutingStatus = "invite" | "preferences" | "voting" | "tiebreak" | "result";

// What the join screen shows before joining (proposed route, BE-09 #64).
export type InvitePreview = {
  name: string;
  organizer_name: string;
  starts_at: string;
  district: string;
  status: OutingStatus;
  participants_count: number;
};

// A signed-in user's join response.
type JoinResponse = {
  outing_id: string;
  status: OutingStatus;
};

// A guest's join response; the guest token works for this outing only.
export type GuestJoinResponse = {
  outing_id: string;
  participant_id: string;
  guest_token: string;
  status: OutingStatus;
};

// Find the outing behind an invite code (proposed route, BE-09 #64).
export function lookupInvite(code: string) {
  return request<InvitePreview>(
    "GET",
    `/outings/by-code/${encodeURIComponent(code)}`,
  );
}

// Join as a signed-in user; repeating it keeps one participation.
export function joinOuting(code: string, token: string) {
  return request<JoinResponse>(
    "POST",
    `/outings/${encodeURIComponent(code)}/join`,
    { token },
  );
}

// Join as a guest with a name only; a guest has no token yet.
export function joinOutingAsGuest(code: string, guestName: string) {
  return request<GuestJoinResponse>(
    "POST",
    `/outings/${encodeURIComponent(code)}/join-guest`,
    { body: { guest_name: guestName } },
  );
}