const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { load, render, native, shared, act, deferred, plain } = require("./helpers/render-feature.cjs");
const errors = load("shared/api/errors.ts");
const theme = load("shared/theme.ts");
const model = load("features/sessions/model.ts", { "@/shared/api/errors": errors });
const preferenceModel = load("features/preferences/model.ts", { "./validation": load("features/preferences/validation.ts") });
const preferences = { is_saved: true, preferences_done: false, liked_cuisines: ["grill"], allergies: ["peanuts"],
  budget_min: 60, budget_max: 120, max_distance_km: 5, seating_needs: "هادئ" };
const error = code => new errors.ApiError(409, code, "");

test("create input uses the selected district ID and Riyadh offset; invalid dates and past/out-of-range times never pass", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  assert.deepEqual(plain(model.sessionInput(" عشاء ", "2026-11-07", "٢٠:٣٠", "00100001141", now)),
    { name: "عشاء", starts_at: "2026-11-07T20:30:00+03:00", district: "00100001141" });
  for (const args of [
    ["", "2026-11-07", "20:30", "001"], ["عشاء", "2026-11-07", "20:30", ""],
    ["عشاء", "2026-02-30", "20:30", "001"], ["عشاء", "2026-11-07", "25:10", "001"],
    ["عشاء", "2026-11-06", "10:00", "001"], ["عشاء", "2027-02-01", "20:30", "001"],
  ]) assert.throws(() => model.sessionInput(...args, now));
  assert.equal(model.riyadhDate(new Date("2026-11-06T22:00:00Z")), "2026-11-07");
});

test("create API sends only the contract fields with the account token and rejects a partial success", async () => {
  const calls = [];
  let response = { outing_id: "o1", invite_code: "ABCD", invite_url: null, status: "invite" };
  const api = load("features/sessions/api/create.ts", {
    "@/shared/api/client": { request: async (...args) => { calls.push(args); return response; } }, "@/shared/api/errors": errors,
  });
  const input = { name: "عشاء", starts_at: "2026-11-07T20:30:00+03:00", district: "001" };
  await api.createSession("account-token", input);
  assert.deepEqual(plain(calls), [["POST", "/outings/session", { token: "account-token", body: input }]]);
  response = { ...response, status: "voting" };
  await assert.rejects(api.createSession("T", input), { code: "INVALID_RESPONSE" });
});

async function createHarness(t, session = { token: "T" }) {
  const calls = [], routes = [];
  const Screen = load("features/sessions/CreateSessionScreen.tsx", {
    "react-native": native, "expo-image": { Image: "Image" },
    "expo-router": { router: { replace: route => routes.push(route), push: route => routes.push(route) } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/features/auth": { loadSession: async () => session }, "@/shared/components": shared,
    "@/shared/api/config": { USE_MOCK: false }, "@/shared/api/errors": errors, "@/shared/theme": theme,
    "./model": model, "./components/SessionChrome": { SessionHeader: "Header", SessionIcon: "Icon" },
    "./components/SessionEditors": { SessionEditors: "Editors" },
    "./components/SessionLayout": { SessionFooter: "Footer", room: {} },
    "./api/create": { createSession: (token, body) => { const pending = deferred(); calls.push({ token, body, ...pending }); return pending.promise; } },
  }).CreateSessionScreen;
  const screen = await render(Screen); t.after(() => screen.close());
  const submit = () => screen.root.findAllByType("Pressable").find(x => ["إنشاء الجلسة", "تسجيل الدخول لإنشاء الجلسة"].includes(x.props.accessibilityLabel));
  const editors = () => screen.root.findByType("Editors");
  return { screen, submit, editors, calls, routes };
}

test("create keeps edited values after a failed request, blocks duplicate taps, and navigates only after success", async t => {
  const h = await createHarness(t);
  await act(async () => h.editors().props.onDistrict({ id: "001", name_ar: "الملقا" }));
  let first, duplicate;
  await act(async () => { first = h.submit().props.onPress(); duplicate = h.submit().props.onPress(); });
  assert.equal(h.calls.length, 1);
  assert.equal(h.routes.length, 0);
  await act(async () => { h.calls[0].reject(error("OUTINGS_UNAVAILABLE")); await first; await duplicate; });
  assert.equal(h.submit().props.disabled, false);
  let retry;
  await act(async () => { retry = h.submit().props.onPress(); });
  assert.deepEqual(plain(h.calls[1].body), plain(h.calls[0].body));
  await act(async () => { h.calls[1].resolve({ outing_id: "o1", invite_code: "ABCD", invite_url: null }); await retry; });
  assert.equal(h.routes[0].pathname, "/sessions/[id]");
  assert.equal(h.routes[0].params.code, "ABCD");
});

test("creation without an account preserves the draft and starts sign-in instead of sending a request", async t => {
  const h = await createHarness(t, null);
  await act(async () => h.editors().props.onDistrict({ id: "001", name_ar: "الملقا" }));
  await act(async () => h.submit().props.onPress());
  assert.equal(h.calls.length, 0);
  await act(async () => h.submit().props.onPress());
  assert.deepEqual(plain(h.routes), [{ pathname: "/login", params: { returnTo: "/sessions/new" } }]);
});

async function roomHarness(t, { organizer = true, pref = preferences, generation } = {}) {
  const calls = []; let currentToken = "T";
  let state = { outing_id: "o1", name: "عشاء", starts_at: "2026-11-11T20:30:00+03:00", status: "preferences", district: "001", invite_code: "ABCD",
    me: { participant_id: "p1", is_organizer: organizer }, actions: [], readiness: { ready_count: 0, total_count: 1 },
    participants: [{ participant_id: "p1", name: "شذى", attendance: "confirmed", preferences_done: false, is_organizer: organizer }] };
  const api = {
    getOuting: async () => structuredClone(state), getOutingPreferences: async () => pref,
    getPlan: async () => { throw Error("No plan should be read"); },
    startPreferences: async () => { calls.push("start"); },
    saveOutingPreferences: async (id, token, body) => { calls.push({ method: "save", id, token, body }); },
    markOutingReady: async (id, token) => { calls.push({ method: "ready", id, token }); state.participants[0].preferences_done = true; state.readiness.ready_count = 1; state.actions = organizer ? ["start_voting"] : []; },
    generatePlan: async () => { calls.push("generate"); if (generation) return generation.promise; return { outing_id: "o1", status: "preferences", plan_items: [], allergy_warning: [] }; },
  };
  const Screen = load("features/sessions/SessionScreen.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { router: {}, useLocalSearchParams: () => ({ id: "o1", code: "ABCD" }), useFocusEffect: callback => React.useEffect(callback, [callback]) },
    "@/features/preferences": { ...preferenceModel, PreferencesForm: "PreferencesForm" }, "@/features/restaurants": { RestaurantCard: "RestaurantCard" },
    "@/shared/components": shared, "@/shared/api/errors": errors, "@/shared/api/config": { USE_MOCK: false }, "@/shared/theme": theme,
    "./api/outing": api, "./identity": { outingToken: async () => currentToken }, "./model": model,
    "./guestPass": { loadGuestPass: async () => null, removeGuestPass: async () => {} },
    "./components/SessionVisuals": { SessionMasthead: "Masthead", SessionPaper: "Paper", SessionSteps: "Steps", HailaTip: "HailaTip" },
    "./components/SessionChrome": { SessionHeader: "Header", SessionIcon: "Icon", SessionSheet: "Sheet" },
    "./components/SessionLayout": { SessionFooter: "Footer", QuietButton: "QuietButton", SessionSummary: "Summary", room: {} },
    "expo-image": { Image: "Image" }, "./SessionVoting": { SessionVoting: "Voting" }, "./SessionGenerating": { SessionGenerating: "Generating" },
  }).SessionScreen;
  const screen = await render(Screen); t.after(() => screen.close());
  const button = title => screen.root.findAll(x => ["AppButton", "QuietButton"].includes(x.type)).find(x => x.props.title === title);
  return { screen, calls, button, changeAccount: () => { currentToken = "different-account"; } };
}

test("server actions gate generation; the last Ready does not generate automatically", async t => {
  const h = await roomHarness(t);
  assert.equal(h.button("نبدأ التصويت").props.disabled, true);
  await act(async () => h.button("اعتماد تفضيلاتي · أنا جاهز").props.onPress());
  assert.equal(h.calls.filter(x => x === "generate").length, 0);
  assert.equal(h.button("نبدأ التصويت").props.disabled, false);
  await act(async () => h.button("نبدأ التصويت").props.onPress());
  assert.equal(h.calls.filter(x => x === "generate").length, 1);
  assert(h.screen.root.findAllByType("AppText").some(x => String(x.props.children).includes("ما لقينا مطعمًا")));
});

test("a member cannot see organizer generation controls", async t => {
  const h = await roomHarness(t, { organizer: false });
  assert.equal(h.button("نبدأ التصويت"), undefined);
  await act(async () => h.button("اعتماد تفضيلاتي · أنا جاهز").props.onPress());
  assert.equal(h.button("نبدأ التصويت"), undefined);
});

test("editing the plate sends the entire outing preference copy, preserves limits/allergies and confirms readiness after saving", async t => {
  const h = await roomHarness(t);
  await act(async () => h.button("تعديل ذوقي وتفضيلاتي").props.onPress());
  const form = h.screen.root.findByType("PreferencesForm");
  const draft = { ...form.props.initialValue, selectedFoodTypes: ["seafood"] };
  await act(async () => form.props.onSubmit(draft));
  assert.deepEqual(plain(h.calls[0]), { method: "save", id: "o1", token: "T", body: {
    liked_cuisines: ["seafood"], allergies: ["peanuts"], budget_min: 60, budget_max: 120, max_distance_km: 5, seating_needs: "هادئ",
  } });
  assert.equal(h.calls[1].method, "ready");
});

test("an account switch cannot save another person's loaded outing draft", async t => {
  const h = await roomHarness(t);
  await act(async () => h.button("تعديل ذوقي وتفضيلاتي").props.onPress());
  h.changeAccount();
  const form = h.screen.root.findByType("PreferencesForm");
  await act(async () => form.props.onSubmit(form.props.initialValue));
  assert.equal(h.calls.length, 0);
  assert(h.screen.root.findByType("PreferencesForm").props.error);
});

test("outing APIs preserve the guest token and isolate preference PUT from account defaults", async () => {
  const calls = [];
  const api = load("features/sessions/api/outing.ts", {
    "@/shared/api/errors": errors,
    "@/shared/api/client": { request: async (...args) => { calls.push(args); return { preferences_done: false }; } },
  });
  const { is_saved, preferences_done, ...body } = preferences;
  await api.saveOutingPreferences("outing-id", "guest-token", body);
  assert.deepEqual(plain(calls), [["PUT", "/outings/outing-id/preferences", { token: "guest-token", body }]]);
});

test("return-to after sign-in is allowlisted and onboarding remains required for new accounts", () => {
  const routes = [];
  const navigation = load("features/auth/navigation.ts", { "expo-router": { router: { replace: v => routes.push(v) } } });
  navigation.goToApp(true, "/sessions/new"); navigation.goToApp(false, "/sessions/new"); navigation.goToApp(true, "https://elsewhere.invalid");
  assert.deepEqual(plain(routes), ["/sessions/new", { pathname: "/preferences", params: { onboarding: "1", returnTo: "/sessions/new" } }, "/"]);
});

test("mock flow reflects membership/readiness gates and locks preferences after generation", async () => {
  const transport = load("shared/api/mockTransport.ts", { "./errors": errors });
  transport.registerMock("GET", "/users/me", () => ({ name: "شذى" }));
  transport.registerMock("GET", "/users/me/preferences", () => preferences);
  load("features/sessions/flowMocks.ts", { "@/shared/api/errors": errors, "@/shared/api/mockTransport": transport }).registerSessionFlowMocks({ generationDelayMs: 0 });
  const call = (method, path, body, token = "owner") => transport.mockTransport(method, path, body, token);
  const created = await call("POST", "/outings/session", { name: "عشاء", starts_at: "2026-11-11T20:30:00+03:00", district: "preview-malqa" });
  const path = `/outings/${created.outing_id}`;
  const guest = await call("POST", `/outings/${created.invite_code}/join-guest`, { guest_name: "ضيف" });
  await call("POST", `${path}/start-preferences`);
  await call("POST", `${path}/preferences/ready`);
  await assert.rejects(call("POST", `${path}/start-voting`), { code: "NOT_EVERYONE_READY" });
  await call("PUT", `${path}/preferences`, preferences, guest.guest_token);
  await call("POST", `${path}/preferences/ready`, undefined, guest.guest_token);
  await assert.rejects(call("POST", `${path}/start-voting`, undefined, guest.guest_token), { code: "ORGANIZER_ONLY" });
  const plan = await call("POST", `${path}/start-voting`);
  assert.equal(plan.status, "voting");
  await assert.rejects(call("PUT", `${path}/preferences`, preferences), { code: "PREFERENCES_LOCKED" });
  assert.deepEqual(plain(await call("GET", `${path}/plan`, undefined, guest.guest_token)), plain(plan));
});


test("generation screen lasts for the real request and returns to readiness on a failed request", async t => {
  const generation = deferred();
  const h = await roomHarness(t, { generation });
  await act(async () => h.button("اعتماد تفضيلاتي · أنا جاهز").props.onPress());
  let pending;
  await act(async () => { pending = h.button("نبدأ التصويت").props.onPress(); });
  assert.equal(h.screen.root.findAllByType("Generating").length, 1);
  assert.equal(h.calls.filter(x => x === "generate").length, 1);
  await act(async () => { generation.reject(error("PLAN_UNAVAILABLE")); await pending; });
  assert.equal(h.screen.root.findAllByType("Generating").length, 0);
  assert.equal(h.button("نبدأ التصويت").props.disabled, true);
  assert(h.button("تحديث حالة الجلسة"));
});

test("a successful empty plan leaves the generation screen without changing anyone's limits", async t => {
  const generation = deferred();
  const h = await roomHarness(t, { generation });
  await act(async () => h.button("اعتماد تفضيلاتي · أنا جاهز").props.onPress());
  let pending;
  await act(async () => { pending = h.button("نبدأ التصويت").props.onPress(); });
  assert.equal(h.screen.root.findAllByType("Generating").length, 1);
  await act(async () => { generation.resolve({ plan_items: [] }); await pending; });
  assert.equal(h.screen.root.findAllByType("Generating").length, 0);
  assert(h.screen.root.findAllByType("AppText").some(x => String(x.props.children).includes("ما لقينا مطعمًا")));
  assert.equal(h.calls.filter(x => x.method === "save").length, 0);
});
