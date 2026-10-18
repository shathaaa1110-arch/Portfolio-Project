import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkArchitecture } from "./check-architecture.mjs";

function check(t, files = {}, features = { auth: [], restaurants: [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "thouq-architecture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = {
    "architecture.json": JSON.stringify({ frontend: { sourceRoot: "frontend/src", features } }),
    "frontend/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "frontend/src/features/auth/index.ts": "export const session = {};",
    "frontend/src/features/auth/internal.ts": "export const privateValue = 1;",
    "frontend/src/features/restaurants/index.ts": "export const list = [];",
    "frontend/src/shared/theme.ts": "export const theme = {};",
    ...files,
  };
  for (const [name, contents] of Object.entries(fixture)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return checkArchitecture(root);
}

test("allows composition, shared tools and declared public feature dependencies", (t) => {
  assert.deepEqual(check(t, {
    "frontend/src/application/HomePage.tsx": 'import { list } from "@/features/restaurants";',
    "frontend/src/features/restaurants/index.ts": 'import { session } from "../auth"; import { theme } from "../../shared/theme";',
  }, { auth: [], restaurants: ["auth"] }), []);
});

test("rejects a shared tool importing a feature", (t) => {
  assert.match(check(t, { "frontend/src/shared/client.ts": 'import { session } from "@/features/auth";' }).join("\n"), /shared cannot import features/);
});

test("rejects undeclared cross-feature dependencies", (t) => {
  assert.match(check(t, { "frontend/src/features/restaurants/index.ts": 'export { session } from "../auth";' }).join("\n"), /Undeclared dependency/);
});

test("rejects private imports through aliases, relative exports and dynamic imports", (t) => {
  for (const source of ['import { privateValue } from "@/features/auth/internal";', 'export * from "../features/auth/internal";', 'const value = import("@/features/auth/internal");']) {
    assert.match(check(t, { "frontend/src/application/HomePage.tsx": source }).join("\n"), /public index.ts/);
  }
});

test("rejects feature dependency cycles even when both directions are declared", (t) => {
  assert.match(check(t, {}, { auth: ["restaurants"], restaurants: ["auth"] }).join("\n"), /dependency cycle/);
});

test("rejects a feature importing application composition", (t) => {
  assert.match(check(t, {
    "frontend/src/application/HomePage.tsx": "export const home = {};",
    "frontend/src/features/auth/index.ts": 'import { home } from "../../application/HomePage";',
  }).join("\n"), /features cannot import application/);
});

test("requires newly implemented features to be declared", (t) => {
  assert.match(check(t, { "frontend/src/features/preferences/index.ts": "export const preferences = {};" }).join("\n"), /Declare feature 'preferences'/);
});
