import { describe, expect, it } from "vitest";
import { UI_KEYS, t, uiRow } from "../src/shared/ui";

const LANGS = ["fr", "en", "ewo", "ful", "dua"] as const;
const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(" ");

describe("LexisFlow's own text", () => {
  it("has every key in all five languages", () => {
    for (const key of UI_KEYS) {
      for (const lang of LANGS) expect(uiRow(key)[lang]?.trim(), `${key} / ${lang}`).toBeTruthy();
    }
  });

  it("keeps the same placeholders in every language", () => {
    for (const key of UI_KEYS) {
      const expected = slots(uiRow(key).fr);
      for (const lang of LANGS) expect(slots(uiRow(key)[lang]), `${key} / ${lang}`).toBe(expected);
    }
  });

  it("fills placeholders", () => {
    expect(t("en", "sentenceOf", { n: 2, total: 19 })).toBe("Sentence 2 of 19");
    expect(t("fr", "sentenceOf", { n: 2, total: 19 })).toBe("Phrase 2 sur 19");
    expect(t("fr", "speed", { speed: "1.25x" })).toContain("1.25x");
    for (const lang of LANGS) expect(t(lang, "translatedInfo", { done: 12, left: 3 })).toMatch(/12.*3|3.*12/);
  });

  it("falls back to French when a national entry is empty", () => {
    const row = uiRow("close");
    const saved = row.ewo;
    row.ewo = "";
    expect(t("ewo", "close")).toBe(row.fr);
    row.ewo = saved;
  });

  it("keeps the product name untranslated", () => {
    for (const key of ["dockLabel", "close", "collapse", "expand", "popupAria", "popupEnable"] as const) {
      for (const lang of LANGS) expect(t(lang, key), `${key} / ${lang}`).toContain("LexisFlow");
    }
  });
});
