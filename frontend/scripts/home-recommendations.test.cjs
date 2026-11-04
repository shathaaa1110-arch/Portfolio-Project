const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise feature modules without starting Expo or sending network requests.
function load(relativePath, imports = {}) {
  const filename = path.join(__dirname, "../src", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error("Unexpected import: " + name);
      return imports[name];
    },
  }, { filename });
  return module.exports;
}
const errors = load("shared/api/errors.ts");
const apiWith = request => load("features/personalSuggestions/api.ts", {
  "@/shared/api/client": { request }, "@/shared/api/errors": errors,
});

test("coordinates reach the authenticated recommendation request", async () => {
  let captured;
  const api = apiWith(async (...args) => { captured = args; return { restaurants: [] }; });
  await api.getPersonalRecommendations("test-token", { kind: "coordinates", lat: 24.7, lon: 46.6 });
  assert.equal(captured[0], "GET");
  const url = new URL(captured[1], "https://example.invalid");
  assert.equal(url.pathname, "/users/me/recommendations");
  assert.equal(url.searchParams.get("lat"), "24.7");
  assert.equal(url.searchParams.get("lon"), "46.6");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.has("district_id"), false);
  assert.equal(captured[2].token, "test-token");
});

test("no location sends no location filter and missing session sends no request", async () => {
  const calls = [];
  const api = apiWith(async (...args) => { calls.push(args); return { restaurants: [] }; });
  await api.getPersonalRecommendations("test-token", { kind: "none" });
  assert.equal(calls[0][1], "/users/me/recommendations?limit=10");
  await assert.rejects(() => api.getPersonalRecommendations(""), e => e.status === 401);
  assert.equal(calls.length, 1);
});

test("invalid GPS coordinates never go to the server", async () => {
  let calls = 0;
  const api = apiWith(async () => { calls++; return { restaurants: [] }; });
  for (const [lat, lon] of [[NaN, 0], [91, 0], [0, 181], [0, Infinity]]) {
    await assert.rejects(() => api.getPersonalRecommendations("test-token", { kind: "coordinates", lat, lon }));
  }
  assert.equal(calls, 0);
});

test("unavailable service and expired sessions remain visible errors", async () => {
  for (const status of [401, 404, 503]) {
    const error = new errors.ApiError(status, "TEST_ERROR", "Test failure");
    await assert.rejects(() => apiWith(async () => { throw error; }).getPersonalRecommendations("test-token"), received => received === error);
  }
});

test("district IDs remain strings, including leading zeros", async () => {
  let route;
  await apiWith(async (_, value) => { route = value; return { restaurants: [] }; })
    .getPersonalRecommendations("token", { kind: "district", districtId: "001-حي" });
  const url = new URL(route, "https://example.invalid");
  assert.equal(url.searchParams.get("district_id"), "001-حي");
  assert.equal(url.searchParams.has("lat"), false);
  await assert.rejects(() => apiWith(async () => {}).getPersonalRecommendations("token", { kind: "district", districtId: " " }));
});

test("district lists validate identity and labels before filtering Arabic names", async () => {
  const districtApi = value => load("features/personalSuggestions/districts.ts", {
    "@/shared/api/client": { request: async (method, route) => { assert.equal(method, "GET"); assert.equal(route, "/districts"); return value; } },
    "@/shared/api/errors": errors,
  });
  const list = [{ id: "001", name_ar: "الإزدهار", name_en: "Al Izdihar" }];
  for (const value of [list, { districts: list }]) {
    const api = districtApi(value);
    const result = await api.getDistricts();
    assert.equal(result[0].id, "001");
    assert.equal(api.filterDistricts(result, "ازدهار").length, 1);
    assert.equal(api.filterDistricts(result, "IZDIHAR").length, 1);
  }
  for (const value of [null, {}, [{ id: 1, name_ar: "حي" }], [...list, ...list], [{ ...list[0], name_en: 4 }]]) {
    await assert.rejects(() => districtApi(value).getDistricts(), error => error.code === "INVALID_RESPONSE");
  }
});

test("recommendation errors preserve backend codes needed by recovery actions", async () => {
  for (const [status, code] of [[422, "LOCATION_REQUIRED"], [404, "DISTRICT_NOT_FOUND"], [503, "RECOMMENDATIONS_UNAVAILABLE"]]) {
    const error = new errors.ApiError(status, code, "");
    await assert.rejects(() => apiWith(async () => { throw error; }).getPersonalRecommendations("token"), received => received === error);
  }
});
