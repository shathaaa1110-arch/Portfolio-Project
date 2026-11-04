import { request } from "@/shared/api/client";
import { invalidResponseError } from "@/shared/api/errors";
import type { OutingStatus } from "./join";

// One person in the outing, as everyone in it may see them.
export type Participant = {
  participant_id: string;
  // null when a member's account has no name yet.
  name: string | null;
  attendance: "pending" | "confirmed" | "declined";
  preferences_done: boolean;
  is_organizer: boolean;
};

// The outing as the waiting room polls it (BE-11).
export type OutingState = {
  outing_id: string;
  name: string;
  status: OutingStatus;
  starts_at: string;
  // A districts.id, not a name to show.
  district: string;
  invite_code: string;
  tiebreak_ends_at: string | null;
  me: { participant_id: string; is_organizer: boolean };
  // What the caller can do now as organizer, such as "start_preferences"; empty for everyone else.
  actions: string[];
  participants: Participant[];
};

// Read the current state; a member sends their login token, a guest their guest token.
export async function loadOutingState(outingId: string, token: string): Promise<OutingState> {
  const state = await request<OutingState>(
    "GET",
    `/outings/${encodeURIComponent(outingId)}`,
    { token },
  );

  if (!isOutingState(state)) {
    throw invalidResponseError(200);
  }
  return state;
}

// Organizer only; asking again after the stage started changes nothing.
export async function startPreferences(outingId: string, token: string) {
  const started = await request<{ outing_id: string; status: OutingStatus }>(
    "POST",
    `/outings/${encodeURIComponent(outingId)}/start-preferences`,
    { token },
  );

  if (!started || typeof started.status !== "string") {
    throw invalidResponseError(200);
  }
  return started;
}

// The screen reads these fields on every poll, so a broken response must not reach it.
function isOutingState(state: OutingState): boolean {
  return (
    !!state &&
    typeof state.outing_id === "string" &&
    typeof state.name === "string" &&
    typeof state.status === "string" &&
    typeof state.invite_code === "string" &&
    typeof state.me?.participant_id === "string" &&
    typeof state.me?.is_organizer === "boolean" &&
    Array.isArray(state.actions) &&
    Array.isArray(state.participants) &&
    state.participants.every(isParticipant)
  );
}

function isParticipant(person: Participant): boolean {
  return (
    !!person &&
    typeof person.participant_id === "string" &&
    (person.name === null || typeof person.name === "string") &&
    typeof person.preferences_done === "boolean" &&
    typeof person.is_organizer === "boolean"
  );
}