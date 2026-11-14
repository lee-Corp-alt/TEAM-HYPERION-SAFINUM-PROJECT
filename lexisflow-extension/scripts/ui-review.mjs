// Round trip for native-speaker review of LexisFlow's own interface text.
//   npm run ui:export   writes docs/ui-review.csv (open it in Excel or Sheets)
//   npm run ui:import   reads the corrected CSV back into src/shared/i18n/ui.json
// Only the Ewondo, Fulfulde and Duala columns are read back. A cell is rejected if it adds, drops
// or renames a {placeholder}, so a reviewer cannot break "Sentence {n} of {total}" by accident.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = join(root, "src", "shared", "i18n", "ui.json");
const CSV_PATH = join(root, "..", "docs", "ui-review.csv");
const LANGS = ["ewo", "ful", "dua"];

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(" ");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') (cell += '"'), i++;
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else if (char === '"') inQuotes = true;
    else if (char === "," || char === ";") (row.push(cell), (cell = ""));
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const table = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const keys = Object.keys(table).filter((key) => key !== "__status__");
const mode = process.argv[2];

if (mode === "export") {
  const lines = [["Clé", "Français", "English", "Ewondo", "Fulfulde", "Duala"].map(quote).join(",")];
  for (const key of keys) {
    const row = table[key];
    lines.push([key, row.fr, row.en, row.ewo ?? "", row.ful ?? "", row.dua ?? ""].map(quote).join(","));
  }
  writeFileSync(CSV_PATH, `﻿${lines.join("\r\n")}\r\n`);
  console.log(`wrote ${keys.length} rows to docs/ui-review.csv`);
} else if (mode === "import") {
  const [header, ...rows] = parseCsv(readFileSync(CSV_PATH, "utf8"));
  if (!header || header.length < 6) throw new Error("expected 6 columns: Clé, Français, English, Ewondo, Fulfulde, Duala");
  let changed = 0;
  const rejected = [];
  for (const cells of rows) {
    const key = cells[0]?.trim();
    if (!key || !table[key]) {
      rejected.push(`unknown key: ${cells[0]}`);
      continue;
    }
    LANGS.forEach((code, i) => {
      const value = (cells[3 + i] ?? "").trim();
      if (!value || value === table[key][code]) return;
      if (slots(value) !== slots(table[key].fr)) {
        rejected.push(`${key} / ${code}: placeholders must be [${slots(table[key].fr) || "none"}], found [${slots(value) || "none"}]`);
        return;
      }
      table[key][code] = value;
      changed++;
    });
  }
  writeFileSync(JSON_PATH, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`imported ${changed} changed cells`);
  for (const message of rejected) console.warn(`REJECTED ${message}`);
  if (rejected.length) process.exitCode = 1;
} else {
  console.log("usage: ui-review.mjs export | import");
}
