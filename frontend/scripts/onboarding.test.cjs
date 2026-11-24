const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { load, render, native, shared, deferred, act } = require("./helpers/render-feature.cjs");
const theme = load("shared/theme.ts");

function completion({ os = "ios", read = async () => null, write = async () => {} } = {}) {
  return load("features/onboarding/completion.ts", {
    "react-native": { Platform: { OS: os } },
    "expo-secure-store": { getItemAsync: read, setItemAsync: write },
  }, { localStorage: os === "web" ? { getItem: read, setItem: write } : undefined });
}

function launchModule(state) {
  return load("application/LaunchTabs.tsx", {
    "expo-router": { Redirect: "Redirect" }, "react-native": native,
    "@/features/onboarding": state, "@/shared/theme": theme, "./MainTabs": { MainTabs: "MainTabs" },
  }).LaunchTabs;
}

test("first launch waits for storage, shows intro, then opens public tabs without auth", async () => {
  const pending = deferred();
  const writes = [];
  const state = completion({ read: () => pending.promise, write: async (...args) => writes.push(args) });
  const h = await render(launchModule(state));
  assert.equal(h.root.findAllByType("MainTabs").length, 0);
  assert.equal(h.root.findAllByType("Redirect").length, 0);
  await act(async () => pending.resolve(null));
  assert.equal(h.root.findByType("Redirect").props.href, "/welcome");
  await act(async () => state.completeIntro());
  assert.equal(h.root.findAllByType("MainTabs").length, 1);
  assert.deepEqual(writes, [["thouq.onboarding.v1", "done"]]);
  await h.close();
});

test("a later launch reads persistent completion on native and web", async () => {
  for (const os of ["ios", "web"]) {
    const state = completion({ os, read: os === "web" ? () => "done" : async () => "done" });
    const h = await render(launchModule(state));
    assert.equal(h.root.findAllByType("MainTabs").length, 1);
    assert.equal(h.root.findAllByType("Redirect").length, 0);
    await h.close();
  }
});

test("unavailable storage cannot trap someone after skipping or finishing", async () => {
  const state = completion({ read: async () => { throw Error("unavailable"); }, write: async () => { throw Error("unavailable"); } });
  const h = await render(launchModule(state));
  assert.equal(h.root.findByType("Redirect").props.href, "/welcome");
  await act(async () => state.completeIntro());
  assert.equal(h.root.findAllByType("MainTabs").length, 1);
  await h.close();
});

test("a slow initial read cannot overwrite finishing the intro", async () => {
  const pending = deferred();
  const state = completion({ read: () => pending.promise });
  const h = await render(launchModule(state));
  await act(async () => state.completeIntro());
  await act(async () => pending.resolve(null));
  assert.equal(h.root.findAllByType("MainTabs").length, 1);
  await h.close();
});

test("three steps, revisit, skip and final button all use the actual app flow", async () => {
  let finished = 0;
  const Screen = load("features/onboarding/OnboardingScreen.tsx", {
    "react-native": { ...native, BackHandler: { addEventListener: () => ({ remove() {} }) } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" }, "expo-image": { Image: "Image" },
    "@/shared/components": shared, "@/shared/theme": theme,
    "./content": load("features/onboarding/content.ts"),
    "./useIntroMotion": { useIntroMotion: () => ({ phase: 3, reduced: true, showAll() {} }) },
    "./components/IntroScenes": { DiscoveryScene: "DiscoveryScene", PreferencesScene: "PreferencesScene", OutingScene: "OutingScene" },
  }).OnboardingScreen;
  const h = await render(Screen, { onFinish: () => { finished++; } });
  const next = () => act(async () => h.root.findByType("AppButton").props.onPress());
  assert.equal(h.root.findAllByType("DiscoveryScene").length, 1);
  await next();
  assert.equal(h.root.findAllByType("PreferencesScene").length, 1);
  await next();
  assert.equal(h.root.findAllByType("OutingScene").length, 1);
  assert.equal(h.root.findByType("AppButton").props.title, "ابدأ الاستكشاف");
  await next();
  assert.equal(finished, 1);
  const dots = h.root.findAllByType("Pressable").filter(node => node.props.accessibilityRole === "tab");
  await act(async () => dots[0].props.onPress());
  assert.equal(h.root.findAllByType("DiscoveryScene").length, 1);
  await act(async () => h.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel?.startsWith("تخطّي")).props.onPress());
  assert.equal(finished, 2);
  await h.close();
});

test("Welcome saves completion once and replaces itself with Home", async () => {
  const pending = deferred();
  let saves = 0;
  const routes = [];
  const Page = load("application/WelcomePage.tsx", {
    "expo-router": { router: { replace: value => routes.push(value) } },
    "@/features/onboarding": { OnboardingScreen: "OnboardingScreen", completeIntro: () => { saves++; return pending.promise; } },
  }).WelcomePage;
  const h = await render(Page);
  let first;
  await act(async () => {
    first = h.root.findByType("OnboardingScreen").props.onFinish();
    void h.root.findByType("OnboardingScreen").props.onFinish();
  });
  assert.equal(saves, 1);
  assert.equal(h.root.findByType("OnboardingScreen").props.finishing, true);
  await act(async () => { pending.resolve(); await first; });
  assert.deepEqual(routes, ["/"]);
  await h.close();
});

test("motion pauses in background, stops at the last phase, and respects reduced motion", async () => {
  const listeners = {};
  const timers = new Map();
  let id = 0;
  const { useIntroMotion } = load("features/onboarding/useIntroMotion.ts", {
    "react-native": {
      AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: (event, cb) => { listeners[event] = cb; return { remove() { delete listeners[event]; } }; } },
      AppState: { currentState: "active", addEventListener: (event, cb) => { listeners[event] = cb; return { remove() { delete listeners[event]; } }; } },
    },
  }, { setTimeout: callback => { timers.set(++id, callback); return id; }, clearTimeout: key => timers.delete(key) });
  function Host({ step = 0 }) { return React.createElement("Motion", useIntroMotion(step)); }
  const h = await render(Host);
  const motion = () => h.root.findByType("Motion").props;
  assert.equal(timers.size, 1);
  await act(async () => listeners.change("background"));
  assert.equal(timers.size, 0);
  await act(async () => listeners.change("active"));
  for (let phase = 1; phase <= 3; phase++) {
    const callback = [...timers.values()][0];
    timers.clear();
    await act(async () => callback());
    assert.equal(motion().phase, phase);
  }
  assert.equal(timers.size, 0);
  await act(async () => listeners.reduceMotionChanged(true));
  await h.update({ step: 1 });
  assert.equal(motion().phase, 3);
  assert.equal(timers.size, 0);
  await h.close();
  assert.equal(Object.keys(listeners).length, 0);
});
