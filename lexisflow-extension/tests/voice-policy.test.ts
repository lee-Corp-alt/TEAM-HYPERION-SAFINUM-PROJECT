// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Reader } from "../src/content/reader";
import type { Block } from "../src/content/scanner";
import type { LanguageCode } from "../src/shared/prefs";

interface Prepared {
  voice: "fr" | "en";
  spoken: string;
  notice: string | null;
}
type Internals = { prepare(block: Block): Prepared; sourceHint: "fr" | "en" };

function reader(language: LanguageCode, pageLanguage: "fr" | "en" = "fr"): Internals {
  const r = new Reader();
  r.configure(language, 1);
  const internals = r as unknown as Internals;
  internals.sourceHint = pageLanguage;
  return internals;
}

const block = (text: string, kind: "text" | "field" = "text"): Block => ({
  el: document.createElement("p"),
  text,
  kind,
  alert: null,
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("one voice for the whole reading (no jumping to French)", () => {
  it("reads everything in English when English is chosen, on a French page", () => {
    const r = reader("en", "fr");
    expect(r.prepare(block("Solde disponible")).voice).toBe("en"); // translated
    expect(r.prepare(block("Jean-Paul Mbarga", "field")).voice).toBe("en"); // typed detail
    expect(r.prepare(block("Un message que personne n'a traduit.")).voice).toBe("en"); // no translation
    expect(r.prepare(block("Balance")).voice).toBe("en"); // already English
  });

  it("reads everything in French when French is chosen, on an English page", () => {
    const r = reader("fr", "en");
    expect(r.prepare(block("Available balance")).voice).toBe("fr");
    expect(r.prepare(block("Jean-Paul Mbarga", "field")).voice).toBe("fr");
    expect(r.prepare(block("Some message nobody translated.")).voice).toBe("fr");
  });

  it("flags text it could not translate instead of silently switching voice", () => {
    const r = reader("en", "fr");
    // LexisFlow's own messages are in the site's language (French here), whatever language is read.
    expect(r.prepare(block("Un message que personne n'a traduit.")).notice).toMatch(/traduction indisponible/i);
    expect(r.prepare(block("Solde disponible")).notice).toBeNull();
  });
});

describe("LexisFlow's own messages follow the site's language", () => {
  it("uses English messages on an English site", () => {
    const r = new Reader();
    r.setPageLanguage("en");
    r.configure("fr", 1);
    (r as unknown as Internals).sourceHint = "en";
    const notice = (r as unknown as Internals).prepare(block("Some message nobody translated.")).notice;
    expect(notice).toMatch(/translation unavailable/i);
  });
});

describe("money is spoken in the voice's language", () => {
  it("English reading: English number words, even on a French page", () => {
    const spoken = reader("en", "fr").prepare(block("Solde disponible : 250 000 FCFA")).spoken;
    expect(spoken).toContain("two hundred fifty thousand CFA francs");
  });

  it("French reading: French number words, even on an English page", () => {
    const spoken = reader("fr", "en").prepare(block("Available balance 250,000 FCFA")).spoken;
    expect(spoken).toContain("deux cent cinquante mille francs CFA");
  });

  it("national language on a French page: the page's own language, French", () => {
    for (const language of ["ewo", "ful", "dua"] as const) {
      const prepared = reader(language, "fr").prepare(block("Frais : 375 FCFA"));
      expect(prepared.voice, language).toBe("fr");
      expect(prepared.spoken, language).toContain("trois cent soixante-quinze francs CFA");
    }
  });

  it("national language on an English page: English voice and English money", () => {
    for (const language of ["ewo", "ful", "dua"] as const) {
      const prepared = reader(language, "en").prepare(block("Fee: 375 FCFA"));
      expect(prepared.voice, language).toBe("en");
      expect(prepared.spoken, language).toContain("three hundred seventy-five CFA francs");
    }
  });

  it("typed details keep their digits and follow the same voice", () => {
    const phone = block("+237 6 99 12 34 56", "field");
    expect(reader("en", "fr").prepare(phone).spoken).toMatch(/two three seven/);
    expect(reader("fr", "en").prepare(phone).spoken).toMatch(/deux trois sept/);
  });

  it("never alters the amount that is shown", () => {
    const view = reader("en", "fr").prepare(block("Total à débiter 25 375 FCFA")) as unknown as { segments: { text: string }[] };
    expect(view.segments.map((s) => s.text).join("")).toContain("25 375 FCFA");
  });
});
