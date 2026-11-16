const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { load, render, act, deferred, plain } = require("./helpers/render-feature.cjs");

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

// A clock the test moves by hand, so polling runs without waiting.
function fakeClock() {
  let now = 0;
  let lastId = 0;
  const timers = new Map();
  return {
    setTimeout: (run, ms) => { timers.set(++lastId, { run, at: now + ms }); return lastId; },
    clearTimeout: id => { timers.delete(id); },
    pending: () => timers.size,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) timer.run();
      }
      await settle();
    },
  };
}
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

// The app moving between front and background.
function fakeAppState() {
  const listeners = new Set();
  return {
    currentState: "active",
    addEventListener: (_event, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
    set(status) { this.currentState = status; listeners.forEach(listener => listener(status)); },
    listeners: () => listeners.size,
  };
}

// Screen focus the test controls; losing focus keeps the screen mounted, like a stack navigator.
function fakeFocus() {
  const listeners = new Set();
  const focus = { focused: true, set(value) { focus.focused = value; listeners.forEach(listener => listener()); } };
  function useFocusEffect(effect) {
    const [focused, setFocused] = React.useState(focus.focused);
    React.useEffect(() => {
      const listener = () => setFocused(focus.focused);
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []);
    React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  }
  return { focus, useFocusEffect };
}

// The hook with a fake clock, app state, focus, token and server.
function polling({ token = "T", reply } = {}) {
  const clock = fakeClock();
  const app = fakeAppState();
  const { focus, useFocusEffect } = fakeFocus();
  const calls = { load: 0, forgot: [] };
  const hook = load("features/sessions/useSessionState.ts", {
    "expo-router": { useFocusEffect },
    "react-native": { AppState: app },
    "@/shared/api/errors": errors,
    "./identity": {
      outingToken: async () => {
        if (token === null) throw new errors.ApiError(401, "INVALID_TOKEN", "");
        return token;
      },
    },
    "./guestPass": {
      loadGuestPass: async () => ({ outing_id: "o1", participant_id: "g1", guest_token: token }),
      removeGuestPass: async code => { calls.forgot.push(code); },
    },
    "./api/state": {
      loadOutingState: async () => { calls.load++; return reply ? reply(calls.load) : { name: `poll ${calls.load}` }; },
    },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const view = {};
  function Screen() { Object.assign(view, hook.useSessionState("o1", "TEST")); return null; }
  // Opening the screen plans the first request at once; advance(0) lets it run.
  const open = async () => { const screen = await render(Screen); await clock.advance(0); return screen; };
  const blur = () => act(async () => focus.set(false));
  const refocus = async () => { await act(async () => focus.set(true)); await clock.advance(0); };
  return { clock, app, calls, view, open, blur, refocus };
}

test("polls at once and then every 4 seconds, with one timer", async () => {
  const { clock, calls, view, open } = polling();
  await open();
  assert.equal(calls.load, 1); assert.equal(view.state.name, "poll 1"); assert.equal(clock.pending(), 1);
  await clock.advance(3999); assert.equal(calls.load, 1);
  await clock.advance(1); assert.equal(calls.load, 2); assert.equal(view.state.name, "poll 2"); assert.equal(clock.pending(), 1);
});

test("leaving stops polling, and coming back again and again never doubles it", async () => {
  const { clock, app, calls, open, blur, refocus } = polling();
  const screen = await open();
  for (let visit = 0; visit < 3; visit++) {
    await blur();
    assert.equal(clock.pending(), 0); assert.equal(app.listeners(), 0);
    await clock.advance(20000);
    await refocus();
  }
  assert.equal(calls.load, 4);
  await clock.advance(4000); await clock.advance(4000);
  assert.equal(calls.load, 6); assert.equal(clock.pending(), 1);
  await screen.close();
  assert.equal(clock.pending(), 0); assert.equal(app.listeners(), 0);
});

test("a request still running when the screen loses focus changes nothing after it", async () => {
  const slow = deferred();
  const { clock, calls, view, open, blur } = polling({ reply: () => slow.promise });
  await open();
  await blur();
  slow.resolve({ name: "late" }); await settle();
  assert.equal(calls.load, 1); assert.equal(clock.pending(), 0); assert.equal(view.state, null);
});

test("the background pauses polling, and coming back asks at once, once", async () => {
  const { clock, app, calls, open } = polling();
  await open();
  app.set("background");
  await clock.advance(4000); assert.equal(calls.load, 1); assert.equal(clock.pending(), 0);
  app.set("active"); app.set("active");
  assert.equal(clock.pending(), 1);
  await clock.advance(0); assert.equal(calls.load, 2);
});

test("passing failures keep the last state; final ones stop until refresh and forget the refused pass", async () => {
  const fail = code => { throw new errors.ApiError(code === "NETWORK_ERROR" ? 0 : 403, code, ""); };
  const { clock, calls, view, open } = polling({
    reply: n => (n === 2 ? fail("NETWORK_ERROR") : n === 4 ? fail("NOT_A_PARTICIPANT") : { name: `poll ${n}` }),
  });
  await open();
  await clock.advance(4000);
  assert.equal(view.state.name, "poll 1"); assert.equal(view.error.code, "NETWORK_ERROR"); assert.equal(clock.pending(), 1);
  assert.deepEqual(calls.forgot, []);
  await clock.advance(4000); assert.equal(view.error, null); assert.equal(view.state.name, "poll 3");
  await clock.advance(4000); assert.equal(view.error.code, "NOT_A_PARTICIPANT"); assert.equal(clock.pending(), 0);
  assert.deepEqual(calls.forgot, ["TEST"]);
  await clock.advance(20000); assert.equal(calls.load, 4);
  await act(async () => view.refresh()); await clock.advance(0); assert.equal(calls.load, 5);
});

test("without a pass for the outing it reports INVALID_TOKEN and asks nothing", async () => {
  const { clock, calls, view, open } = polling({ token: null });
  await open();
  assert.equal(view.error.code, "INVALID_TOKEN"); assert.equal(calls.load, 0); assert.equal(clock.pending(), 0);
});

// The waiting room's components, with the app's real theme and fake native views.
const { native, shared } = require("./helpers/render-feature.cjs");
const theme = load("shared/theme.ts");
const texts = root => root.findAllByType("AppText").map(node => [].concat(node.props.children).join(""));
function component(name, nativeExtras = {}) {
  return load(`features/sessions/components/${name}.tsx`, {
    "react-native": { ...native, ...nativeExtras },
    "@/shared/components": shared,
    "@/shared/theme": theme,
  })[name];
}

test("a participant row shows you, the organizer badge, readiness only once preferences started, and a whole emoji initial", async () => {
  const ParticipantRow = component("ParticipantRow");
  const sara = { participant_id: "p1", name: "سارة", attendance: "confirmed", preferences_done: true, is_organizer: true };
  let { root } = await render(ParticipantRow, { person: sara, isMe: true, showReadiness: false });
  assert.deepEqual(texts(root), ["س", "أنت", "المنظّم"]);
  ({ root } = await render(ParticipantRow, { person: { ...sara, name: null, is_organizer: false, preferences_done: false }, isMe: false, showReadiness: true }));
  assert.deepEqual(texts(root), ["م", "مشارك", "يجهّز تفضيلاته"]);
  ({ root } = await render(ParticipantRow, { person: sara, isMe: false, showReadiness: true }));
  assert(texts(root).includes("✓ جاهز"));
  ({ root } = await render(ParticipantRow, { person: { ...sara, name: "😀 علي" }, isMe: false, showReadiness: false }));
  assert.equal(texts(root)[0], "😀");
});

test("the stage indicator fills every step up to the current one; a tiebreak is still voting", async () => {
  const StageIndicator = component("StageIndicator");
  const filled = root => root.findAll(node => node.type === "View" && Array.isArray(node.props.style) && node.props.style[1]).length;
  for (const [status, steps] of [["invite", 1], ["preferences", 2], ["tiebreak", 3], ["result", 4]]) {
    const { root } = await render(StageIndicator, { status });
    assert.equal(filled(root), steps, status);
  }
});

test("the invite card shares the code, and hides sharing once joining has closed", async () => {
  const sent = [];
  const InviteCard = component("InviteCard", { Share: { share: async content => { sent.push(content.message); } } });
  let { root } = await render(InviteCard, { code: "7K3M", closed: false });
  assert(texts(root).includes("7K3M"));
  await act(async () => root.findByType("Pressable").props.onPress());
  assert.match(sent[0], /7K3M/);
  ({ root } = await render(InviteCard, { code: "7K3M", closed: true }));
  assert(texts(root).includes("رمز الجلسة · الانضمام مغلق"));
  assert.equal(root.findAllByType("Pressable").length, 0);
});

test("refresh asks right away, and asks again right after a request that was already running", async () => {
  const slow = deferred();
  const { clock, calls, view, open } = polling({ reply: n => (n === 2 ? slow.promise : { name: `poll ${n}` }) });
  await open();
  await act(async () => view.refresh()); await clock.advance(0);
  assert.equal(calls.load, 2);
  await act(async () => view.refresh());
  slow.resolve({ name: "poll 2" }); await settle();
  await clock.advance(0);
  assert.equal(calls.load, 3); assert.equal(view.state.name, "poll 3"); assert.equal(clock.pending(), 1);
});

// The waiting room screen with fake polling, router and server; set `room` and update to show a new poll.
function lobbyScreen({ params = { id: "o1", code: "TEST" }, start } = {}) {
  const room = { state: null, error: null };
  const calls = { push: [], replace: [], start: [], refresh: 0 };
  const Screen = load("features/sessions/LobbyScreen.tsx", {
    "expo-router": {
      useLocalSearchParams: () => params,
      router: { push: href => calls.push.push(href), replace: href => calls.replace.push(href) },
    },
    "react-native": { ...native, Share: { share: async () => {} } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/shared/components": shared,
    "@/shared/theme": theme,
    "./identity": { outingToken: async () => "T" },
    "./api/state": { startPreferences: async (...args) => { calls.start.push(args); return start ? start() : { status: "preferences" }; } },
    "./components/InviteCard": { InviteCard: component("InviteCard", { Share: { share: async () => {} } }) },
    "./components/ParticipantRow": { ParticipantRow: component("ParticipantRow") },
    "./components/SessionActions": { LeaveButton: "LeaveButton", RemoveSheet: "RemoveSheet" },
    "./components/StageIndicator": { StageIndicator: component("StageIndicator") },
    "./useSessionState": { useSessionState: () => ({ ...room, refresh: () => { calls.refresh++; } }) },
  }).LobbyScreen;
  return { Screen, room, calls };
}
const roomState = (status, organizer, meDone = false) => ({
  ...state,
  status,
  me: { participant_id: "p1", is_organizer: organizer },
  actions: organizer && status === "invite" ? ["start_preferences"] : [],
  readiness: { ready_count: meDone ? 1 : 0, total_count: 2 },
  participants: [
    { participant_id: "p1", name: "سارة", attendance: "confirmed", preferences_done: meDone, is_organizer: organizer },
    { participant_id: "p2", name: "خالد", attendance: "confirmed", preferences_done: false, is_organizer: !organizer },
  ],
});
const button = (root, title) => root.findAllByType("AppButton").find(node => node.props.title === title);
const SESSION = { pathname: "/sessions/[id]", params: { id: "o1", code: "TEST" } };

test("the organizer sees the room and starts preferences, and the next poll is asked at once", async () => {
  const lobby = lobbyScreen();
  lobby.room.state = roomState("invite", true);
  const { root } = await render(lobby.Screen);
  const shown = texts(root);
  assert(shown.includes("عشاء الخميس")); assert(shown.includes("TEST")); assert(shown.includes("المشاركون ٢ / ٨"));
  assert(shown.includes("أنت")); assert(!shown.some(text => text.includes("جاهزون")));
  await act(async () => button(root, "ابدأ التفضيلات").props.onPress());
  assert.deepEqual(plain(lobby.calls.start[0]), ["o1", "T"]);
  assert.equal(lobby.calls.refresh, 1);
});

test("a participant waits for the organizer and has no start button", async () => {
  const lobby = lobbyScreen();
  lobby.room.state = roomState("invite", false);
  const { root } = await render(lobby.Screen);
  assert.equal(button(root, "ابدأ التفضيلات"), undefined);
  assert(texts(root).includes("ننتظر المنظّم يبدأ مرحلة التفضيلات."));
});

test("when preferences start, each person goes to their form once, and not when already done", async () => {
  const lobby = lobbyScreen();
  lobby.room.state = roomState("invite", false);
  const screen = await render(lobby.Screen);
  assert.equal(lobby.calls.push.length, 0);
  lobby.room.state = roomState("preferences", false);
  await screen.update({});
  lobby.room.state = roomState("preferences", false);
  await screen.update({});
  assert.deepEqual(plain(lobby.calls.push), [SESSION]);
  assert(texts(screen.root).includes("٠ جاهزون"));
  await act(async () => button(screen.root, "تفضيلاتي لهذه الجلسة").props.onPress());
  assert.equal(lobby.calls.push.length, 2);

  const done = lobbyScreen();
  done.room.state = roomState("preferences", false, true);
  await render(done.Screen);
  assert.equal(done.calls.push.length, 0);

  // Opening the room after preferences started, with yours still to fill, sends you once.
  const late = lobbyScreen();
  late.room.state = roomState("preferences", false);
  const opened = await render(late.Screen);
  await opened.update({});
  assert.deepEqual(plain(late.calls.push), [SESSION]);
});

test("no access sends you to join; a missing id and an ended outing each read clearly", async () => {
  let lobby = lobbyScreen();
  lobby.room.error = new errors.ApiError(403, "NOT_A_PARTICIPANT", "");
  let { root } = await render(lobby.Screen);
  assert(texts(root).includes("ما عندك وصول لهذه الجلسة. انضم برمز الدعوة."));
  await act(async () => button(root, "الانضمام برمز").props.onPress());
  assert.deepEqual(lobby.calls.replace, ["/join"]);

  lobby = lobbyScreen({ params: {} });
  ({ root } = await render(lobby.Screen));
  assert(texts(root).includes("ما وصلنا رقم الجلسة."));

  lobby = lobbyScreen();
  lobby.room.error = new errors.ApiError(404, "OUTING_NOT_FOUND", "");
  ({ root } = await render(lobby.Screen));
  await act(async () => button(root, "الرجوع للرئيسية").props.onPress());
  assert.deepEqual(lobby.calls.replace, ["/"]);
});

test("a failed start keeps the room and says so", async () => {
  const lobby = lobbyScreen({ start: () => { throw new errors.ApiError(0, "NETWORK_ERROR", ""); } });
  lobby.room.state = roomState("invite", true);
  const { root } = await render(lobby.Screen);
  await act(async () => button(root, "ابدأ التفضيلات").props.onPress());
  assert(texts(root).includes("تعذّر بدء التفضيلات. حاول مرة ثانية."));
  assert.equal(lobby.calls.refresh, 0);
});

// Leaving and removal before generation (FE-26, with BE-29 on the server).
test("the membership wrapper sends each request and rejects a reply about another outing or person", async () => {
  const calls = [];
  const api = reply => load("features/sessions/api/membership.ts", {
    "@/shared/api/client": { request: async (method, path, options) => { calls.push([method, path, options]); return reply; } },
    "@/shared/api/errors": errors,
  });
  await api({ outing_id: "o 1", participant_id: "p1" }).leaveOuting("o 1", "T");
  assert.deepEqual(plain(calls[0]), ["POST", "/outings/o%201/leave", { token: "T" }]);
  await api({ outing_id: "o 1", participant_id: "p/2" }).removeParticipant("o 1", "p/2", "T");
  assert.deepEqual(plain(calls[1]), ["DELETE", "/outings/o%201/participants/p%2F2", { token: "T" }]);
  for (const broken of [null, { outing_id: "x", participant_id: "p/2" }, { outing_id: "o 1", participant_id: "p9" }]) {
    await assert.rejects(api(broken).removeParticipant("o 1", "p/2", "T"), { code: "INVALID_RESPONSE" });
  }
});

test("mock CHEF: the organizer removes someone else, the next poll drops them, and the server's rules hold", async () => {
  const call = mockServer();
  const removed = await call("DELETE", "/outings/mock-outing-CHEF/participants/mock-reem");
  assert.equal(removed.attendance, "removed"); assert.equal(removed.total_count, 1);
  const next = await call("GET", "/outings/mock-outing-CHEF");
  assert.deepEqual(plain(next.participants.map(person => person.participant_id)), ["mock-me-CHEF"]);
  await assert.rejects(call("DELETE", "/outings/mock-outing-CHEF/participants/mock-reem"), { status: 404, code: "PARTICIPANT_NOT_FOUND" });
  await assert.rejects(call("DELETE", "/outings/mock-outing-CHEF/participants/mock-me-CHEF"), { status: 409, code: "ORGANIZER_CANNOT_LEAVE" });
  await assert.rejects(call("POST", "/outings/mock-outing-CHEF/leave"), { status: 409, code: "ORGANIZER_CANNOT_LEAVE" });
});

test("mock TEST: a participant cannot remove anyone, can leave, and then the outing refuses them", async () => {
  const call = mockServer();
  await assert.rejects(call("DELETE", "/outings/mock-outing-TEST/participants/mock-khalid"), { status: 403, code: "ORGANIZER_ONLY" });
  const left = await call("POST", "/outings/mock-outing-TEST/leave");
  assert.equal(left.participant_id, "mock-me-TEST"); assert.equal(left.attendance, "declined"); assert.equal(left.total_count, 2);
  await assert.rejects(call("GET", "/outings/mock-outing-TEST"), { status: 403, code: "LEFT_OUTING" });
});

test("leaving or being removed is final: polling stops and the refused pass is forgotten", async () => {
  for (const code of ["LEFT_OUTING", "REMOVED_FROM_OUTING"]) {
    const { clock, calls, view, open } = polling({
      reply: n => { if (n === 2) throw new errors.ApiError(403, code, ""); return { name: `poll ${n}` }; },
    });
    await open();
    await clock.advance(4000);
    assert.equal(view.error.code, code); assert.equal(clock.pending(), 0); assert.deepEqual(calls.forgot, ["TEST"]);
    await clock.advance(60000); assert.equal(calls.load, 2);
  }
});

test("an ended access says why, hides the outing, and goes home", async () => {
  const cases = [
    ["LEFT_OUTING", "غادرت هذه الجلسة. تقدر ترجع لها برمز الدعوة ما دامت مفتوحة."],
    ["REMOVED_FROM_OUTING", "أزالك المنظّم، وانتهى وصولك لهذه الجلسة."],
  ];
  for (const [code, message] of cases) {
    const lobby = lobbyScreen();
    // The hook still holds the last good state; none of it may show.
    lobby.room.state = roomState("preferences", false);
    lobby.room.error = new errors.ApiError(403, code, "");
    const { root } = await render(lobby.Screen);
    const shown = texts(root);
    assert(shown.includes(message), code);
    for (const hidden of ["عشاء الخميس", "سارة", "خالد", "TEST"]) assert(!shown.some(text => text.includes(hidden)), `${code}: ${hidden}`);
    await act(async () => button(root, "الرجوع للرئيسية").props.onPress());
    assert.deepEqual(lobby.calls.replace, ["/"]);
  }
});

const removeButtons = root => root.findAll(node => node.type === "Pressable" && String(node.props.accessibilityLabel ?? "").startsWith("إزالة"));

test("before generation the organizer removes others only, and a participant can only leave", async () => {
  const organizer = lobbyScreen();
  organizer.room.state = roomState("invite", true);
  let { root } = await render(organizer.Screen);
  assert.deepEqual(removeButtons(root).map(node => node.props.accessibilityLabel), ["إزالة خالد"]);
  assert.equal(root.findAllByType("LeaveButton").length, 0);
  await act(async () => removeButtons(root)[0].props.onPress());
  assert.equal(root.findByType("RemoveSheet").props.person.participant_id, "p2");
  // A refusal or a success only asks the server again; the room keeps what it shows until the next poll.
  await act(async () => root.findByType("RemoveSheet").props.onDone());
  assert.equal(organizer.calls.refresh, 1); assert(texts(root).includes("المشاركون ٢ / ٨"));
  await act(async () => root.findByType("RemoveSheet").props.onClose());
  assert.equal(root.findByType("RemoveSheet").props.person, null);

  for (const status of ["invite", "preferences"]) {
    const participant = lobbyScreen();
    participant.room.state = roomState(status, false, true);
    ({ root } = await render(participant.Screen));
    assert.equal(removeButtons(root).length, 0, status);
    root.findByType("LeaveButton").props.onDone();
    assert.equal(participant.calls.refresh, 1, status);
  }
});

test("after generation nobody sees leave or remove", async () => {
  for (const organizer of [true, false]) {
    const lobby = lobbyScreen();
    lobby.room.state = roomState("voting", organizer, true);
    const { root } = await render(lobby.Screen);
    assert.equal(removeButtons(root).length, 0, `organizer: ${organizer}`);
    assert.equal(root.findAllByType("LeaveButton").length, 0, `organizer: ${organizer}`);
  }
});

// The leave button and the removal sheet themselves, with a fake server and plain stand-ins for the sheet.
function membershipActions({ leave, remove } = {}) {
  const calls = { leave: [], remove: [], done: 0, closed: 0 };
  const actions = load("features/sessions/components/SessionActions.tsx", {
    "react-native": native,
    "@/shared/components": shared,
    "@/shared/theme": theme,
    "@/shared/api/errors": errors,
    "../api/membership": {
      leaveOuting: async (...args) => { calls.leave.push(args); if (leave) return leave(); },
      removeParticipant: async (...args) => { calls.remove.push(args); if (remove) return remove(); },
    },
    "../identity": { outingToken: async () => "T" },
    "./SessionChrome": { SessionSheet: "SessionSheet" },
    "./SessionLayout": { QuietButton: "QuietButton", room: {} },
  });
  return { actions, calls };
}
const confirmButtons = root => root.findAllByType("AppButton");
const alerts = root => root.findAll(node => node.type === "AppText" && node.props.accessibilityRole === "alert").map(node => node.props.children);
const khalid = { participant_id: "p2", name: "خالد", attendance: "confirmed", preferences_done: false, is_organizer: false };

test("leave asks first, sends the outing's token, closes, then refreshes; a passing failure keeps the button", async () => {
  const { actions, calls } = membershipActions();
  const { root } = await render(actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => calls.done++ });
  const sheet = () => root.findByType("SessionSheet");
  assert.equal(sheet().props.visible, false); assert.equal(sheet().props.title, "تغادر الجلسة؟");
  await act(async () => root.findByType("Pressable").props.onPress());
  assert.equal(sheet().props.visible, true);
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(plain(calls.leave), [["o1", "T"]]); assert.equal(calls.done, 1); assert.equal(sheet().props.visible, false);

  const offline = membershipActions({ leave: () => { throw new errors.ApiError(0, "NETWORK_ERROR", ""); } });
  const again = await render(offline.actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => offline.calls.done++ });
  await act(async () => again.root.findByType("Pressable").props.onPress());
  await act(async () => confirmButtons(again.root)[0].props.onPress());
  assert.deepEqual(alerts(again.root), ["تعذّرت المغادرة. حاول مرة ثانية."]); assert.equal(confirmButtons(again.root).length, 1);
});

test("a stale sheet after generation explains the lock, drops the button, stays open, and still refreshes", async () => {
  const locked = () => { throw new errors.ApiError(409, "MEMBERSHIP_LOCKED", ""); };
  const leaving = membershipActions({ leave: locked });
  let { root } = await render(leaving.actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => leaving.calls.done++ });
  await act(async () => root.findByType("Pressable").props.onPress());
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["بدأ اختيار المطعم، فما عاد ينفع تغيير المجموعة."]);
  assert.equal(confirmButtons(root).length, 0); assert.equal(root.findByType("SessionSheet").props.visible, true); assert.equal(leaving.calls.done, 1);

  const removing = membershipActions({ remove: locked });
  ({ root } = await render(removing.actions.RemoveSheet, { outingId: "o1", code: "TEST", person: khalid, onClose: () => removing.calls.closed++, onDone: () => removing.calls.done++ }));
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["بدأ اختيار المطعم، فما عاد ينفع تغيير المجموعة."]);
  assert.equal(confirmButtons(root).length, 0); assert.equal(removing.calls.closed, 0); assert.equal(removing.calls.done, 1);
});

test("remove names the person, sends their id, cannot close mid-request, and keeps the name while closing", async () => {
  const pending = deferred();
  const { actions, calls } = membershipActions({ remove: () => pending.promise });
  const props = { outingId: "o1", code: "TEST", person: khalid, onClose: () => calls.closed++, onDone: () => calls.done++ };
  const screen = await render(actions.RemoveSheet, props);
  const named = () => screen.root.findAll(node => node.type === "AppText" && node.props.children === "خالد").length;
  assert.equal(screen.root.findByType("SessionSheet").props.title, "إزالة مشارك؟"); assert.equal(named(), 1);
  let press;
  await act(async () => { press = confirmButtons(screen.root)[0].props.onPress(); });
  assert.equal(confirmButtons(screen.root)[0].props.disabled, true);
  await act(async () => screen.root.findByType("SessionSheet").props.onClose());
  assert.equal(calls.closed, 0);
  await act(async () => { pending.resolve(); await press; });
  assert.deepEqual(plain(calls.remove), [["o1", "p2", "T"]]); assert.equal(calls.closed, 1); assert.equal(calls.done, 1);
  await screen.update({ ...props, person: null });
  assert.equal(screen.root.findByType("SessionSheet").props.visible, false); assert.equal(named(), 1);
});

test("someone already gone is final, and closing clears the message for next time", async () => {
  const { actions, calls } = membershipActions({ remove: () => { throw new errors.ApiError(404, "PARTICIPANT_NOT_FOUND", ""); } });
  const { root } = await render(actions.RemoveSheet, { outingId: "o1", code: "TEST", person: { ...khalid, name: null }, onClose: () => calls.closed++, onDone: () => calls.done++ });
  assert(root.findAll(node => node.type === "AppText" && node.props.children === "مشارك").length === 1);
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["هذا المشارك ما عاد في الجلسة."]); assert.equal(confirmButtons(root).length, 0); assert.equal(calls.done, 1);
  await act(async () => root.findByType("QuietButton").props.onPress());
  assert.equal(calls.closed, 1); assert.deepEqual(alerts(root), []);
});