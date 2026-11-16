import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";

// The server's reply to a leave or a removal (BE-29).
// The lobby asks for fresh state right after, so only the ids are checked here.
type MembershipReply = { outing_id: string; participant_id: string };

// A participant leaves by themselves, only before the suggestions are generated.
// Refusals keep their server code, so the screen can explain them.
export async function leaveOuting(outingId: string, token: string): Promise<void> {
  const reply = await request<MembershipReply>(
    "POST",
    `/outings/${encodeURIComponent(outingId)}/leave`,
    { token },
  );

  if (reply?.outing_id !== outingId) {
    throw invalidResponseError(200);
  }
}

// Organizer only: remove someone else, only before the suggestions are generated.
export async function removeParticipant(outingId: string, participantId: string, token: string): Promise<void> {
  const reply = await request<MembershipReply>(
    "DELETE",
    `/outings/${encodeURIComponent(outingId)}/participants/${encodeURIComponent(participantId)}`,
    { token },
  );

  if (reply?.outing_id !== outingId || reply.participant_id !== participantId) {
    throw invalidResponseError(200);
  }
}