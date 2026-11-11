const test = require("node:test");
const assert = require("node:assert/strict");
const { load, render, native, shared, act, plain } = require("./helpers/render-feature.cjs");

const errors = load("shared/api/errors.ts");
const theme = load("shared/theme.ts");
const FULL = "اكتملت الجلسة: ٨ من ٨. لا يوجد مكان متاح الآن.";
const CLOSED = "بدأ توليد الاقتراحات وأُغلق الانضمام لهذه الجولة.";
const INVALID = "رمز الدعوة غير صالح. راجعه مع المنظّم.";
const JOINED = "تم انضمامك إلى «عشاء الخميس».";
const open = {
  outing_id: "o1", name: "عشاء الخميس", organizer_name: "سارة", starts_at: "2026-11-05T19:00:00+03:00",
  district: "012", status: "invite", participants_count: 3, can_join: true, join_blocked_reason: null,
};
const full = { ...open, participants_count: 8, can_join: false, join_blocked_reason: "OUTING_FULL" };
const closed = { ...open, status: "voting", can_join: false, join_blocked_reason: "JOINING_CLOSED" };
const apiError = (status, code) => new errors.ApiError(status, code, "");

// The join screen with fake API, account and storage; calls are recorded for checks.
function joinScreen({ preview = open, session = null, saved = null, link = {}, lookup, join, guest } = {}) {
  const calls = { lookup: [], join: [], guest: [], saved: [], routes: [], cleared: 0 };
  const Screen = load("features/sessions/JoinSessionScreen.tsx", {
    "expo-router": { useLocalSearchParams: () => link, router: { replace: value => calls.routes.push(value) } },
    "react-native": native,
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/shared/api/errors": errors,
    "@/shared/components": shared,
    "@/shared/theme": theme,
    "./components/SessionChrome": { SessionHeader: "Header" },
    "./components/SessionVisuals": { SessionMasthead: "Masthead", SessionPaper: "Paper", HailaTip: "HailaTip" },
    "@/features/auth": {
      loadSession: async () => session,
      clearSession: async () => { calls.cleared++; },
      isSessionEnded: error => error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED",
    },
    "./api/join": {
      lookupInvite: async code => { calls.lookup.push(code); return lookup ? lookup(code) : preview; },
      joinOuting: async (...args) => { calls.join.push(args); return join ? join() : { outing_id: "o1", participant_id: "m1" }; },
      joinOutingAsGuest: async (...args) => {
        calls.guest.push(args);
        return guest ? guest() : { outing_id: "o1", participant_id: "g1", guest_token: "token", status: "invite" };
      },
    },
    "./guestPass": {
      loadGuestPass: async () => saved,
      saveGuestPass: async (code, pass) => { calls.saved.push([code, pass]); },
    },
  }).JoinSessionScreen;
  return { Screen, calls };
}
const texts = root => root.findAllByType("AppText").map(node => [].concat(node.props.children).join(""));
const inputs = root => root.findAllByType("AppInput");
const type = (input, value) => act(async () => input.props.onChangeText(value));
const press = node => act(async () => node.props.onPress());
async function lookUp(root, code = "TEST") {
  await type(inputs(root)[0], code);
  await press(root.findByType("AppButton"));
}

test("a short code asks for the full code and sends nothing", async () => {
  const { Screen, calls } = joinScreen();
  const { root } = await render(Screen);
  await lookUp(root, "ab");
  assert.equal(calls.lookup.length, 0);
  assert(texts(root).includes("اكتب رمز الدعوة كاملًا."));
});

test("codes are cleaned, and a link code is looked up once on open", async () => {
  let { Screen, calls } = joinScreen();
  let { root } = await render(Screen);
  await type(inputs(root)[0], "t e-s٧");
  assert.equal(inputs(root)[0].props.value, "TES7");

  ({ Screen, calls } = joinScreen({ link: { code: "te st" } }));
  ({ root } = await render(Screen));
  assert.deepEqual(calls.lookup, ["TEST"]);
  assert(texts(root).includes("عشاء الخميس"));

  ({ Screen, calls } = joinScreen({ link: { code: ["AB", "CD"] } }));
  ({ root } = await render(Screen));
  assert.equal(calls.lookup.length, 0);
});

test("an unknown code, a join route that is not live and other failures read differently", async () => {
  for (const [error, message] of [
    [apiError(404, "OUTING_NOT_FOUND"), INVALID],
    [apiError(404, "MOCK_NOT_FOUND"), INVALID],
    [apiError(404, "UNKNOWN_ERROR"), "الانضمام برمز غير متاح حاليًا، وسيتوفر قريبًا."],
    [apiError(0, "NETWORK_ERROR"), "تعذّر التحقق من الدعوة. حاول مرة ثانية."],
  ]) {
    const { Screen } = joinScreen({ lookup: () => { throw error; } });
    const { root } = await render(Screen);
    await lookUp(root);
    assert(texts(root).includes(message), error.code);
  }
});

test("new guests see the server's reason for full and closed sessions", async () => {
  for (const [preview, message] of [[full, FULL], [closed, CLOSED]]) {
    const { Screen } = joinScreen({ preview });
    const { root } = await render(Screen);
    await lookUp(root);
    assert(texts(root).includes(message));
    assert(texts(root).includes("رمز الدعوة"));
  }
});

test("members and returning guests of the same outing are not blocked by the preview", async () => {
  let { Screen, calls } = joinScreen({ preview: full, session: { token: "T", userName: "فهد" } });
  let { root } = await render(Screen);
  await lookUp(root);
  assert(texts(root).includes("تنضم باسم حسابك: فهد"));
  await press(root.findByType("AppButton"));
  assert.deepEqual(calls.join[0], ["TEST", "T"]);
  assert(texts(root).includes(JOINED));

  ({ Screen, calls } = joinScreen({ preview: full, saved: { outing_id: "o1", participant_id: "g1", guest_token: "token" } }));
  ({ root } = await render(Screen));
  await lookUp(root);
  assert(texts(root).includes(JOINED));
  assert.equal(calls.guest.length, 0);

  ({ Screen } = joinScreen({ preview: full, saved: { outing_id: "old", participant_id: "g1", guest_token: "token" } }));
  ({ root } = await render(Screen));
  await lookUp(root);
  assert(texts(root).includes(FULL));
});

test("a guest sees a clean card, needs a name, joins with the trimmed name and the pass is saved", async () => {
  const { Screen, calls } = joinScreen({ preview: { ...open, organizer_name: null } });
  const { root } = await render(Screen);
  await lookUp(root);
  assert(texts(root).includes("دعوة من المنظّم"));
  assert(!texts(root).some(text => text.includes("012")));
  assert.equal(inputs(root)[0].props.maxLength, 40);
  await press(root.findByType("AppButton"));
  assert(texts(root).includes("اكتب اسمك قبل الانضمام."));
  assert.equal(calls.guest.length, 0);

  await type(inputs(root)[0], "  فهد  ");
  await press(root.findByType("AppButton"));
  assert.deepEqual(calls.guest[0], ["TEST", "فهد"]);
  assert.equal(calls.saved[0][0], "TEST");
  assert.equal(calls.saved[0][1].guest_token, "token");
  assert(texts(root).includes(JOINED));
  await press(root.findAllByType("AppButton").find(node => node.props.title === "افتح الجلسة"));
  assert.deepEqual(plain(calls.routes[0]), { pathname: "/sessions/[id]", params: { id: "o1", code: "TEST" } });
});

test("join failures: 409 goes back to the code, an ended sign-in continues as a guest, others keep the form", async () => {
  let { Screen } = joinScreen({ guest: () => { throw apiError(409, "OUTING_FULL"); } });
  let { root } = await render(Screen);
  await lookUp(root);
  await type(inputs(root)[0], "فهد");
  await press(root.findByType("AppButton"));
  assert(texts(root).includes(FULL));
  assert.equal(inputs(root)[0].props.value, "TEST");

  let calls;
  ({ Screen, calls } = joinScreen({ session: { token: "T", userName: "فهد" }, join: () => { throw apiError(401, "INVALID_TOKEN"); } }));
  ({ root } = await render(Screen));
  await lookUp(root);
  await press(root.findByType("AppButton"));
  assert.equal(calls.cleared, 1);
  assert(texts(root).includes("انتهى دخولك. اكتب اسمك وانضم كضيف."));
  assert(texts(root).includes("اسمك في الجلسة"));

  ({ Screen } = joinScreen({ guest: () => { throw apiError(0, "NETWORK_ERROR"); } }));
  ({ root } = await render(Screen));
  await lookUp(root);
  await type(inputs(root)[0], "فهد");
  await press(root.findByType("AppButton"));
  assert(texts(root).includes("تعذّر الاتصال. بياناتك باقية، حاول مرة ثانية."));
  assert.equal(inputs(root)[0].props.value, "فهد");
  await press(root.findByType("Pressable"));
  assert.equal(inputs(root)[0].props.value, "TEST");
});

test("the API wrapper encodes the code and rejects responses the screen cannot use", async () => {
  const paths = [];
  const api = reply => load("features/sessions/api/join.ts", {
    "@/shared/api/client": { request: async (method, path) => { paths.push(`${method} ${path}`); return reply; } },
    "@/shared/api/errors": errors,
  });
  assert.equal((await api(open).lookupInvite("A B")).outing_id, "o1");
  assert.equal((await api({ ...open, organizer_name: null }).lookupInvite("TEST")).organizer_name, null);
  assert.equal(paths[0], "GET /outings/by-code/A%20B");

  const { can_join, ...noDecision } = open;
  await assert.rejects(api(noDecision).lookupInvite("TEST"), { code: "INVALID_RESPONSE" });
  await assert.rejects(api({ outing_id: "o1", status: "invite" }).joinOuting("TEST", "T"), { code: "INVALID_RESPONSE" });
  await assert.rejects(api({ outing_id: "o1", participant_id: "g1" }).joinOutingAsGuest("TEST", "فهد"), { code: "INVALID_RESPONSE" });
});

test("mock mode answers like the server for each test code", async () => {
  const transport = load("shared/api/mockTransport.ts", { "./errors": errors });
  load("features/sessions/mocks.ts", { "@/shared/api/errors": errors, "@/shared/api/mockTransport": transport }).registerSessionsMocks();
  const call = (method, path) => transport.mockTransport(method, path);

  assert.equal((await call("GET", "/outings/by-code/TEST")).can_join, true);
  assert.equal((await call("POST", "/outings/TEST/join-guest")).guest_token, "mock-guest-token-TEST");
  await assert.rejects(call("POST", "/outings/MAXX/join"), { status: 409, code: "OUTING_FULL" });
  await assert.rejects(call("POST", "/outings/SHUT/join-guest"), { status: 409, code: "JOINING_CLOSED" });
  await assert.rejects(call("GET", "/outings/by-code/ABCD"), { status: 404 });
});

test("the guest pass keeps three fields and ignores broken saved values", async () => {
  const saved = new Map();
  const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const store = load("features/sessions/guestPass.ts", { "react-native": { Platform: { OS: "web" } }, "expo-secure-store": {} }, { globalThis: { localStorage } });

  assert.equal(await store.loadGuestPass("TEST"), null);
  await store.saveGuestPass("TEST", { outing_id: "o1", participant_id: "g1", guest_token: "token", status: "invite" });
  assert.deepEqual(JSON.parse(saved.get("thouq.guest.TEST")), { outing_id: "o1", participant_id: "g1", guest_token: "token" });
  assert.deepEqual(plain(await store.loadGuestPass("TEST")), { outing_id: "o1", participant_id: "g1", guest_token: "token" });
  saved.set("thouq.guest.BAD1", "{not json");
  saved.set("thouq.guest.BAD2", JSON.stringify({ outing_id: "o1" }));
  assert.equal(await store.loadGuestPass("BAD1"), null);
  assert.equal(await store.loadGuestPass("BAD2"), null);
});

test("a joined guest can continue if storage is blocked, and a rejected pass cannot be loaded again", async () => {
  const old = { outing_id: "o1", participant_id: "g1", guest_token: "expired" };
  const localStorage = { getItem: () => JSON.stringify(old), setItem: () => { throw Error("blocked"); }, removeItem: () => { throw Error("blocked"); } };
  const store = load("features/sessions/guestPass.ts", { "react-native": { Platform: { OS: "web" } }, "expo-secure-store": {} }, { globalThis: { localStorage } });
  const fresh = { ...old, guest_token: "fresh" };
  await store.saveGuestPass("TEST", fresh);
  assert.deepEqual(plain(await store.loadGuestPass("TEST")), fresh);
  await store.removeGuestPass("TEST");
  assert.equal(await store.loadGuestPass("TEST"), null);
  await store.saveGuestPass("TEST", fresh);
  assert.equal((await store.loadGuestPass("TEST")).guest_token, "fresh");
});
