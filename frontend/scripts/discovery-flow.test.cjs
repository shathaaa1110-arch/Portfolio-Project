const test = require("node:test");
const assert = require("node:assert/strict");
const { load, render, deferred, act, plain, native, shared } = require("./helpers/render-feature.cjs");
const errors = load("shared/api/errors.ts");
const response = (offset = 0, total = 43, name = "مطعم") => ({
  total, offset, limit: 20,
  restaurants: Array.from({ length: Math.max(0, Math.min(20, total - offset)) }, (_, i) => ({ id: offset + i + 1, name_ar: name })),
});

async function restaurantHarness(search = "") {
  const calls = [], timers = new Map();
  let sequence = 0, state;
  const { useRestaurants } = load("features/restaurants/useRestaurants.ts", {
    "@/shared/api/errors": errors,
    "./api": { getRestaurants(offset, query) { const result = deferred(); calls.push({ offset, query, ...result }); return result.promise; } },
  }, {
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function Probe({ search }) { state = useRestaurants(search); return null; }
  const screen = await render(Probe, { search });
  return {
    screen, calls, timers, get state() { return state; },
    async tick() { await act(async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(t => t.fn()); }); },
    async answer(index, data) { await act(async () => calls[index].resolve(data)); },
    async fail(index) { await act(async () => calls[index].reject(new errors.ApiError(0, "NETWORK_ERROR", "Offline"))); },
  };
}

test("paging retains the last good page on failure, retries, refreshes and bounds requests", async () => {
  const h = await restaurantHarness();
  await h.tick();
  await h.answer(0, response());
  assert.equal(h.state.pageCount, 3);
  assert.equal(h.calls.length, 1);
  await act(async () => h.state.nextPage());
  assert.equal(h.state.canGoNext, false);
  assert.equal(h.state.pageNumber, 1);
  await h.tick();
  await h.fail(1);
  assert.equal(h.state.status, "ready");
  assert(h.state.error);
  assert.equal(h.state.restaurants[0].id, 1);
  await act(async () => h.state.retry());
  await h.tick();
  assert.equal(h.calls[2].offset, 20);
  await h.answer(2, response(20));
  assert.equal(h.state.pageNumber, 2);
  await act(async () => h.state.refresh());
  assert.equal(h.state.isRefreshing, true);
  await h.tick(); await h.answer(3, response(20));
  assert.equal(h.state.isRefreshing, false);
  await act(async () => h.state.nextPage());
  await h.tick(); await h.answer(4, response(40));
  assert.equal(h.state.canGoNext, false);
  assert.equal(h.state.restaurants.length, 3);
  await act(async () => h.state.previousPage());
  await h.tick(); await h.answer(5, response(20));
  assert.equal(h.state.pageNumber, 2);
  await h.screen.close();
});

test("Arabic server search debounces, resets pages and ignores an older response", async () => {
  const h = await restaurantHarness();
  await h.tick(); await h.answer(0, response());
  await act(async () => h.state.nextPage()); await h.tick();
  await h.screen.update({ search: "ش" });
  await h.screen.update({ search: "شذ" });
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 350);
  assert.equal(h.state.restaurants.length, 0);
  await h.tick();
  assert.equal(h.calls[2].query, "شذ");
  assert.equal(h.calls[2].offset, 0);
  await h.answer(2, response(0, 21, "شذا"));
  await h.answer(1, response(20, 43, "رد قديم"));
  assert.equal(h.state.restaurants[0].name_ar, "شذا");
  await act(async () => h.state.nextPage()); await h.tick();
  assert.equal(h.calls[3].query, "شذ");
  assert.equal(h.calls[3].offset, 20);
  await h.answer(3, response(20, 21, "شذا"));
  await h.screen.update({ search: "" }); await h.tick();
  assert.equal(h.calls[4].offset, 0);
  assert.equal(h.calls[4].query, "");
  await h.answer(4, response());
  assert.equal(h.state.pageNumber, 1);
  await h.screen.close();
});

test("empty matches, unsupported search and a shrinking final page are distinct", async () => {
  const h = await restaurantHarness("لا يوجد");
  await h.tick(); await h.answer(0, response(0, 0));
  assert.equal(h.state.status, "ready");
  assert.equal(h.state.pageCount, 0);
  await h.screen.update({ search: "جديد" }); await h.tick();
  await act(async () => h.calls[1].reject(new errors.ApiError(0, "SEARCH_UNAVAILABLE", "")));
  assert.equal(h.state.status, "error");
  assert.match(h.state.error, /البحث بكل المطاعم/);
  await h.screen.update({ search: "" }); await h.tick(); await h.answer(2, response());
  await act(async () => h.state.nextPage()); await h.tick(); await h.answer(3, response(20, 3));
  assert.equal(h.calls[4].offset, 0);
  await h.answer(4, response(0, 3));
  assert.equal(h.state.pageNumber, 1);
  assert.equal(h.state.total, 3);
  await h.screen.close();
});

test("recommendations never show a previous account or location while a request changes", async () => {
  const calls = []; let current;
  const { usePersonalRecommendations } = load("features/personalSuggestions/usePersonalRecommendations.ts", {
    "@/shared/api/errors": errors,
    "./api": { getPersonalRecommendations(token, location) { const result = deferred(); calls.push({ token, location, ...result }); return result.promise; } },
  });
  function Probe({ token, location }) { current = usePersonalRecommendations(token, location); return null; }
  const h = await render(Probe, { token: "A", location: { kind: "none" } });
  await act(async () => calls[0].resolve({ restaurants: [{ id: 1 }] }));
  await h.update({ token: "A", location: { kind: "district", districtId: "001" } });
  assert.equal(current.status, "loading");
  assert.equal(current.restaurants.length, 0);
  await h.update({ token: "B", location: { kind: "none" } });
  await act(async () => calls[1].resolve({ restaurants: [{ id: 2 }] }));
  assert.equal(current.restaurants.length, 0);
  await act(async () => calls[2].resolve({ restaurants: [{ id: 3 }] }));
  assert.equal(current.restaurants[0].id, 3);
  await h.update({ token: null, location: { kind: "none" } });
  assert.equal(current.status, "idle");
  assert.equal(current.restaurants.length, 0);
  assert.equal(calls.length, 3);
  await h.close();
});

test("Home offers the rest of the recommendations and a location recovery action", async () => {
  let recs = { status: "ready", error: null, restaurants: Array.from({ length: 3 }, (_, i) => ({ id: i + 1, name_ar: "مطعم", reason: "يناسب ذوقك" })) };
  let chosen = 0;
  const { HomeTodayPick } = load("application/HomeTodayPick.tsx", {
    "expo-router": { router: {} }, "react-native": native,
    "@/features/restaurants": { RestaurantCard: "RestaurantCard" },
    "@/features/personalSuggestions": { usePersonalRecommendations: () => recs },
    "@/shared/components": shared, "@/shared/theme": load("shared/theme.ts"),
    "./useHomePreferences": { useHomePreferences: () => ({ state: { status: "ready", token: "A" } }) },
  });
  const props = { location: { kind: "none" }, renderAction: () => null, onChooseLocation: () => chosen++ };
  const h = await render(HomeTodayPick, props);
  assert.equal(h.root.findAllByType("RestaurantCard").length, 1);
  await act(async () => h.root.findByType("Pressable").props.onPress());
  const cards = h.root.findAllByType("RestaurantCard");
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(item => item.props.variant), ["featured", "tile", "tile"]);
  assert(cards.every(item => item.props.reason === "يناسب ذوقك"));
  recs = { status: "error", error: new errors.ApiError(422, "LOCATION_REQUIRED", ""), restaurants: [] };
  await h.update(props);
  await act(async () => h.root.findByType("Pressable").props.onPress());
  assert.equal(chosen, 1);
  await h.close();
});
