import { describe, expect, it } from "vitest";
import { protect } from "../src/shared/protect";
import { detectSource, translate } from "../src/shared/translate";
import wording from "./site-wording.json";

// Typography the site uses in English ("Account number : …") is not worth matching exactly.
const loose = (text: string) => text.replace(/\s+:/g, ":").replace(/\s+/g, " ").trim();

describe("matches the wording the site itself uses", () => {
  const same = (fr: string, en: string) => fr.toLowerCase() === en.toLowerCase();

  it("translates French to the site's own English", () => {
    for (const [fr, en] of wording.pairs) {
      if (same(fr, en)) continue;
      expect(loose(translate(fr, "en").text), fr).toBe(loose(en));
    }
  });

  it("translates the site's English to its own French", () => {
    for (const [fr, en] of wording.pairs) {
      if (same(fr, en)) continue;
      expect(loose(translate(en, "fr", "en").text), en).toBe(loose(fr));
    }
  });

  it("recognises each page's language from its own sentences", () => {
    for (const [fr, en] of wording.pairs) {
      if (same(fr, en)) continue;
      expect(detectSource(fr), fr).toBe("fr");
      expect(detectSource(en), en).toBe("en");
    }
    for (const en of wording.alsoEnglishOnTheSite) expect(detectSource(en), en).toBe("en");
  });

  it("recognises the fee-rule sentence in both languages and keeps its amounts", () => {
    for (const [fr, en] of wording.withAmounts) {
      expect(detectSource(fr), fr).toBe("fr");
      expect(detectSource(en), en).toBe("en");
      const toEn = translate(fr, "en");
      expect(toEn.status).toBe("template");
      // Every amount and the percentage survive exactly as the page wrote them.
      for (const token of protect(fr).tokens) expect(toEn.text).toContain(token.raw);
      const toFr = translate(en, "fr", "en");
      expect(toFr.status).toBe("template");
      for (const token of protect(en).tokens) expect(toFr.text).toContain(token.raw);
    }
  });

  it("keeps the English date format together as one protected value", () => {
    expect(protect("Nov 5, 2026").tokens.map((t) => `${t.kind}:${t.raw}`)).toEqual(["date:Nov 5, 2026"]);
    expect(protect("05 nov. 2026").tokens.map((t) => `${t.kind}:${t.raw}`)).toEqual(["date:05 nov. 2026"]);
  });
});
