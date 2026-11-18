import { ApiError } from "@/shared/api/errors";
import { registerMock } from "@/shared/api/mockTransport";
import type { InvitePreview } from "./api/join";
import type { OutingState, Participant } from "./api/state";

// The sample outing every test code starts from.
const sample: InvitePreview = {
  outing_id: "mock-outing-TEST",
  name: "عشاء الخميس",
  organizer_name: "سارة",
  starts_at: "2026-11-05T19:00:00+03:00",
  district: "012",
  status: "invite",
  participants_count: 3,
  can_join: true,
  join_blocked_reason: null,
};

// One test code per join state; any other code acts as an invalid invite.
// Real codes never use 0, O, 1, I or L, so the test codes avoid them too.
// CHEF is open like TEST, but whoever joins it is its organizer in the waiting room.
const testOutings: Record<string, InvitePreview> = {
  TEST: sample,
  CHEF: { ...sample, outing_id: "mock-outing-CHEF", name: "غداء الجمعة" },
  MAXX: {
    ...sample,
    outing_id: "mock-outing-MAXX",
    participants_count: 8,
    can_join: false,
    join_blocked_reason: "OUTING_FULL",
  },
  SHUT: {
    ...sample,
    outing_id: "mock-outing-SHUT",
    status: "voting",
    can_join: false,
    join_blocked_reason: "JOINING_CLOSED",
  },
};

// Fake join and waiting-room responses for mock mode.
export function registerSessionsMocks(): void {
  // The mock registry matches exact paths, so each test code gets its own routes.
  for (const [code, preview] of Object.entries(testOutings)) {
    registerMock("GET", `/outings/by-code/${code}`, () => preview);
    registerMock("POST", `/outings/${code}/join`, () => ({
      ...join(preview),
      participant_id: `mock-me-${code}`,
    }));
    registerMock("POST", `/outings/${code}/join-guest`, () => ({
      ...join(preview),
      participant_id: `mock-me-${code}`,
      guest_token: `mock-guest-token-${code}`,
    }));
  }
  for (const code of ["TEST", "CHEF"]) {
    const outingId = `mock-outing-${code}`;
    registerMock("GET", `/outings/${outingId}`, (_body, token) => poll(code, token));
    registerMock("POST", `/outings/${outingId}/start-preferences`, (_body, token) => start(code, token));
    registerMock("POST", `/outings/${outingId}/leave`, (_body, token) => leave(code, token));
    // Exact paths only, so every mock person gets their own removal route.
    for (const participantId of [`mock-me-${code}`, "mock-sara", "mock-reem", "mock-khalid", "mock-noura"]) {
      registerMock("DELETE", `/outings/${outingId}/participants/${participantId}`, (_body, token) => remove(code, participantId, token));
    }
  }
}

// Answer like the server: a blocked outing returns its reason as the 409 code.
function join(preview: InvitePreview) {
  if (preview.join_blocked_reason !== null) {
    throw new ApiError(409, preview.join_blocked_reason, "This outing cannot take new people.");
  }
  return { outing_id: preview.outing_id, status: preview.status };
}

// Each waiting room lives in memory until the app reloads, and every poll moves its story on:
// someone new arrives on the 3rd poll, and in TEST the organizer starts preferences on the 6th.
const lobbies = new Map<string, { state: OutingState; polls: number; left: boolean }>();

function poll(code: string, token?: string): OutingState {
  const lobby = lobbyFor(code, token);
  lobby.polls += 1;
  if (lobby.polls === 3) {
    lobby.state.participants.push(person("mock-noura", "نورة", false));
  }
  if (code === "TEST" && lobby.polls === 6) {
    lobby.state.status = "preferences";
  }
  return snapshot(lobby.state);
}

function start(code: string, token?: string) {
  const lobby = lobbyFor(code, token);
  if (!lobby.state.me.is_organizer) {
    throw new ApiError(403, "ORGANIZER_ONLY", "Only the organizer can start this stage.");
  }
  lobby.state.status = "preferences";
  return { outing_id: lobby.state.outing_id, status: lobby.state.status };
}

function lobbyFor(code: string, token?: string) {
  if (!token) {
    throw new ApiError(401, "INVALID_TOKEN", "Please log in again.");
  }
  let lobby = lobbies.get(code);
  if (!lobby) {
    const organizer = code === "CHEF";
    const me = `mock-me-${code}`;
    lobby = {
      polls: 0,
      left: false,
      state: {
        outing_id: `mock-outing-${code}`,
        name: testOutings[code].name,
        status: "invite",
        starts_at: sample.starts_at,
        district: sample.district,
        invite_code: code,
        tiebreak_ends_at: null,
        me: { participant_id: me, is_organizer: organizer },
        actions: [],
        readiness: { ready_count: 0, total_count: 0 },
        participants: organizer
          ? [person(me, "منظّم التجربة", true), person("mock-reem", "ريم", false)]
          : [person("mock-sara", "سارة", true), person(me, "ضيف التجربة", false), person("mock-khalid", "خالد", false)],
      },
    };
    lobbies.set(code, lobby);
  }
  // Like the server: once this person leaves, their token opens nothing in the outing.
  if (lobby.left) {
    throw new ApiError(403, "LEFT_OUTING", "You left this outing. Join again from the invite link if it is still open.");
  }
  return lobby;
}

// Leaving and removal follow the server's rules (BE-29): the organizer stays, and only they remove others.
function leave(code: string, token?: string) {
  const lobby = lobbyFor(code, token);
  if (lobby.state.me.is_organizer) {
    throw new ApiError(409, "ORGANIZER_CANNOT_LEAVE", "The organizer cannot leave their own outing.");
  }
  lobby.left = true;
  return drop(lobby.state, lobby.state.me.participant_id, "declined");
}

function remove(code: string, participantId: string, token?: string) {
  const { state } = lobbyFor(code, token);
  if (!state.me.is_organizer) {
    throw new ApiError(403, "ORGANIZER_ONLY", "Only the organizer can remove someone.");
  }
  if (participantId === state.me.participant_id) {
    throw new ApiError(409, "ORGANIZER_CANNOT_LEAVE", "The organizer cannot remove themselves.");
  }
  if (!state.participants.some((person) => person.participant_id === participantId)) {
    throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "This person is not part of this outing.");
  }
  return drop(state, participantId, "removed");
}

// The person leaves the list and the readiness count; the reply carries the new count, like the server's.
function drop(state: OutingState, participantId: string, attendance: "declined" | "removed") {
  state.participants = state.participants.filter((person) => person.participant_id !== participantId);
  const { readiness } = snapshot(state);
  return {
    outing_id: state.outing_id,
    participant_id: participantId,
    attendance,
    status: state.status,
    ready_count: readiness.ready_count,
    total_count: readiness.total_count,
  };
}

// What the server would send now: actions and readiness follow the stage and the people.
function snapshot(state: OutingState): OutingState {
  const ready = state.participants.filter((person) => person.preferences_done).length;
  const actions = state.me.is_organizer && state.status === "invite" ? ["start_preferences"] : [];
  const current = { ...state, actions, readiness: { ready_count: ready, total_count: state.participants.length } };
  return JSON.parse(JSON.stringify(current));
}

function person(participantId: string, name: string, organizer: boolean): Participant {
  return {
    participant_id: participantId,
    name,
    attendance: "confirmed",
    preferences_done: false,
    is_organizer: organizer,
  };
}