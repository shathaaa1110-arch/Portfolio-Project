import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));
const codeExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : codeExtension.test(file) ? [file] : [];
  });
}

function importsIn(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = node.moduleReference.expression;
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      specifier = node.arguments[0];
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
    if (specifier && ts.isStringLiteralLike(specifier)) imports.push(specifier.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}

export function checkArchitecture(root = defaultRoot) {
  const config = JSON.parse(fs.readFileSync(path.join(root, "architecture.json"), "utf8")).frontend;
  const src = path.resolve(root, config.sourceRoot);
  const features = config.features;
  const errors = [];
  const report = (file, message) => errors.push(`${path.relative(root, file)}: ${message}`);
  const classify = (file) => {
    const [layer, feature] = path.relative(src, file).split(path.sep);
    return { layer, feature: layer === "features" ? feature : undefined };
  };
  const configPath = path.join(root, "frontend/tsconfig.json");
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, path.dirname(configPath));
  if (raw.error || parsed.errors.length) throw new Error("Cannot read frontend/tsconfig.json");
  const files = filesIn(src);
  const actual = fs.existsSync(path.join(src, "features"))
    ? fs.readdirSync(path.join(src, "features"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  for (const feature of actual) {
    if (!Object.hasOwn(features, feature)) errors.push(`Declare feature '${feature}' in architecture.json`);
    if (!fs.existsSync(path.join(src, "features", feature, "index.ts"))) errors.push(`Feature '${feature}' needs public index.ts`);
  }
  for (const [feature, dependencies] of Object.entries(features)) {
    if (!actual.includes(feature)) errors.push(`Declared feature '${feature}' does not exist`);
    if (!Array.isArray(dependencies)) throw new Error(`Dependencies of '${feature}' must be an array`);
    for (const dependency of dependencies) {
      if (!Object.hasOwn(features, dependency)) errors.push(`Unknown dependency '${feature}' -> '${dependency}'`);
    }
  }
  const visited = new Set();
  const active = new Set();
  function checkCycle(feature, chain = []) {
    if (active.has(feature)) { errors.push(`Feature dependency cycle: ${[...chain, feature].join(" -> ")}`); return; }
    if (visited.has(feature)) return;
    active.add(feature);
    for (const dependency of features[feature] ?? []) checkCycle(dependency, [...chain, feature]);
    active.delete(feature);
    visited.add(feature);
  }
  Object.keys(features).forEach((feature) => checkCycle(feature));

  for (const file of files) {
    const from = classify(file);
    if (!["app", "application", "features", "shared"].includes(from.layer)) report(file, "Source belongs in app, application, features or shared");
    for (const specifier of importsIn(file)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const resolved = ts.resolveModuleName(specifier, file, parsed.options, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) {
        // Static image/font assets are handled by Metro, not TypeScript's module resolver.
        if (!/\.(png|jpe?g|gif|webp|svg|ttf|otf|woff2?)$/i.test(specifier)) report(file, `Unresolved local import '${specifier}'`);
        continue;
      }
      const relative = path.relative(src, resolved);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        report(file, `Local code outside src is not a frontend module: '${specifier}'`);
        continue;
      }
      const to = classify(resolved);
      if (from.layer === "shared" && to.layer !== "shared") report(file, `shared cannot import ${to.layer}: '${specifier}'`);
      if (from.layer === "features" && !["features", "shared"].includes(to.layer)) report(file, `features cannot import ${to.layer}: '${specifier}'`);
      if (from.layer === "application" && to.layer === "app") report(file, `application cannot import route files: '${specifier}'`);
      if (to.layer === "features" && from.feature !== to.feature) {
        if (resolved !== path.join(src, "features", to.feature, "index.ts")) report(file, `Import '${to.feature}' through its public index.ts: '${specifier}'`);
        if (from.feature && !(features[from.feature] ?? []).includes(to.feature)) report(file, `Undeclared dependency '${from.feature}' -> '${to.feature}'`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkArchitecture();
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("Frontend architecture boundaries passed.");
}
