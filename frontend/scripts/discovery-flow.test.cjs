const test = require("node:test");
const assert = require("node:assert/strict");
const { load, render, deferred, act, plain, native, shared } = require("./helpers/render-feature.cjs");
const errors = load("shared/api/errors.ts");
const React = require("react");
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

test("Today pick stays one card and retains the location recovery action", async () => {
  let recs = { status: "ready", error: null, restaurants: Array.from({ length: 3 }, (_, i) => ({ id: i + 1, name_ar: "مطعم", reason: "يناسب ذوقك" })) };
  let chosen = 0;
  const { HomeTodayPick } = load("application/HomeTodayPick.tsx", {
    "expo-router": { router: {} }, "react-native": native,
    "@/features/restaurants": { RestaurantCard: "RestaurantCard" },
    "@/features/personalSuggestions": { usePersonalRecommendations: () => recs },
    "@/shared/components": shared, "@/shared/theme": load("shared/theme.ts"),
    "./useHomePreferences": { useHomePreferences: () => ({ state: { status: "ready", token: "A" } }) },
  });
  const props = { preferences: { state: { status: "ready", token: "A" } }, recommendations: recs, renderAction: () => null, onChooseLocation: () => chosen++ };
  const h = await render(HomeTodayPick, props);
  assert.equal(h.root.findAllByType("RestaurantCard").length, 1);
  assert.equal(h.root.findAllByType("Pressable").length, 0);
  assert.equal(h.root.findByType("RestaurantCard").props.variant, "featured");
  recs = { status: "error", error: new errors.ApiError(422, "LOCATION_REQUIRED", ""), restaurants: [] };
  await h.update({ ...props, recommendations: recs });
  await act(async () => h.root.findByType("Pressable").props.onPress());
  assert.equal(chosen, 1);
  await h.close();
});

async function homeSearchHarness(searchEnabled, personal = []) {
  const queries = [], scrolls = [], routes = [];
  const theme = load("shared/theme.ts");
  function FlatList({ ref, ...props }) {
    React.useImperativeHandle(ref, () => ({ scrollToOffset: options => scrolls.push(plain(options)) }), []);
    return React.createElement("FlatList", props, props.ListHeaderComponent);
  }
  const views = { ...native, FlatList, TextInput: "TextInput" };
  const { RestaurantList } = load("features/restaurants/RestaurantList.tsx", {
    "react-native": views, "@/shared/components": shared, "@/shared/theme": theme,
    "./components/RestaurantCard": { RestaurantCard: "RestaurantCard" },
  });
  const { HomeIntro } = load("application/HomeIntro.tsx", {
    "react-native": views, "@/shared/components": shared, "@/shared/theme": theme,
    "expo-image": { Image: "Image" }, "expo-symbols": { SymbolView: "SymbolView" },
  });
  const { HomePage } = load("application/HomePage.tsx", {
    "react-native": views, "expo-router": { router: { push: path => routes.push(path) } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-symbols": { SymbolView: "SymbolView" },
    "@/shared/components": shared, "@/shared/theme": theme,
    "@/shared/api/config": { RESTAURANT_SEARCH_ENABLED: searchEnabled },
    "@/features/restaurants": {
      RestaurantList, RestaurantPagination: "RestaurantPagination",
      useRestaurants(query) {
        queries.push(query);
        return { ...response(), status: "ready", pageNumber: 1, pageCount: 3, error: null };
      },
    },
    "@/features/savedRestaurants": { SaveRestaurantButton: "SaveRestaurantButton", useSavedRestaurants: () => ({}) },
    "@/features/personalSuggestions": { usePersonalRecommendations: () => ({ status: "ready", restaurants: personal }) },
    "./useHomePreferences": { useHomePreferences: () => ({ state: { status: "ready", token: "A" } }) },
    "./HomeIntro": { HomeIntro },
    "./HomeLocationBar": { HomeLocationBar: () => null },
    "./HomeTodayPick": { HomeTodayPick: () => null },
  });
  const screen = await render(HomePage);
  scrolls.length = 0;
  return {
    screen, queries, scrolls, routes,
    measureHeader(height) {
      screen.root.findByType("FlatList").props.ListHeaderComponent.props.onLayout({ nativeEvent: { layout: { height } } });
    },
    browse() {
      return act(async () => screen.root.findByProps({ accessibilityLabel: "ألقى مطعم، تصفّح قائمة المطاعم" }).props.onPress());
    },
  };
}

test("Home hides unsupported search and its discovery button scrolls to the restaurants repeatedly", async () => {
  const h = await homeSearchHarness(false);
  assert.equal(h.screen.root.findAllByType("TextInput").length, 0);
  h.measureHeader(480);
  await h.browse();
  assert.deepEqual(h.scrolls, [{ offset: 480, animated: true }]);
  h.measureHeader(560);
  await h.browse();
  assert.deepEqual(h.scrolls[1], { offset: 560, animated: true });
  assert(h.queries.every(query => query === ""));
  assert.equal(h.screen.root.findByType("FlatList").props.data.flatMap(row => row.restaurants ?? []).length, 20);
  await h.screen.close();
});

test("Home exposes global search only when supported, forwards Arabic text and can clear it", async () => {
  const h = await homeSearchHarness(true);
  const input = h.screen.root.findByType("TextInput");
  await act(async () => input.props.onChangeText("شذ"));
  assert.equal(h.queries.at(-1), "شذ");
  assert.equal(h.screen.root.findByType("TextInput").props.value, "شذ");
  h.measureHeader(620);
  await h.browse();
  assert.deepEqual(h.scrolls.at(-1), { offset: 620, animated: true });
  assert.equal(h.queries.at(-1), "شذ");
  await act(async () => h.screen.root.findByProps({ accessibilityLabel: "مسح البحث" }).props.onPress());
  assert.equal(h.queries.at(-1), "");
  await h.screen.close();
});


test("Home selects the pressed action and places extra recommendations in the main list", async () => {
  const personal = [{ id: 101, name_ar: "الأول" }, { id: 102, name_ar: "الثاني", reason: "على ذوقك", distance_km: 2 }, { id: 103, name_ar: "الثالث" }];
  const h = await homeSearchHarness(true, personal);
  const outing = () => h.screen.root.findByProps({ accessibilityLabel: "أخطّط طلعة، إنشاء جلسة جديدة" });
  const find = () => h.screen.root.findByProps({ accessibilityLabel: "ألقى مطعم، تصفّح قائمة المطاعم" });
  assert.equal(find().props.accessibilityState.selected, true);
  await act(async () => outing().props.onPress());
  assert.equal(outing().props.accessibilityState.selected, true);
  assert.equal(find().props.accessibilityState.selected, false);
  assert.deepEqual(h.routes, ["/sessions/new"]);
  await h.browse();
  assert.equal(find().props.accessibilityState.selected, true);
  const rows = h.screen.root.findByType("FlatList").props.data;
  assert.equal(rows[0].heading.props.children, "مطاعم أخرى على ذوقك");
  assert.deepEqual(plain(rows.filter(row => row.key.startsWith("recommended-")).flatMap(row => row.restaurants.map(r => r.id))), [102, 103]);
  assert.equal(rows.find(row => row.key.startsWith("recommended-")).restaurants[0].reason, "على ذوقك");
  await act(async () => h.screen.root.findByType("TextInput").props.onChangeText("مطعم"));
  assert.equal(h.screen.root.findByType("FlatList").props.data.some(row => row.key.startsWith("recommended-")), false);
  await h.screen.close();
});

test("a restaurant appearing in personal and public results opens only the selected details sheet", async () => {
  const item = { id: 1, name_ar: "مطعم", cuisines: [], district: "", rating: null };
  function FlatList(props) {
    return React.createElement("FlatList", null, props.data.map(row => React.createElement(React.Fragment, { key: row.key }, props.renderItem({ item: row }))));
  }
  const { RestaurantList } = load("features/restaurants/RestaurantList.tsx", {
    "react-native": { ...native, FlatList }, "@/shared/components": shared,
    "@/shared/theme": load("shared/theme.ts"),
    "./components/RestaurantCard": { RestaurantCard: "RestaurantCard" },
  });
  const props = { restaurants: [item], recommendedRestaurants: [{ ...item, reason: "يناسب ذوقك" }] };
  const h = await render(RestaurantList, props);
  const cards = () => h.root.findAllByType("RestaurantCard");
  assert.equal(cards().length, 2);
  await act(async () => cards()[0].props.onExpandedChange(true));
  assert.deepEqual(cards().map(card => card.props.expanded), [true, false]);
  await act(async () => cards()[1].props.onExpandedChange(true));
  assert.deepEqual(cards().map(card => card.props.expanded), [false, true]);
  await h.update({ ...props, searchQuery: "مطعم" });
  assert(cards().every(card => !card.props.expanded));
  await h.close();
});
