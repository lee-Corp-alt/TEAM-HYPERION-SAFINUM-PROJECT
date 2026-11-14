// Round trip for native-speaker review.
//   npm run review:export   writes docs/national-review.csv (open it in Excel or Sheets)
//   npm run review:import   reads the corrected CSV back into national.json
//   npm run review:import -- path/to/sheet.csv   the same, for a sheet kept elsewhere (e.g. a speaker's priority sheet)
//   npm run review:import -- path/to/sheet.docx  a priority sheet a speaker edited in Word (the language is read from the sheet)
// Import refuses any row where a placeholder ({1} {2} {3} {*}) was added, removed or changed,
// so a reviewer cannot accidentally break an amount or a name.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXTRA_STRINGS, STRINGS } from "../src/shared/i18n/strings.ts";
import { parseReturnedDocx } from "./priority-sheet.ts";

const JSON_PATH = new URL("../src/shared/i18n/national.json", import.meta.url);
const CSV_PATH = process.argv[3] ? pathToFileURL(resolve(process.argv[3])) : new URL("../../docs/national-review.csv", import.meta.url);
const LANGS = ["ewo", "ful", "dua"] as const;
type Table = Record<string, Record<string, string>>;

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

const slots = (text: string) => (text.match(/\{(?:\d+|\*)\}/g) ?? []).sort().join(" ");
// In the French source, # and * stand for the same slots.
const frSlots = (fr: string) => {
  let n = 0;
  return fr
    .split("")
    .flatMap((c) => (c === "#" ? [`{${++n}}`] : c === "*" ? ["{*}"] : []))
    .sort()
    .join(" ");
};

const mode = process.argv[2];
const table = JSON.parse(readFileSync(JSON_PATH, "utf8")) as Table;

if (mode === "export") {
  const lines = [["Français (source)", "English", "Ewondo", "Fulfulde", "Duala"].map(quote).join(",")];
  for (const [fr, en] of STRINGS) {
    const english = typeof en === "string" ? en : en[0];
    const row = table[fr] ?? {};
    lines.push([fr, english, row.ewo ?? "", row.ful ?? "", row.dua ?? ""].map(quote).join(","));
  }
  // BOM so Excel opens accents and special letters correctly.
  writeFileSync(CSV_PATH, `﻿${lines.join("\r\n")}\r\n`);
  console.log(`wrote ${STRINGS.length} rows to docs/national-review.csv`);
} else if (mode === "import") {
  let rows: string[][];
  const wordFile = process.argv[3]?.toLowerCase().endsWith(".docx") ? resolve(process.argv[3]) : null;
  if (wordFile) {
    // A priority sheet edited in Word: the correction column of the speaker's language becomes that language's cell.
    const { language, rows: returned } = parseReturnedDocx(readFileSync(wordFile));
    if (!language) throw new Error('could not tell which language this sheet is for: the "(brouillon)" column header is missing');
    const column = 2 + LANGS.indexOf(language);
    rows = returned.map((r) => {
      const cells = [r.french, "", "", "", ""];
      cells[column] = r.correction;
      return cells;
    });
    const ticked = (verdict: string) => returned.filter((r) => r.verdicts.includes(verdict)).length;
    console.log(`Word sheet for ${language}: ${returned.length} rows read, ${returned.filter((r) => r.correction).length} with a correction written`);
    console.log(`verdicts ticked (check against the sheet itself): Correct ${ticked("Correct")}, Corrigé ${ticked("Corrigé")}, Je ne sais pas ${ticked("Je ne sais pas")}`);
  } else {
    const [header, ...csvRows] = parseCsv(readFileSync(CSV_PATH, "utf8"));
    if (!header || header.length < 5) throw new Error("expected 5 columns: Français, English, Ewondo, Fulfulde, Duala");
    rows = csvRows;
  }
  // The extra words (action verbs, a few security phrases) have no national text yet; a speaker may supply it.
  const known = new Set([...STRINGS, ...EXTRA_STRINGS].map(([fr]) => fr));
  let changed = 0;
  const rejected: string[] = [];
  for (const cells of rows) {
    const fr = cells[0]?.trim();
    if (!fr || !known.has(fr)) {
      rejected.push(`unknown source row: ${cells[0]}`);
      continue;
    }
    LANGS.forEach((code, i) => {
      const value = (cells[2 + i] ?? "").trim();
      if (!value || value === table[fr]?.[code]) return;
      if (slots(value) !== frSlots(fr)) {
        rejected.push(`${code} "${fr}": placeholders must be exactly [${frSlots(fr) || "none"}], found [${slots(value) || "none"}]`);
        return;
      }
      table[fr] = { ...table[fr], [code]: value };
      changed++;
    });
  }
  writeFileSync(JSON_PATH, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`imported ${changed} changed cells`);
  for (const message of rejected) console.warn(`REJECTED ${message}`);
  if (rejected.length) process.exitCode = 1;
} else {
  console.log("usage: review-sheet.ts export | import");
}
