import { ApiError } from "@/shared/api/errors";
import { registerMock } from "@/shared/api/mockTransport";
import type { InvitePreview } from "./api/join";

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
const testOutings: Record<string, InvitePreview> = {
  TEST: sample,
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

// Fake join responses for mock mode.
export function registerSessionsMocks(): void {
  // The mock registry matches exact paths, so each test code gets its own routes.
  for (const [code, preview] of Object.entries(testOutings)) {
    registerMock("GET", `/outings/by-code/${code}`, () => preview);
    registerMock("POST", `/outings/${code}/join`, () => ({
      ...join(preview),
      participant_id: `mock-member-${code}`,
    }));
    registerMock("POST", `/outings/${code}/join-guest`, () => ({
      ...join(preview),
      participant_id: `mock-guest-${code}`,
      guest_token: `mock-guest-token-${code}`,
    }));
  }
}

// Answer like the server: a blocked outing returns its reason as the 409 code.
function join(preview: InvitePreview) {
  if (preview.join_blocked_reason !== null) {
    throw new ApiError(409, preview.join_blocked_reason, "This outing cannot take new people.");
  }
  return { outing_id: preview.outing_id, status: preview.status };
}