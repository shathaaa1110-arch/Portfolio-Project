const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Run pure TypeScript modules without loading React Native or making requests,
// like preferences.test.cjs. `globals` adds browser values such as localStorage.
const sourceRoot = path.join(__dirname, "../src");
function load(relativePath, imports = {}, globals = {}) {
  const filename = path.join(sourceRoot, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    ...globals,
    module, exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected test import: ${name}`);
      return imports[name];
    },
  }, { filename });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const errors = load("shared/api/errors.ts");

// A small in-memory localStorage, the storage the web version of the app uses
function fakeLocalStorage() {
  const items = new Map();
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
  };
}

// The auth mocks, loaded fresh each time, like after an app reload
function freshAuthMocks() {
  const handlers = new Map();
  const mocks = load("features/auth/mocks.ts", {
    "@/shared/api/errors": errors,
    "@/shared/api/mockTransport": { registerMock: (method, route, handler) => handlers.set(`${method} ${route}`, handler) },
  });
  mocks.registerAuthMocks();
  return handlers;
}

test("My account keeps sign-out when the profile fails to load", () => {
  const { accountActions } = load("features/auth/accountActions.ts");
  assert.deepEqual(plain(accountActions("error")), { canSignIn: false, canRetry: true, canSignOut: true });
  assert.equal(accountActions("ready").canSignOut, true);
  assert.equal(accountActions("loading").canSignOut, false);
  assert.equal(accountActions("signed-out").canSignOut, false);
});

test("sign-out clears the session when the server cannot be reached", async () => {
  let logoutCalls = 0;
  const session = load("features/auth/session.ts", {
    "react-native": { Platform: { OS: "web" } },
    "expo-secure-store": {},
    "@/shared/api/errors": errors,
    // The same offline failure that made GET /users/me fail
    "./api": { logout: async () => { logoutCalls += 1; throw errors.networkError(); } },
  }, { localStorage: fakeLocalStorage() });

  await session.saveSession({ token: "t", expiresAt: Date.now() + 60_000, userName: "فهد", hasSavedPreferences: false });
  await session.signOut();

  assert.equal(logoutCalls, 1);
  assert.equal(await session.loadSession(), null);
});

test("mock mode keeps the same account after a reload", () => {
  const verified = freshAuthMocks().get("POST /auth/verify")({ phone: "0551234567", code: "123456", name: "سارة" });

  // A reload starts the mocks with empty memory; only the saved token survives
  const me = freshAuthMocks().get("GET /users/me")(undefined, verified.token);
  assert.deepEqual(plain(me), { id: "mock-0551234567", name: "سارة", phone: "0551234567" });
  assert.equal(plain(verified.user).id, me.id);
});

test("mock mode asks to log in again for an unknown token", () => {
  const readProfile = freshAuthMocks().get("GET /users/me");
  for (const token of ["mock-token", undefined, "mock-token|0551234567"]) {
    assert.throws(() => readProfile(undefined, token), error => error.status === 401 && error.code === "INVALID_TOKEN");
  }
});
