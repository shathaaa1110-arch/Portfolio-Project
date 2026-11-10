const test = require("node:test");
const assert = require("node:assert/strict");
const { load, render, native, shared, deferred, act, plain } = require("./helpers/render-feature.cjs");
const errors = load("shared/api/errors.ts");
const validation = load("features/preferences/validation.ts");
const model = load("features/preferences/model.ts", { "./validation": validation });
const requestErrors = load("features/preferences/errors.ts", { "@/shared/api/errors": errors });
const theme = load("shared/theme.ts");
const saved = { liked_cuisines: [], allergies: [], budget_min: null, budget_max: null,
  max_distance_km: null, seating_needs: null, is_saved: false };

test("first successful login starts preferences; completed accounts open Home", () => {
  const routes = [];
  const navigation = load("features/auth/navigation.ts", { "expo-router": { router: { replace: route => routes.push(route) } } });
  navigation.goToApp(false); navigation.goToApp(true);
  assert.deepEqual(plain(routes), [{ pathname: "/preferences", params: { onboarding: "1" } }, "/"]);
});

test("marking saved preferences cannot change a different or expired account", async () => {
  let stored = JSON.stringify({ token: "A", expiresAt: Date.now() + 60000, userName: "test", hasSavedPreferences: false });
  const session = load("features/auth/session.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": {
      getItemAsync: async () => stored, setItemAsync: async (_, value) => { stored = value; },
      deleteItemAsync: async () => { stored = null; },
    },
    "@/shared/api/errors": errors, "./api": { logout: async () => {} },
  });
  assert.equal(await session.markPreferencesSaved("B"), false);
  assert.equal(JSON.parse(stored).hasSavedPreferences, false);
  assert.equal(await session.markPreferencesSaved("A"), true);
  assert.equal(JSON.parse(stored).hasSavedPreferences, true);
  stored = JSON.stringify({ token: "A", expiresAt: 0 });
  assert.equal(await session.markPreferencesSaved("A"), false);
  assert.equal(stored, null);
});

test("allergy constraints match #142, including Unicode length and total after deduplication", () => {
  const draft = model.emptyPreferences();
  draft.allergyChoices = { selected: ["other"], otherText: "🥝".repeat(50), noAllergies: false };
  assert.equal(model.getDraftError(draft), "");
  draft.allergyChoices.otherText += "🥝";
  assert.match(model.getDraftError(draft), /٥٠/);
  draft.allergyChoices.otherText = Array.from({ length: 21 }, (_, i) => "allergy " + i).join("\n");
  assert.match(model.getDraftError(draft), /٢٠/);
  draft.allergyChoices.otherText = Array(21).fill("كيوي").join("\n");
  assert.equal(model.getDraftError(draft), "");
  assert.deepEqual(plain(model.toPreferencesPayload(draft).allergies), ["كيوي"]);
});

test("nested backend validation errors identify the Arabic form field once", () => {
  const message = requestErrors.preferencesErrorMessage(new errors.ApiError(422, "VALIDATION_ERROR", "", ["body.allergies.0", "allergies.1", "budget_min"]));
  assert.equal(message, "راجع هذه القيم: الحساسية، أقل ميزانية.");
  for (const status of [401, 404, 503]) assert(requestErrors.preferencesErrorMessage(new errors.ApiError(status, "", "")));
});

function formModule() {
  return load("features/preferences/PreferencesForm.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "./model": model, "./validation": validation, "@/shared/components": shared, "@/shared/theme": theme,
    "expo-symbols": { SymbolView: "SymbolView" }, "expo-image": { Image: "Image" },
    "./steps": load("features/preferences/steps.ts"),
    "./cuisineOptions": { cuisineOptions: [{ id: "saudi_gulf", label: "سعودي وخليجي", image: 1 }] },
    "./foodTypes": { foodTypeOptions: [{ id: "grills", label: "مشويات", image: 1 }] },
    ...Object.fromEntries(["FoodPlate", "DistanceFields", "FoodTypeCard", "PreferencesProgress", "CuisineCard", "SeatingChoices", "AllergyChoices"]
      .map(name => ["./components/" + name, { [name]: name }])),
  });
}

test("all six steps work, preserve choices, validate budget/distance and submit only on Save", async () => {
  const submitted = [];
  const { PreferencesForm } = formModule();
  const h = await render(PreferencesForm, { initialValue: model.emptyPreferences(), onExit() {}, onSubmit: value => submitted.push(value) });
  const next = () => h.root.findAllByType("AppButton").find(item => ["التالي", "حفظ تفضيلاتي"].includes(item.props.title));
  const step = () => h.root.findByType("PreferencesProgress").props.stepIndex;
  const advance = () => act(async () => next().props.onPress());
  await act(async () => h.root.findAllByType("CuisineCard")[0].props.onPress());
  await advance();
  assert.equal(step(), 1);
  await act(async () => h.root.findByType("FoodTypeCard").props.onPress());
  assert.deepEqual(plain(h.root.findByType("FoodPlate").props.selectedFoodTypes), ["grills"]);
  await advance();
  assert.equal(h.root.findAllByType("FoodPlate").length, 0); // Hidden images are unmounted.
  await act(async () => h.root.findByType("SeatingChoices").props.onChange(["families"]));
  await advance();
  const inputs = h.root.findAllByType("AppInput");
  await act(async () => { inputs[0].props.onChangeText("١٢٠"); inputs[1].props.onChangeText("٦٠"); });
  assert.equal(next().props.disabled, true);
  await advance(); assert.equal(step(), 3);
  await act(async () => h.root.findAllByType("AppInput")[1].props.onChangeText("١٥٠"));
  assert.equal(next().props.disabled, false);
  await advance();
  await act(async () => h.root.findByType("DistanceFields").props.onChange("٠"));
  assert.equal(next().props.disabled, true);
  await act(async () => h.root.findByType("DistanceFields").props.onUnlimitedChange(true));
  await advance();
  assert.equal(step(), 5);
  assert.equal(submitted.length, 0);
  await act(async () => h.root.findByType("AllergyChoices").props.onChange({ selected: ["other"], otherText: "", noAllergies: false }));
  assert.equal(next().props.disabled, true);
  await act(async () => h.root.findByType("AllergyChoices").props.onChange({ selected: ["milk"], otherText: "", noAllergies: false }));
  await advance();
  assert.equal(submitted.length, 1);
  assert.deepEqual(plain(model.toPreferencesPayload(submitted[0])), {
    liked_cuisines: ["saudi_gulf", "grill"], allergies: ["milk"], budget_min: 120, budget_max: 150,
    max_distance_km: null, seating_needs: "عائلات",
  });
  await act(async () => h.root.findAllByType("Pressable").at(-1).props.onPress());
  assert.equal(h.root.findByType("DistanceFields").props.value, "٠");
  await h.close();
});

async function accountHarness({ isSaved = false, onboarding, loadFailure } = {}) {
  let token = "A";
  const writes = [], routes = [], marks = [];
  const { AccountPreferencesScreen } = load("features/preferences/AccountPreferencesScreen.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useLocalSearchParams: () => ({ onboarding }), router: { replace: route => routes.push(route) } },
    "@/features/auth": { loadSession: async () => token ? { token } : null, markPreferencesSaved: async value => { marks.push(value); return value === token; } },
    "@/shared/api/config": { USE_MOCK: false }, "@/shared/api/errors": errors,
    "@/shared/components": shared, "@/shared/theme": theme,
    "./api": { getAccountPreferences: async () => { if (loadFailure) throw loadFailure; return { ...saved, is_saved: isSaved }; },
      saveAccountPreferences: (owner, payload) => { const result = deferred(); writes.push({ owner, payload, ...result }); return result.promise; } },
    "./model": model, "./errors": requestErrors, "./PreferencesForm": { PreferencesForm: "PreferencesForm" },
  });
  const screen = await render(AccountPreferencesScreen);
  return { screen, writes, routes, marks, changeAccount(value) { token = value; },
    form: () => screen.root.findByType("PreferencesForm") };
}

test("save ignores double taps, keeps the form on failure and navigates only after success", async () => {
  const h = await accountHarness();
  const draft = model.emptyPreferences(); draft.budgetMin = "٦٠";
  let first, duplicate;
  await act(async () => { first = h.form().props.onSubmit(draft); duplicate = h.form().props.onSubmit(draft); });
  assert.equal(h.writes.length, 1);
  assert.equal(h.form().props.isSaving, true);
  assert.equal(h.routes.length, 0);
  await act(async () => { h.writes[0].reject(new errors.ApiError(503, "PREFERENCES_UNAVAILABLE", "")); await first; await duplicate; });
  assert(h.form().props.error);
  assert.equal(h.form().props.isSaving, false);
  assert.equal(h.marks.length, 0);
  let retry;
  await act(async () => { retry = h.form().props.onSubmit(draft); });
  assert.equal(h.writes[1].payload.budget_min, 60);
  await act(async () => { h.writes[1].resolve({ message: "saved" }); await retry; });
  assert.deepEqual(h.routes, ["/"]);
  assert.deepEqual(h.marks, ["A"]);
  await h.screen.close();
});

test("account changes never send the loaded draft to the new account", async () => {
  const h = await accountHarness();
  h.changeAccount("B");
  await act(async () => h.form().props.onSubmit(model.emptyPreferences()));
  assert.equal(h.writes.length, 0);
  assert.equal(typeof h.form().props.onSignIn, "function");
  assert.match(h.form().props.error, /انتهت/);
  await h.screen.close();
});

test("completed onboarding skips the form; an unavailable backend still allows browsing", async () => {
  const h = await accountHarness({ isSaved: true, onboarding: "1" });
  assert.deepEqual(h.routes, ["/"]);
  await h.screen.close();
  const unavailable = await accountHarness({ loadFailure: new errors.ApiError(404, "NOT_FOUND", "") });
  assert.equal(unavailable.screen.root.findAllByType("PreferencesForm").length, 0);
  await act(async () => unavailable.screen.root.findAllByType("AppButton").find(item => item.props.title === "العودة للتصفح").props.onPress());
  assert.deepEqual(unavailable.routes, ["/"]);
  await unavailable.screen.close();
});
