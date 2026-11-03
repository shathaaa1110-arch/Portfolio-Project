const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const Renderer = require("react-test-renderer");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Use real React state/effects. Only native views, services and clocks are replaced.
function load(relativePath, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "../../src", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, setTimeout, clearTimeout, ...globals,
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return require("react/jsx-runtime");
      if (name.endsWith(".png")) return 1;
      if (name === "@/shared/layout") return load("shared/layout.ts", { "react-native": { Platform: { OS: "ios" } } });
      if (!(name in imports)) throw new Error("Unexpected test import: " + name);
      return imports[name];
    },
  }, { filename });
  return module.exports;
}
const native = {
  Platform: { OS: "ios" },
  View: "View", ScrollView: "ScrollView", Pressable: "Pressable", Modal: "Modal",
  ActivityIndicator: "ActivityIndicator", Keyboard: { dismiss() {} },
  StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 402, height: 874, fontScale: 1 }),
};
const shared = { AppButton: "AppButton", AppInput: "AppInput", AppText: "AppText" };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function render(Component, props = {}) {
  let tree;
  await Renderer.act(async () => { tree = Renderer.create(React.createElement(Component, props)); });
  return {
    get root() { return tree.root; },
    update: next => Renderer.act(async () => { tree.update(React.createElement(Component, next)); }),
    close: () => Renderer.act(async () => { tree.unmount(); }),
  };
}
module.exports = { load, render, native, shared, deferred, act: Renderer.act, plain: value => JSON.parse(JSON.stringify(value)) };
