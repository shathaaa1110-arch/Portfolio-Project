const test = require("node:test");
const assert = require("node:assert/strict");
const { load, plain } = require("./helpers/render-feature.cjs");

const errors = load("shared/api/errors.ts");
const state = {
  outing_id: "o1", name: "عشاء الخميس", status: "invite", starts_at: "2026-11-05T19:00:00+03:00", district: "012",
  invite_code: "TEST", tiebreak_ends_at: null, me: { participant_id: "p1", is_organizer: true },
  actions: ["start_preferences"], readiness: { ready_count: 0, total_count: 2 },
  participants: [
    { participant_id: "p1", name: "سارة", attendance: "confirmed", preferences_done: false, is_organizer: true },
    { participant_id: "p2", name: null, attendance: "pending", preferences_done: false, is_organizer: false },
  ],
};

// Fresh mock mode for each test: the transport plus this feature's registered mocks.
function mockServer() {
  const transport = load("shared/api/mockTransport.ts", { "./errors": errors });
  load("features/sessions/mocks.ts", { "@/shared/api/errors": errors, "@/shared/api/mockTransport": transport }).registerSessionsMocks();
  return (method, path, token = "mock-token") => transport.mockTransport(method, path, undefined, token);
}

test("the state wrapper sends the token and rejects shapes the waiting room cannot use", async () => {
  const calls = [];
  const api = reply => load("features/sessions/api/state.ts", {
    "@/shared/api/client": { request: async (method, path, options) => { calls.push([method, path, options]); return reply; } },
    "@/shared/api/errors": errors,
    "./join": {},
  });
  assert.equal((await api(state).loadOutingState("o1", "T")).readiness.total_count, 2);
  assert.deepEqual(plain(calls[0]), ["GET", "/outings/o1", { token: "T" }]);
  for (const broken of [null, { ...state, me: null }, { ...state, readiness: null }, { ...state, participants: [{ participant_id: "p1" }] }]) {
    await assert.rejects(api(broken).loadOutingState("o1", "T"), { code: "INVALID_RESPONSE" });
  }
  assert.equal((await api({ outing_id: "o1", status: "preferences" }).startPreferences("o1", "T")).status, "preferences");
  assert.deepEqual(plain(calls.at(-1)), ["POST", "/outings/o1/start-preferences", { token: "T" }]);
});

test("mock CHEF: the organizer can start preferences, and the next poll shows the new stage", async () => {
  const call = mockServer();
  const first = await call("GET", "/outings/mock-outing-CHEF");
  assert.equal(first.me.is_organizer, true);
  assert.deepEqual(plain(first.actions), ["start_preferences"]);
  assert.equal((await call("POST", "/outings/mock-outing-CHEF/start-preferences")).status, "preferences");
  const next = await call("GET", "/outings/mock-outing-CHEF");
  assert.equal(next.status, "preferences");
  assert.deepEqual(plain(next.actions), []);
});

test("mock TEST: someone arrives on the 3rd poll and the organizer starts on the 6th", async () => {
  const call = mockServer();
  const polls = [];
  for (let poll = 0; poll < 6; poll++) polls.push(await call("GET", "/outings/mock-outing-TEST"));
  assert.equal(polls[1].participants.length, 3);
  assert.equal(polls[2].participants.length, 4);
  assert.equal(polls[2].readiness.total_count, 4);
  assert.equal(polls[4].status, "invite");
  assert.equal(polls[5].status, "preferences");
  assert.deepEqual(plain(polls[0].actions), []);
  await assert.rejects(call("POST", "/outings/mock-outing-TEST/start-preferences"), { status: 403, code: "ORGANIZER_ONLY" });
  await assert.rejects(call("GET", "/outings/mock-outing-TEST", ""), { status: 401, code: "INVALID_TOKEN" });
});