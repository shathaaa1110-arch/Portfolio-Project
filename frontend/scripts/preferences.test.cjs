const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Run pure TypeScript modules without loading React Native or making requests.
const sourceRoot = path.join(__dirname, "../src");
function load(relativePath, imports = {}) {
  const filename = path.join(sourceRoot, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected test import: ${name}`);
      return imports[name];
    },
  }, { filename });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const validation = load("features/preferences/validation.ts");
const model = load("features/preferences/model.ts", { "./validation": validation });
const errors = load("shared/api/errors.ts");
const payload = {
  liked_cuisines: ["saudi_gulf", "grill"], allergies: ["milk"],
  budget_min: 60, budget_max: 120, max_distance_km: 2.5, seating_needs: "عائلات",
};
const saved = { ...payload, is_saved: true };
function apiWith(request) {
  return load("features/preferences/api.ts", {
    "@/shared/api/client": { request }, "@/shared/api/errors": errors,
  });
}

test("converts Arabic and Persian numbers and food keys", () => {
  const draft = model.emptyPreferences();
  Object.assign(draft, {
    selectedCuisines: ["saudi_gulf"],
    selectedFoodTypes: ["grills", "sandwiches", "coffee-tea", "desserts", "juices"],
    budgetMin: "٦٠", budgetMax: "۱۲۰", maxDistance: "٢٫٥",
  });
  const result = plain(model.toPreferencesPayload(draft));
  assert.deepEqual(result.liked_cuisines, ["saudi_gulf", "grill", "sandwich", "coffee_tea", "sweets", "juice"]);
  assert.equal(result.budget_min, 60);
  assert.equal(result.budget_max, 120);
  assert.equal(result.max_distance_km, 2.5);
  assert.equal("is_saved" in result, false);
  assert.equal("user_id" in result, false);
});

test("empty and no-limit answers send null instead of zero", () => {
  const draft = model.emptyPreferences();
  assert.equal(model.toPreferencesPayload(draft).budget_max, null);
  Object.assign(draft, { budgetMin: "60", budgetMax: "120", maxDistance: "5", isBudgetUnlimited: true, isDistanceUnlimited: true });
  const result = model.toPreferencesPayload(draft);
  assert.equal(result.budget_min, null);
  assert.equal(result.budget_max, null);
  assert.equal(result.max_distance_km, null);
  draft.isBudgetUnlimited = false;
  draft.budgetMin = "0";
  assert.equal(model.toPreferencesPayload(draft).budget_min, 0);
});

test("rejects invalid budget and distance values before saving", () => {
  const draft = model.emptyPreferences();
  for (const [min, max] of [["120", "60"], ["-1", ""], ["2.5", ""], ["abc", ""], ["2147483648", ""]]) {
    Object.assign(draft, { budgetMin: min, budgetMax: max });
    assert.notEqual(model.getDraftError(draft), "");
    assert.throws(() => model.toPreferencesPayload(draft));
  }
  Object.assign(draft, { budgetMin: "", budgetMax: "" });
  for (const distance of ["0", "-5", "abc", "1e3"]) {
    draft.maxDistance = distance;
    assert.notEqual(model.getDraftError(draft), "");
  }
});

test("restores known choices and preserves custom allergies and seating text", () => {
  const existing = {
    ...saved,
    liked_cuisines: ["saudi_gulf", "grill", "coffee_tea", "new_cuisine"],
    allergies: ["milk", "كيوي", "نوع مخصص"],
    seating_needs: "عائلات، هادئ، قرب النافذة",
  };
  const draft = model.fromAccountPreferences(existing);
  assert.deepEqual(plain(draft.selectedFoodTypes), ["grills", "coffee-tea"]);
  assert.deepEqual(plain(draft.allergyChoices.selected), ["milk", "other"]);
  assert.equal(draft.allergyChoices.otherText, "كيوي\nنوع مخصص");
  assert.equal(draft.seatingNotes, "قرب النافذة");
  const result = plain(model.toPreferencesPayload(draft));
  assert.deepEqual(result.liked_cuisines.sort(), [...existing.liked_cuisines].sort());
  assert.deepEqual(result.allergies, existing.allergies);
  assert.equal(result.seating_needs, existing.seating_needs);
});

test("does not treat a missing allergy answer as confirmed no allergies", () => {
  const draft = model.fromAccountPreferences({ ...saved, allergies: [] });
  assert.equal(draft.allergyChoices.noAllergies, false);
  draft.allergyChoices = { selected: [], otherText: "", noAllergies: true };
  assert.deepEqual(plain(model.toPreferencesPayload(draft).allergies), []);
});

test("requires Other details and limits combined seating text to 200 characters", () => {
  const draft = model.emptyPreferences();
  draft.allergyChoices = { selected: ["other"], otherText: " ", noAllergies: false };
  assert.notEqual(model.getDraftError(draft), "");
  draft.allergyChoices.otherText = "كيوي\nكيوي\nمانجو";
  assert.deepEqual(plain(model.toPreferencesPayload(draft).allergies), ["كيوي", "مانجو"]);
  draft.seatingNotes = "x".repeat(201);
  assert.notEqual(model.getDraftError(draft), "");
});

test("GET and PUT use the account endpoint and pass the session token", async () => {
  const calls = [];
  const api = apiWith(async (...args) => {
    calls.push(args);
    return args[0] === "GET" ? saved : { message: "preferences saved" };
  });
  await api.getAccountPreferences("test-token");
  await api.saveAccountPreferences("test-token", payload);
  assert.deepEqual(plain(calls), [
    ["GET", "/users/me/preferences", { token: "test-token" }],
    ["PUT", "/users/me/preferences", { token: "test-token", body: payload }],
  ]);
});

test("rejects missing or malformed success responses", async () => {
  for (const value of [null, {}, { ...saved, allergies: null }, { ...saved, max_distance_km: NaN }]) {
    await assert.rejects(apiWith(async () => value).getAccountPreferences("token"), { code: "INVALID_RESPONSE" });
  }
  await assert.rejects(apiWith(async () => null).saveAccountPreferences("token", payload), { code: "INVALID_RESPONSE" });
});

test("preserves API errors for the screen to display", async () => {
  for (const status of [401, 404, 422, 503]) {
    const error = new errors.ApiError(status, "TEST_ERROR", "Test");
    const api = apiWith(async () => { throw error; });
    await assert.rejects(api.getAccountPreferences("token"), value => value === error);
    await assert.rejects(api.saveAccountPreferences("token", payload), value => value === error);
  }
});

test("mock mode saves and reloads one test account without exposing mutable arrays", async () => {
  const transport = load("shared/api/mockTransport.ts", { "./errors": errors });
  const mocks = load("features/preferences/mocks.ts", { "@/shared/api/mockTransport": transport });
  mocks.registerPreferencesMocks();
  const api = apiWith((method, route, options) => transport.mockTransport(method, route, options.body));
  assert.equal((await api.getAccountPreferences("mock-token")).is_saved, false);
  await api.saveAccountPreferences("mock-token", payload);
  const firstRead = await api.getAccountPreferences("mock-token");
  assert.deepEqual(plain(firstRead), saved);
  firstRead.allergies.push("should-not-persist");
  assert.deepEqual(plain((await api.getAccountPreferences("mock-token")).allergies), payload.allergies);
});
