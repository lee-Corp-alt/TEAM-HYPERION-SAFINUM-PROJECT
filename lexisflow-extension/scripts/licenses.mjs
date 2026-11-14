// Writes THIRD-PARTY-LICENSES.txt: the licence text and notices for everything LexisFlow ships that it did
// not write itself. Run by `npm run build` (postbuild), into dist/ (what is submitted) and into the
// project root (what is read alongside the source).
//
// It starts from the "dependencies" of package.json and follows each package's own dependencies.
// Development tools are not shipped and are listed in SOURCES.md instead. Nothing here is typed by hand
// except the short notes on what is not shipped.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["undici-types"]);
/** Type declarations only: nothing of them reaches the extension. */
const isTypesOnly = (name) => name.startsWith("@types/");

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

/** Where `name` is installed, as seen from the package in `fromDir` (Node's own lookup order). */
function locate(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

function licenceText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  return file ? readFileSync(join(dir, file), "utf-8").trim() : null;
}

const spdx = (pkg) => (typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "UNKNOWN");
const repo = (pkg) => (typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? "");

/** Every shipped package: name, version, licence id, licence text (or null), where it comes from. */
export function collectPackages() {
  const found = new Map();
  const visit = (name, fromDir) => {
    if (SKIP.has(name) || isTypesOnly(name)) return;
    const dir = locate(name, fromDir);
    if (!dir) throw new Error(`dependency "${name}" is not installed; run npm install first`);
    const pkg = readJson(join(dir, "package.json"));
    const key = `${pkg.name}@${pkg.version}`;
    if (found.has(key)) return;
    found.set(key, { name: pkg.name, version: pkg.version, license: spdx(pkg), text: licenceText(dir), source: repo(pkg).replace(/^git\+/, "").replace(/\.git$/, "") });
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
  };
  for (const name of Object.keys(readJson(join(root, "package.json")).dependencies ?? {})) visit(name, root);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

const RULE = "=".repeat(78);
const thin = "-".repeat(78);

export function renderLicenseText() {
  const packages = collectPackages();

  const out = [];
  out.push(
    "LexisFlow: third-party components and their licences",
    "",
    "LexisFlow is a browser extension built for the SAFINUM Innovate Challenge. It contains the open-source",
    "components below, used under their own licences. Their texts follow. This file is generated from the",
    "installed packages at build time (scripts/licenses.mjs). Development-only tools are listed in SOURCES.md.",
    "",
    RULE,
    "1. SUMMARY",
    RULE,
    "",
  );
  for (const p of packages) out.push(`  ${p.name} ${p.version}  -  ${p.license}`);
  out.push(
    "",
    RULE,
    "2. WHAT IS NOT SHIPPED",
    RULE,
    "",
    "LexisFlow ships no voice model, no speech engine and no other component that is not an npm package. It reads",
    "text aloud through the speech synthesis built into the user's browser (the Web Speech API), so the voices are",
    "those of the user's own computer or browser and are not part of this extension.",
    "",
    "Manrope typeface",
    "  Bundled through @fontsource-variable/manrope under the SIL Open Font License 1.1, text in section 4.",
    "",
    RULE,
    "3. THE SOURCE CODE",
    RULE,
    "",
    "The complete source code of LexisFlow itself, from which this extension is built, is supplied with the",
    "challenge submission, together with the build instructions in README.md.",
    "",
    RULE,
    "4. LICENCE TEXTS",
    RULE,
    "",
  );
  for (const p of packages) {
    out.push(thin, `${p.name} ${p.version}  -  ${p.license}`, p.source ? `Source: ${p.source}` : "", thin, "");
    out.push(p.text ?? `(This package contains no licence file. Its package.json declares ${p.license}; see its source address above.)`, "");
  }
  return out.join("\n").replace(/\r\n/g, "\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const text = renderLicenseText();
  const targets = [join(root, "dist", "THIRD-PARTY-LICENSES.txt"), join(root, "..", "THIRD-PARTY-LICENSES.txt")];
  for (const target of targets) {
    if (existsSync(dirname(target))) writeFileSync(target, text, "utf-8");
  }
  console.log(`wrote THIRD-PARTY-LICENSES.txt (${collectPackages().length} packages, ${Math.round(text.length / 1024)} kB)`);
}
