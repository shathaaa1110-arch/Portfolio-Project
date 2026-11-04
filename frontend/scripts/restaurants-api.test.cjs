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
const apiWith = (request, searchEnabled = true) => load("features/restaurants/api.ts", {
  "@/shared/api/client": { request },
  "@/shared/api/errors": errors,
  "@/shared/api/config": { RESTAURANT_SEARCH_ENABLED: searchEnabled },
});
const row = (id) => ({ id, name_ar: "Review fixture", cuisines: [], district: "", rating: null });
const page = (offset, total = 43) => ({
  offset, total, limit: 20,
  restaurants: Array.from({ length: Math.max(0, Math.min(20, total - offset)) }, (_, i) => row(offset + i + 1)),
});

test("public API loads only the requested page without a token", async () => {
  const calls = [];
  const api = apiWith(async (...args) => {
    calls.push(args);
    const offset = Number(new URL(args[1], "https://example.invalid").searchParams.get("offset"));
    return page(offset);
  });
  assert.equal((await api.getRestaurants()).restaurants.length, 20);
  assert.equal(calls.length, 1); // No automatic fetch of all remaining pages.
  assert.equal((await api.getRestaurants(20)).restaurants[0].id, 21);
  assert.deepEqual(calls, [
    ["GET", "/restaurants?limit=20&offset=0"],
    ["GET", "/restaurants?limit=20&offset=20"],
  ]);
});

test("global search passes the encoded query with its offset and never filters locally", async () => {
  const calls = [];
  const api = apiWith(async (...args) => { calls.push(args); return page(20); });
  await api.getRestaurants(20, "  شذا & شاي  ");
  const url = new URL(calls[0][1], "https://example.invalid");
  assert.equal(url.searchParams.get("search"), "شذا & شاي");
  assert.equal(url.searchParams.get("offset"), "20");
  assert.equal(calls[0].length, 2); // Public endpoint; no account token.
});

test("a backend without search support cannot return misleading search results", async () => {
  let calls = 0;
  const api = apiWith(async () => { calls++; return page(0); }, false);
  await assert.rejects(() => api.getRestaurants(0, "شذا"), error => error.code === "SEARCH_UNAVAILABLE");
  assert.equal(calls, 0);
  await api.getRestaurants(0, "   ");
  assert.equal(calls, 1);
});

test("invalid offsets are rejected before making a request", async () => {
  let calls = 0;
  const api = apiWith(async () => { calls++; return page(0); });
  for (const offset of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => api.getRestaurants(offset));
  }
  assert.equal(calls, 0);
});

test("invalid successful responses become INVALID_RESPONSE errors", async () => {
  const invalid = [
    null, {}, { ...page(0), total: -1 }, { ...page(0), total: 1.5 },
    { ...page(0), offset: 20 }, { ...page(0), limit: 50 },
    { ...page(0), restaurants: Array.from({ length: 21 }, (_, i) => row(i)) },
    { ...page(0), restaurants: [{ id: 1 }] },
    { ...page(0), restaurants: [{ ...row(1), cuisines: [null] }] },
  ];
  for (const response of invalid) {
    await assert.rejects(
      () => apiWith(async () => response).getRestaurants(),
      (error) => error.code === "INVALID_RESPONSE",
    );
  }
});

test("empty data and the shorter final page remain valid", async () => {
  assert.equal((await apiWith(async () => page(0, 0)).getRestaurants()).restaurants.length, 0);
  assert.equal((await apiWith(async () => page(40)).getRestaurants(40)).restaurants.length, 3);
});

test("backend and network errors keep their original error codes", async () => {
  for (const error of [
    new errors.ApiError(503, "RESTAURANTS_UNAVAILABLE", "Unavailable"),
    new errors.ApiError(0, "NETWORK_ERROR", "Offline"),
  ]) {
    await assert.rejects(() => apiWith(async () => { throw error; }).getRestaurants(),
      (received) => received === error);
  }
});

test("first-page mock stays compatible with both URL forms", async () => {
  const handlers = new Map();
  const mocks = load("features/restaurants/mocks.ts", {
    "@/shared/api/mockTransport": {
      registerMock(method, route, handler) { handlers.set(method + " " + route, handler); },
    },
  });
  mocks.registerRestaurantMocks();
  const api = apiWith(async (method, route) => handlers.get(method + " " + route)());
  const response = await api.getRestaurants();
  assert.equal(response.total, 3);
  assert.equal(response.offset, 0);
  assert.equal(response.limit, 20);
  assert(handlers.has("GET /restaurants?limit=20"));
});
test("invalid districts are rejected before rendering a restaurant card", async () => {
  for (const district of [undefined, null, 42, {}, []]) {
    await assert.rejects(
      () => apiWith(async () => ({
        ...page(0, 1),
        restaurants: [{ ...row(1), district }],
      })).getRestaurants(),
      (error) => error.code === "INVALID_RESPONSE",
    );
  }

  for (const district of ["", "النخيل"]) {
    const response = await apiWith(async () => ({
      ...page(0, 1),
      restaurants: [{ ...row(1), district }],
    })).getRestaurants();

    assert.equal(response.restaurants[0].district, district);
  }
});

const presentation = load("features/restaurants/presentation.ts");

test("spend range displays only valid SAR bounds using Eastern Arabic digits", () => {
  assert.equal(presentation.restaurantSpendRange(40, 80), "٤٠–٨٠ ر.س");
  assert.equal(presentation.restaurantSpendRange(80, 80), "٨٠ ر.س");
  for (const [low, high] of [[null,null],[undefined,undefined],[40,undefined],
    ["40","80"],[0,0],[-1,80],[80,40],[NaN,80],[40,Infinity],[40.5,80]]) {
    assert.equal(presentation.restaurantSpendRange(low, high), null);
  }
});
