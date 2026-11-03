import { ApiError } from "@/shared/api/errors";
import { registerMock } from "@/shared/api/mockTransport";
import type { InvitePreview } from "./api/join";

// The sample outing every test code starts from.
const sample: InvitePreview = {
  name: "عشاء الخميس",
  organizer_name: "سارة",
  starts_at: "2026-11-05T19:00:00+03:00",
  district: "الملقا",
  status: "invite",
  participants_count: 3,
};

// One test code per join state; any other code acts as an invalid invite.
const testOutings: Record<string, InvitePreview> = {
  TEST: sample,
  FULL: { ...sample, participants_count: 8 },
  DONE: { ...sample, status: "voting" },
};

// Fake join responses for mock mode.
export function registerSessionsMocks(): void {
  // The mock registry matches exact paths, so each test code gets its own routes.
  for (const [code, preview] of Object.entries(testOutings)) {
    registerMock("GET", `/outings/by-code/${code}`, () => preview);
    registerMock("POST", `/outings/${code}/join`, () => join(code, preview));
    registerMock("POST", `/outings/${code}/join-guest`, () => ({
      ...join(code, preview),
      participant_id: `mock-guest-${code}`,
      guest_token: `mock-guest-token-${code}`,
    }));
  }
}

// Apply the server's join rules: invite or preferences stage only, and at most 8 people.
function join(code: string, preview: InvitePreview) {
  if (preview.status !== "invite" && preview.status !== "preferences") {
    throw new ApiError(409, "JOINING_CLOSED", "Joining is closed for this outing.");
  }
  if (preview.participants_count >= 8) {
    throw new ApiError(409, "OUTING_FULL", "This outing already has 8 people.");
  }
  return { outing_id: `mock-outing-${code}`, status: preview.status };
}