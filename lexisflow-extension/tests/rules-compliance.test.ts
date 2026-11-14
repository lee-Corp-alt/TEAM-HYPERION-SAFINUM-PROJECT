// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PageTranslator } from "../src/content/page-translator";
import { spokenToken } from "../src/shared/numbers";
import { protect, restore } from "../src/shared/protect";
import { translate } from "../src/shared/translate";

// The cases written in the team's "rules and regulations" and "testing the rules" documents.

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Test 1 — jury live injection (the document's own snippet)", () => {
  let page: PageTranslator | null = null;
  afterEach(() => page?.destroy());

  it("translates the injected alert within 500 ms and leaves the amount untouched", async () => {
    document.body.innerHTML = `<main><p>Solde disponible</p><p>Frais</p></main>`;
    page = new PageTranslator();
    page.start();
    page.setTarget("en");
    await wait(80);

    const div = document.createElement("div");
    div.innerHTML = "<p>Alerte de sécurité : Tentative de connexion détectée.</p><span>+45 000 FCFA</span>";
    const started = performance.now();
    document.body.appendChild(div);

    let elapsed = -1;
    while (performance.now() - started < 1000) {
      await wait(5);
      if (div.querySelector("p")?.textContent !== "Alerte de sécurité : Tentative de connexion détectée.") {
        elapsed = performance.now() - started;
        break;
      }
    }
    expect(elapsed).toBeGreaterThan(-1);
    expect(elapsed).toBeLessThan(500);
    expect(div.querySelector("p")?.textContent).toBe("Security alert: Login attempt detected.");
    expect(div.querySelector("span")?.textContent).toBe("+45 000 FCFA");
  });
});

describe("Test 3 — critical action words never flip meaning", () => {
  const PAIRS: [string, string][] = [
    ["Envoyer", "Send"],
    ["Confirmer", "Confirm"],
    ["Annuler", "Cancel"],
    ["Valider", "Validate"],
    ["Virement", "Transfer"],
  ];

  it("translates each one to its true opposite-free equivalent, both ways", () => {
    for (const [fr, en] of PAIRS) {
      expect(translate(fr, "en", "fr")).toMatchObject({ status: "template", text: en });
      expect(translate(en, "fr", "en")).toMatchObject({ status: "template", text: fr });
    }
  });

  it("never turns Cancel into anything resembling Continue or Confirm", () => {
    const cancel = translate("Annuler", "en").text.toLowerCase();
    expect(cancel).toBe("cancel");
    expect(translate("Continuer", "en").text).not.toBe(translate("Annuler", "en").text);
    expect(translate("Annuler", "en").text).not.toBe(translate("Confirmer", "en").text);
  });

  it("gives every different action button its own, different translation in every language", () => {
    // If two buttons ever came out as the same word, one of them would mean the wrong thing.
    const buttons = ["Retour", "Continuer", "Modifier", "Confirmer le transfert", "Effectuer un transfert", "Nouveau transfert", "Consulter les frais"];
    for (const code of ["en", "ewo", "ful", "dua"] as const) {
      const words = buttons.map((fr) => translate(fr, code, "fr"));
      for (const word of words) expect(word.status, `${code}: ${word.text}`).toBe("template");
      expect(new Set(words.map((w) => w.text.toLowerCase())).size, code).toBe(buttons.length);
    }
  });

  it("does not guess national-language words: they stay in the source language, flagged as missing", () => {
    for (const [fr] of PAIRS) {
      for (const code of ["ewo", "ful", "dua"] as const) {
        const result = translate(fr, code, "fr");
        expect(result.status, `${code}: ${fr}`).toBe("missing");
        expect(result.text).toBe(fr);
      }
    }
  });

  it("keeps the security alerts clearly cautionary", () => {
    expect(translate("Votre compte a été temporairement bloqué.", "en").text).toBe("Your account has been temporarily blocked.");
    expect(translate("Ne communiquez jamais votre code PIN ou votre code de vérification.", "en").text).toBe(
      "Never share your PIN or verification code.",
    );
    expect(translate("Transaction suspecte détectée.", "en").text).toBe("Suspicious transaction detected.");
  });
});

describe("Test 2 — protected values survive character for character", () => {
  const SAMPLES: [string, string][] = [
    ["+45 000 FCFA", "amount"],
    ["-12 500 FCFA", "amount"],
    ["+180 000 FCFA", "amount"],
    ["250 000 FCFA", "amount"],
    ["250,000 FCFA", "amount"],
    ["5000 XOF", "amount"],
    ["100 EUR", "amount"],
    ["12,50 €", "amount"],
    ["50 USD", "amount"],
    ["$50", "amount"],
    ["+237 699 00 11 22", "phone"],
    ["00237 699 00 11 22", "phone"],
    ["699 00 11 22", "phone"],
    ["REF-2026-9941", "reference"],
    ["TXN12345", "reference"],
    ["CM 001 2345 6789 01", "account"],
    ["CM21 1000 2000 3000 4000 5000 6", "account"],
    ["05 nov. 2026", "date"],
  ];

  it("recognises every value in the document as one protected value of the right kind", () => {
    for (const [text, kind] of SAMPLES) {
      const { tokens } = protect(text);
      expect(tokens, text).toHaveLength(1);
      expect(tokens[0].kind, text).toBe(kind);
      expect(tokens[0].raw, text).toBe(text);
    }
  });

  it("restores every value verbatim inside a sentence", () => {
    for (const [text] of SAMPLES) {
      const sentence = `Bénéficiaire Jean-Baptiste Kamga : ${text} confirmé`;
      const { template, tokens } = protect(sentence);
      expect(restore(template, tokens)).toBe(sentence);
    }
  });

  it("does not take ordinary numbers for phones or IDs", () => {
    expect(protect("Étape 2 sur 5").tokens.map((t) => t.kind)).toEqual(["number", "number"]);
    expect(protect("600 000 FCFA").tokens.map((t) => t.kind)).toEqual(["amount"]);
    expect(protect("Jean-Baptiste Kamga").tokens).toEqual([]);
  });

  it("speaks the right currency", () => {
    const say = (text: string, lang: "fr" | "en") => spokenToken(protect(text).tokens[0], lang);
    expect(say("+180 000 FCFA", "fr")).toBe("plus cent quatre-vingt mille francs CFA");
    expect(say("-12 500 FCFA", "en")).toBe("minus twelve thousand, five hundred CFA francs");
    expect(say("100 EUR", "fr")).toBe("cent euros");
    expect(say("12,50 €", "en")).toBe("twelve point five zero euros");
    expect(say("$50", "en")).toBe("fifty dollars");
  });

  it("speaks dates in the voice's own language, never as raw symbols", () => {
    const say = (text: string, lang: "fr" | "en") => spokenToken(protect(text).tokens[0], lang);
    expect(say("05 nov. 2026", "en")).toBe("November 5, 2026");
    expect(say("04 nov. 2026", "fr")).toBe("04 novembre 2026");
    expect(say("Nov 5, 2026", "fr")).toBe("5 novembre 2026");
    expect(say("Nov 5, 2026", "en")).toBe("November 5, 2026");
    expect(say("12 janv. 2027", "en")).toBe("January 12, 2027");
    expect(say("3 août 2026", "en")).toBe("August 3, 2026");
  });
});

describe("Test 5 — privacy and permissions, checked from the source", () => {
  const root = process.cwd(); // vitest runs from the project folder
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const sources = files(join(root, "src")).map((path) => ({ path, text: readFileSync(path, "utf-8") }));
  // Code only: comments may mention the things the code must not do.
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("never writes to page-visible or persistent storage other than the preferences", () => {
    for (const { path, text } of sources) {
      expect(code(text), path).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open)\b/);
    }
    const storageUsers = sources.filter(({ text }) => /chrome\.storage/.test(code(text))).map(({ path }) => path.replace(/\\/g, "/").split("/src/")[1]);
    expect(storageUsers).toEqual(["shared/prefs.ts"]);
    expect(readFileSync(join(root, "src/shared/prefs.ts"), "utf-8")).toMatch(/lexisflow\.prefs/);
  });

  it("makes no network calls at all", () => {
    for (const { path, text } of sources) {
      expect(code(text), path).not.toMatch(/\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.mediaDevices)\b/);
      expect(code(text), path).not.toMatch(/https?:\/\/(?!localhost)/);
    }
    const fetchers = sources.filter(({ text }) => /\bfetch\(/.test(code(text))).map(({ path }) => path.replace(/\\/g, "/").split("/src/")[1]);
    expect(fetchers).toEqual([]);
  });

  it("asks for the smallest set of permissions and only the test site", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public/manifest.json"), "utf-8")) as {
      permissions: string[];
      host_permissions?: string[];
      content_scripts: { matches: string[] }[];
      content_security_policy: { extension_pages: string };
      externally_connectable?: unknown;
    };
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts.flatMap((c) => c.matches)).toEqual(["https://safinum.cm/*"]);
    expect(manifest.externally_connectable).toBeUndefined();
    const csp = manifest.content_security_policy.extension_pages;
    expect(csp).not.toMatch(/https?:|\*/); // no remote script, style, image or connect sources
    expect(csp).not.toMatch(/eval/); // neither 'unsafe-eval' nor 'wasm-unsafe-eval': nothing is compiled or run from text
  });
});
