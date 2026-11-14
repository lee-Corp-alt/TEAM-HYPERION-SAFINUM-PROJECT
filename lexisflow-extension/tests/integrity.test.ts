import { describe, expect, it } from "vitest";
import { STRINGS } from "../src/shared/i18n/strings";
import { numberToWords, spokenToken } from "../src/shared/numbers";
import { numericValue, protect, restore, sameProtectedValues } from "../src/shared/protect";
import { nationalStatus, translate } from "../src/shared/translate";
import { approximateForFrenchVoice } from "../src/content/reader";

const kinds = (text: string) => protect(text).tokens.map((t) => `${t.kind}:${t.raw}`);

describe("protect", () => {
  it("captures every value format seen on the test page", () => {
    expect(kinds("250 000 FCFA")).toEqual(["amount:250 000 FCFA"]);
    expect(kinds("250,000 FCFA")).toEqual(["amount:250,000 FCFA"]);
    expect(kinds("-12 500 FCFA")).toEqual(["amount:-12 500 FCFA"]);
    expect(kinds("+180 000 FCFA")).toEqual(["amount:+180 000 FCFA"]);
    expect(kinds("0 FCFA")).toEqual(["amount:0 FCFA"]);
    expect(kinds("25000")).toEqual(["number:25000"]);
    expect(kinds("Numéro de compte : CM 001 2345 6789 01")).toEqual(["account:CM 001 2345 6789 01"]);
    expect(kinds("+237 6 99 12 34 56")).toEqual(["phone:+237 6 99 12 34 56"]);
    expect(kinds("SAF-2026-7N9NIT")).toEqual(["reference:SAF-2026-7N9NIT"]);
    expect(kinds("AMOUNT_002")).toEqual(["code:AMOUNT_002"]);
    expect(kinds("05 nov. 2026")).toEqual(["date:05 nov. 2026"]);
    expect(kinds("Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)")).toEqual([
      "percent:1,5 %",
      "amount:100 FCFA",
      "amount:2 500 FCFA",
    ]);
    expect(kinds("1 000 XAF et 500 F CFA")).toEqual(["amount:1 000 XAF", "amount:500 F CFA"]);
  });

  it("leaves names and plain words alone", () => {
    expect(kinds("Jean-Paul Mbarga")).toEqual([]);
    expect(kinds("Amina Ngo Bell")).toEqual([]);
    expect(kinds("Mobile Money")).toEqual([]);
  });

  it("round-trips verbatim, including narrow no-break spaces", () => {
    const text = "Total : 25 375 FCFA pour SAF-2026-7N9NIT le 05 nov. 2026";
    const { template, tokens } = protect(text);
    expect(template.replace(/⟦N\d+⟧/g, "")).not.toMatch(/\d/);
    expect(restore(template, tokens)).toBe(text);
  });

  it("rejects output with a changed, missing or extra value", () => {
    const { tokens } = protect("Frais : 375 FCFA, total 25 375 FCFA");
    expect(sameProtectedValues("Fee 375 FCFA, total 25 375 FCFA", tokens)).toBe(true);
    expect(sameProtectedValues("total 25 375 FCFA, fee 375 FCFA", tokens)).toBe(true);
    expect(sameProtectedValues("Fee 357 FCFA, total 25 375 FCFA", tokens)).toBe(false);
    expect(sameProtectedValues("Fee 375 FCFA", tokens)).toBe(false);
    expect(sameProtectedValues("Fee 375 FCFA, total 25 375 FCFA, 1 FCFA", tokens)).toBe(false);
    expect(sameProtectedValues("Fee 375 XAF, total 25 375 FCFA", tokens)).toBe(false);
  });

  it("refuses to restore a template that drops or repeats a placeholder", () => {
    const { tokens } = protect("375 FCFA puis 25 375 FCFA");
    expect(() => restore("⟦N1⟧ only", tokens)).toThrow();
    expect(() => restore("⟦N1⟧ ⟦N1⟧ ⟦N2⟧", tokens)).toThrow();
  });

  it("reads thousands and decimals by context", () => {
    const value = (text: string) => numericValue(protect(text).tokens[0]);
    expect(value("250 000 FCFA")).toEqual({ sign: "", integer: "250000", fraction: null });
    expect(value("250,000 FCFA")).toEqual({ sign: "", integer: "250000", fraction: null });
    expect(value("-749 999 FCFA")).toEqual({ sign: "-", integer: "749999", fraction: null });
    expect(value("1,5 %")).toEqual({ sign: "", integer: "1", fraction: "5" });
    expect(value("2 %")).toEqual({ sign: "", integer: "2", fraction: null });
    expect(value("12,50 FCFA")).toEqual({ sign: "", integer: "12", fraction: "50" });
  });
});

describe("spoken numbers", () => {
  it("writes French numbers correctly", () => {
    const fr = (n: number) => numberToWords(n, "fr");
    expect(fr(0)).toBe("zéro");
    expect(fr(21)).toBe("vingt et un");
    expect(fr(71)).toBe("soixante et onze");
    expect(fr(80)).toBe("quatre-vingts");
    expect(fr(81)).toBe("quatre-vingt-un");
    expect(fr(99)).toBe("quatre-vingt-dix-neuf");
    expect(fr(200)).toBe("deux cents");
    expect(fr(375)).toBe("trois cent soixante-quinze");
    expect(fr(1000)).toBe("mille");
    expect(fr(2500)).toBe("deux mille, cinq cents");
    expect(fr(25375)).toBe("vingt-cinq mille, trois cent soixante-quinze");
    expect(fr(80000)).toBe("quatre-vingt mille");
    expect(fr(200000)).toBe("deux cent mille");
    expect(fr(250000)).toBe("deux cent cinquante mille");
    expect(fr(1000000)).toBe("un million");
  });

  it("writes English numbers correctly", () => {
    const en = (n: number) => numberToWords(n, "en");
    expect(en(15)).toBe("fifteen");
    expect(en(40)).toBe("forty");
    expect(en(375)).toBe("three hundred seventy-five");
    expect(en(250000)).toBe("two hundred fifty thousand");
    expect(en(25375)).toBe("twenty-five thousand, three hundred seventy-five");
  });

  it("speaks each token kind in full", () => {
    const say = (text: string, lang: "fr" | "en") => spokenToken(protect(text).tokens[0], lang);
    expect(say("250 000 FCFA", "fr")).toBe("deux cent cinquante mille francs CFA");
    expect(say("250,000 FCFA", "en")).toBe("two hundred fifty thousand CFA francs");
    expect(say("-12 500 FCFA", "fr")).toBe("moins douze mille, cinq cents francs CFA");
    expect(say("+50 000 FCFA", "fr")).toBe("plus cinquante mille francs CFA");
    expect(say("1,5 %", "fr")).toBe("un virgule cinq pour cent");
    expect(say("+237 6 99 12 34 56", "fr")).toBe(
      "plus deux trois sept, six, neuf neuf, un deux, trois quatre, cinq six",
    );
    expect(say("SAF-2026-7N9NIT", "en")).toBe("S A F, two zero two six, seven N nine N I T");
    expect(say("05 nov. 2026", "fr")).toBe("05 novembre 2026");
  });
});

describe("translate", () => {
  it("translates every template both ways and keeps protected values", () => {
    const sample = (key: string) =>
      key
        .replace("*", "Amina")
        .replace("#", "1,5 %")
        .replace("#", "100 FCFA")
        .replace("#", "2 500 FCFA");
    for (const [fr, en] of STRINGS) {
      const english = typeof en === "string" ? en : en[0];
      const source = fr.includes("compte : #") ? fr.replace("#", "CM 001 2345 6789 01") : sample(fr);
      const toEn = translate(source, "en");
      if (fr.toLowerCase() === english.toLowerCase()) continue; // identical in both languages
      expect(toEn.status, fr).toBe("template");
      expect(sameProtectedValues(toEn.text, toEn.tokens), fr).toBe(true);
      const back = translate(toEn.text, "fr", "en");
      expect(back.status, english).toBe("template");
      expect(back.text.toLowerCase(), english).toBe(source.toLowerCase());
    }
  });

  it("matches text regardless of case, spacing and apostrophe style", () => {
    expect(translate("SOLDE   DISPONIBLE", "en").text).toBe("Available balance");
    expect(translate("Type d’opération", "en").text).toBe("Operation type");
    expect(translate("Numéro de compte : CM 001 2345 6789 01", "en").text).toBe(
      "Account number: CM 001 2345 6789 01",
    );
  });

  it("keeps a name verbatim inside a template", () => {
    const result = translate("Bonjour, Amina", "en");
    expect(result.text).toBe("Hello, Amina");
  });

  it("moves values without altering them", () => {
    const result = translate("Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)", "en");
    expect(result.text).toBe("1,5 % fee (min. 100 FCFA, max. 2 500 FCFA)");
    expect(result.segments.filter((s) => s.protectedValue).map((s) => s.text)).toEqual([
      "1,5 %",
      "100 FCFA",
      "2 500 FCFA",
    ]);
  });

  it("never invents a translation", () => {
    expect(translate("Jean-Paul Mbarga", "en").status).toBe("unknown");
    expect(translate("Jean-Paul Mbarga", "en").text).toBe("Jean-Paul Mbarga");
    expect(translate("Votre carte a été bloquée pour fraude.", "ewo")).toMatchObject({
      status: "unknown",
      text: "Votre carte a été bloquée pour fraude.",
    });
    expect(translate("250 000 FCFA", "en").status).toBe("verbatim");
    expect(translate("Votre carte a été bloquée pour fraude.", "ful").lang).toBe("fr");
  });

  it("gives a draft, value-safe translation in each national language", () => {
    for (const code of ["ewo", "ful", "dua"] as const) {
      expect(nationalStatus(code)).toBe("draft");
      for (const [fr] of STRINGS) {
        const source = fr.includes("compte : #")
          ? fr.replace("#", "CM 001 2345 6789 01")
          : fr.replace("*", "Amina").replace("#", "1,5 %").replace("#", "100 FCFA").replace("#", "2 500 FCFA");
        const result = translate(source, code);
        expect(result.status, `${code}: ${fr}`).toBe("template");
        expect(result.lang).toBe(code);
        expect(sameProtectedValues(result.text, result.tokens), `${code}: ${fr}`).toBe(true);
        expect(result.text, `${code}: ${fr}`).not.toMatch(/[{}#⟦⟧]/);
        if (fr.includes("*")) expect(result.text).toContain("Amina");
      }
    }
    expect(translate("Solde disponible", "ful").text).toBe("Ceede ngonɗe nder konte");
    expect(translate("Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)", "dua").text).toBe(
      "Sawedi la 1,5 % (o wase: 100 FCFA, o mɔ̌ń: 2 500 FCFA)",
    );
  });

  it("maps special letters for the French voice without touching displayed text", () => {
    expect(approximateForFrenchVoice("Ƴeewtu limgal keɓoowo")).toBe("Yeewtu limgal keboowo");
    expect(approximateForFrenchVoice("Nɔ́mba kónte")).toBe("Nomba konte");
    expect(approximateForFrenchVoice("Mɔni mɛsɛ")).toBe("Moni mèsè");
    expect(approximateForFrenchVoice("Tañ moní")).toBe("Tagn moni");
    expect(approximateForFrenchVoice("Loma la peńa")).toBe("Loma la pena");
  });

  it("reports text already in the target language", () => {
    expect(translate("Solde disponible", "fr").status).toBe("same");
    expect(translate("Available balance", "en").status).toBe("same");
  });
});
