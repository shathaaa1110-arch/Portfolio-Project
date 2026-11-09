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
    "./access": { outingToken: async () => token },
    "./guestPass": { forgetGuestPass: async outingId => { calls.forgot.push(outingId); } },
    "./api/state": {
      loadOutingState: async () => { calls.load++; return reply ? reply(calls.load) : { name: `poll ${calls.load}` }; },
    },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const view = {};
  function Screen() { Object.assign(view, hook.useSessionState("o1")); return null; }
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
  assert.deepEqual(calls.forgot, ["o1"]);
  await clock.advance(20000); assert.equal(calls.load, 4);
  await act(async () => view.refresh()); await clock.advance(0); assert.equal(calls.load, 5);
});

test("without a pass for the outing it reports NO_ACCESS and asks nothing", async () => {
  const { clock, calls, view, open } = polling({ token: null });
  await open();
  assert.equal(view.error.code, "NO_ACCESS"); assert.equal(calls.load, 0); assert.equal(clock.pending(), 0);
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
function lobbyScreen({ params = { id: "o1" }, start } = {}) {
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
    "./access": { outingToken: async () => "T" },
    "./api/state": { startPreferences: async (...args) => { calls.start.push(args); return start ? start() : { status: "preferences" }; } },
    "./components/InviteCard": { InviteCard: component("InviteCard", { Share: { share: async () => {} } }) },
    "./components/ParticipantRow": { ParticipantRow: component("ParticipantRow") },
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
  assert.deepEqual(lobby.calls.push, ["/session-preferences?id=o1"]);
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
  assert.deepEqual(late.calls.push, ["/session-preferences?id=o1"]);
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