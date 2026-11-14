import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// The priority review sheets handed to native speakers must always match the real phrase table.

const root = process.cwd();
const table = JSON.parse(readFileSync(join(root, "src/shared/i18n/national.json"), "utf-8")) as Record<string, Record<string, string>>;

interface Sheet {
  PRIORITY: { title: string; sentences: string[]; toSupply?: boolean }[];
  LANGUAGES: { code: "ewo" | "ful" | "dua"; name: string; column: number }[];
  rowsFor: (code: "ewo" | "ful" | "dua", table: unknown) => { french: string; english: string; draft: string; group: { toSupply?: boolean } }[];
  csvFor: (lang: { code: "ewo" | "ful" | "dua"; name: string; column: number }, table: unknown) => string;
  pageFor: (lang: { code: "ewo" | "ful" | "dua"; name: string }, table: unknown) => string;
}
const load = async () => (await import(/* @vite-ignore */ pathToFileURL(join(root, "scripts", "priority-sheet.ts")).href)) as Sheet;

/** Reads the sheet back the way Excel would: quoted cells, doubled quotes, Windows line breaks. */
function parse(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n") (row.push(cell), rows.push(row), (row = []), (cell = ""));
    else if (c !== "\r") cell += c;
  }
  return rows;
}

describe("priority review sheets", () => {
  it("only list sentences that really are in the phrase table, in the jury's order of importance", async () => {
    const { PRIORITY, rowsFor } = await load();
    expect(() => rowsFor("dua", table)).not.toThrow(); // throws on any sentence that is not in the table
    expect(PRIORITY.map((g) => g.title.slice(0, 2))).toEqual(["1.", "2.", "3.", "4.", "5."]);
    expect(PRIORITY[0].title).toMatch(/sécurité/i); // security warnings come first
    expect(PRIORITY[1].title).toMatch(/argent/i); // then money
    for (const group of PRIORITY) expect(group.sentences.length, group.title).toBeGreaterThan(0);
  });

  it("hold the current draft of the speaker's own language, and nothing for the other two", async () => {
    const { LANGUAGES, csvFor, rowsFor } = await load();
    for (const lang of LANGUAGES) {
      const rows = parse(csvFor(lang, table));
      const header = rows[0];
      expect(header.slice(0, 5)).toEqual(["Français (source)", "English", "Ewondo", "Fulfulde", "Duala"]);
      expect(rows.filter((r) => r.length > 1).length - 1).toBe(rowsFor(lang.code, table).length);
      for (const row of rows.slice(1).filter((r) => r.length > 1)) {
        for (const other of LANGUAGES.filter((o) => o.code !== lang.code)) expect(row[other.column], `${lang.name} sheet must not show ${other.name}`).toBe("");
        const reviewed = rowsFor(lang.code, table).find((r) => r.french === row[0]);
        expect(row[lang.column]).toBe(reviewed!.draft);
      }
    }
  });

  it("keep every amount slot of the draft exactly as it is, so a corrected sheet can be imported", async () => {
    const { LANGUAGES, csvFor } = await load();
    const fees = "Frais de # (min. #, max. #)";
    for (const lang of LANGUAGES) {
      const row = parse(csvFor(lang, table)).find((r) => r[0] === fees)!;
      expect(row[lang.column]).toMatch(/\{1\}[\s\S]*\{2\}[\s\S]*\{3\}/);
    }
  });

  it("ask the speaker to write the words that have no national text yet, not to correct an invented one", async () => {
    const { LANGUAGES, rowsFor } = await load();
    for (const lang of LANGUAGES) {
      const supply = rowsFor(lang.code, table).filter((r) => r.group.toSupply);
      expect(supply.map((r) => r.french)).toContain("Annuler");
      for (const row of supply) expect(row.draft, `${lang.name}: ${row.french}`).toBe("");
    }
  });

  it("produce a printable page in French that names the language, explains the amount signs and has a place for the reviewer", async () => {
    const { LANGUAGES, pageFor } = await load();
    for (const lang of LANGUAGES) {
      const page = pageFor(lang, table);
      expect(page).toContain(`Relecture de traductions en ${lang.name}`);
      expect(page).toContain("{1} {2} {3}");
      expect(page).toContain("Relecteur (nom ou initiales)");
      expect(page).toMatch(/Je ne sais pas/);
      expect(page).not.toMatch(/<script/i);
    }
  });
});
