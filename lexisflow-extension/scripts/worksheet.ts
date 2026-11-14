// Regenerates src/shared/i18n/national.json so it has one row per French source string,
// keeping every translation already filled in. Run: npm run worksheet
import { readFileSync, writeFileSync } from "node:fs";
import { STRINGS } from "../src/shared/i18n/strings.ts";

const path = new URL("../src/shared/i18n/national.json", import.meta.url);
type Row = { ewo: string; ful: string; dua: string };
let current: Record<string, Partial<Row>> = {};
try {
  current = JSON.parse(readFileSync(path, "utf8"));
} catch {
  // first run
}

const STATUS = "__status__";
const status = { ewo: "draft", ful: "draft", dua: "draft", ...(current[STATUS] ?? {}) } as Row;
const next: Record<string, Row> = { [STATUS]: status };
for (const [fr] of STRINGS) {
  const row = current[fr] ?? {};
  next[fr] = { ewo: row.ewo ?? "", ful: row.ful ?? "", dua: row.dua ?? "" };
}
writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);

const rows = Object.entries(next).filter(([key]) => key !== STATUS).map(([, row]) => row);
const filled = (code: keyof Row) => `${rows.filter((row) => row[code].trim()).length} (${status[code]})`;
const total = rows.length;
console.log(`national.json: ${total} strings — ewo ${filled("ewo")}, ful ${filled("ful")}, dua ${filled("dua")} filled`);
