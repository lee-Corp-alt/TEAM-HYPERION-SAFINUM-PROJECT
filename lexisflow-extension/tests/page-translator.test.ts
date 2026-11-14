// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageTranslator } from "../src/content/page-translator";
import { HOST_ID } from "../src/content/scanner";

const PAGE = `
  <main id="app">
    <p id="a">Solde disponible</p>
    <p id="b">250 000 FCFA</p>
    <p id="c">Frais</p>
    <span id="d">375 FCFA</span>
    <p id="e">Numéro de compte : CM 001 2345 6789 01</p>
    <p id="f">Jean-Paul Mbarga</p>
    <p id="g">Offre du jury que personne n'a traduite.</p>
    <select id="s"><option value="safinum">Compte Safinum</option></select>
    <input id="i" value="Frais">
    <script id="x">var a = "Solde disponible";</script>
    <div id="${HOST_ID}"><p id="h">Solde disponible</p></div>
  </main>`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (id: string) => document.getElementById(id)?.textContent;
let page: PageTranslator;
let heard: string[];

beforeEach(() => {
  document.body.innerHTML = PAGE;
  heard = [];
  page = new PageTranslator((language) => heard.push(language));
});
afterEach(() => page.destroy());

describe("the site's own language", () => {
  it("is detected from the page when the extension starts", () => {
    page.start();
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "fr", detected: true, switches: 0 });
    expect(heard).toEqual(["fr"]);
  });

  it("detects an English site", () => {
    document.body.innerHTML = "<p>Available balance</p><p>Transfer fees</p><p>Beneficiary name</p><p>Phone number</p>";
    page.start();
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", detected: true });
  });

  it("waits for real content before deciding", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    page.start();
    expect(page.getSnapshot().detected).toBe(false);
    document.getElementById("root")!.innerHTML =
      "<p>Available balance</p><p>Transfer fees</p><p>Beneficiary name</p><p>Phone number</p>";
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", detected: true, switches: 0 });
    expect(heard).toEqual(["en"]);
  });

  it("notices when the site switches language with its own button", async () => {
    page.start();
    page.setTarget("fr");
    const english: Record<string, string> = {
      a: "Available balance",
      c: "Fees",
      e: "Account number: CM 001 2345 6789 01",
    };
    for (const [id, value] of Object.entries(english)) (document.getElementById(id)!.firstChild as Text).nodeValue = value;
    (document.querySelector("option")!.firstChild as Text).nodeValue = "Safinum account";
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", switches: 1 });
    expect(heard).toEqual(["fr", "en"]);
  });

  it("does not switch because of one stray sentence", async () => {
    page.start();
    const note = document.createElement("p");
    note.textContent = "Available balance";
    document.getElementById("app")!.appendChild(note);
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "fr", switches: 0 });
  });
});

describe("showing the page in the chosen language", () => {
  it("translates known text in place and counts what it could not translate", () => {
    page.start();
    page.setTarget("en");
    expect(text("a")).toBe("Available balance");
    expect(text("c")).toBe("Fee");
    expect(text("e")).toBe("Account number: CM 001 2345 6789 01");
    expect(text("s")).toBe("Safinum account");
    const state = page.getSnapshot();
    expect(state).toMatchObject({ translating: true, target: "en" });
    expect(state.translated).toBe(4);
    expect(state.left).toBe(2); // the name and the jury's sentence
  });

  it("never changes amounts, names, typed values, scripts or its own widget", () => {
    page.start();
    page.setTarget("en");
    expect(text("b")).toBe("250 000 FCFA");
    expect(text("d")).toBe("375 FCFA");
    expect(text("f")).toBe("Jean-Paul Mbarga");
    expect(text("g")).toBe("Offre du jury que personne n'a traduite.");
    expect((document.getElementById("i") as HTMLInputElement).value).toBe("Frais");
    expect(text("x")).toBe('var a = "Solde disponible";');
    expect(text("h")).toBe("Solde disponible");
  });

  it("goes back to exactly what the site wrote when its own language is chosen", () => {
    page.start();
    const before = document.body.innerHTML;
    page.setTarget("en");
    expect(document.body.innerHTML).not.toBe(before);
    page.setTarget("fr");
    expect(document.body.innerHTML).toBe(before);
    expect(page.getSnapshot()).toMatchObject({ translating: false, translated: 0 });
  });

  it("changes nothing when the site's own language is the target from the start", () => {
    page.start();
    const before = document.body.innerHTML;
    page.setTarget("fr");
    expect(document.body.innerHTML).toBe(before);
  });

  it("switches language from the original text, not from the previous translation", () => {
    page.start();
    page.setTarget("en");
    page.setTarget("ful");
    expect(text("a")).toBe("Ceede ngonɗe nder konte");
    page.setTarget("ewo");
    expect(text("c")).toBe("Tañ");
    page.setTarget("fr");
    expect(text("a")).toBe("Solde disponible");
  });

  it("translates content the site adds later, without a reload", async () => {
    page.start();
    page.setTarget("en");
    const alert = document.createElement("p");
    alert.id = "late";
    alert.textContent = "Solde insuffisant pour effectuer ce transfert.";
    document.getElementById("app")!.appendChild(alert);
    await wait(150);
    expect(text("late")).toBe("Insufficient balance for this transfer.");
  });

  it("leaves new content alone while the page is shown in the site's own language", async () => {
    page.start();
    page.setTarget("fr");
    const alert = document.createElement("p");
    alert.id = "late";
    alert.textContent = "Solde insuffisant pour effectuer ce transfert.";
    document.getElementById("app")!.appendChild(alert);
    await wait(150);
    expect(text("late")).toBe("Solde insuffisant pour effectuer ce transfert.");
  });

  it("translates text the site rewrites in place", async () => {
    page.start();
    page.setTarget("en");
    (document.getElementById("a")!.firstChild as Text).nodeValue = "Total à débiter";
    await wait(150);
    expect(text("a")).toBe("Total to debit");
  });

  it("does not undo text the site changed after it was translated", () => {
    page.start();
    page.setTarget("en");
    (document.getElementById("a")!.firstChild as Text).nodeValue = "Message du site";
    page.setTarget("fr");
    expect(text("a")).toBe("Message du site");
  });

  it("after the site switches language, choosing that language leaves its new text as it is", async () => {
    page.start();
    page.setTarget("en"); // the user was reading the French site in English
    (document.getElementById("a")!.firstChild as Text).nodeValue = "Available balance";
    (document.getElementById("c")!.firstChild as Text).nodeValue = "Fees";
    (document.getElementById("e")!.firstChild as Text).nodeValue = "Account number: CM 001 2345 6789 01";
    (document.querySelector("option")!.firstChild as Text).nodeValue = "Safinum account";
    await wait(150);
    expect(page.getSnapshot().pageLanguage).toBe("en");
    page.setTarget("en"); // the widget falls back to following the site
    expect(page.getSnapshot().translating).toBe(false);
    expect(text("a")).toBe("Available balance");
  });

  it("leaves whitespace around text alone", () => {
    document.body.innerHTML =
      '<p id="a">\n   Solde disponible  \n</p><p>Frais</p><p>Montant</p><p>Référence</p>';
    page.start();
    page.setTarget("en");
    expect(text("a")).toBe("\n   Available balance  \n");
    page.setTarget("fr");
    expect(text("a")).toBe("\n   Solde disponible  \n");
  });

  it("puts everything back when it is shut down", () => {
    page.start();
    const before = document.body.innerHTML;
    page.setTarget("en");
    page.destroy();
    expect(document.body.innerHTML).toBe(before);
  });
});

describe("the site's own language button (EN / FR)", () => {
  const siteWith = (button: string, body: string) =>
    `<header><button id="lang">${button}</button></header><main id="app">${body}</main>`;
  // Wording that LexisFlow does not know, so only the button can say which language the site is in.
  const UNKNOWN_ENGLISH = "<p>Your account overview</p><p>Spending this month</p>";
  const UNKNOWN_FRENCH = "<p>Aperçu de votre compte</p><p>Dépenses de ce mois</p>";

  it('a button that says "EN" means the site is in French', () => {
    document.body.innerHTML = siteWith("EN", UNKNOWN_FRENCH);
    page.start();
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "fr", detected: true });
  });

  it('a button that says "FR" means the site is in English', () => {
    document.body.innerHTML = siteWith("FR", UNKNOWN_ENGLISH);
    page.start();
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", detected: true });
    expect(heard).toEqual(["en"]);
  });

  it("is noticed the moment the button changes, even if no known sentence changes", async () => {
    document.body.innerHTML = siteWith("EN", UNKNOWN_FRENCH);
    page.start();
    page.setTarget("fr");
    (document.getElementById("lang")!.firstChild as Text).nodeValue = "FR"; // the user pressed EN
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", switches: 1 });
    expect(heard).toEqual(["fr", "en"]);
    (document.getElementById("lang")!.firstChild as Text).nodeValue = "EN"; // and back
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "fr", switches: 2 });
  });

  it("wins over the wording of the page", () => {
    // English words LexisFlow knows, but the button says the site is French: trust the button.
    document.body.innerHTML = siteWith("EN", "<p>Available balance</p><p>Transfer fees</p><p>Beneficiary name</p><p>Phone number</p>");
    page.start();
    expect(page.getSnapshot().pageLanguage).toBe("fr");
  });

  it("never translates or counts the button's own label", () => {
    document.body.innerHTML = siteWith("EN", "<p>Solde disponible</p>");
    page.start();
    page.setTarget("ful");
    expect(document.getElementById("lang")!.textContent).toBe("EN");
    expect(page.getSnapshot().left).toBe(0);
  });

  it("does not guess when two buttons disagree, and falls back to the sentences", () => {
    document.body.innerHTML =
      '<button>EN</button><button>FR</button><p>Solde disponible</p><p>Frais</p><p>Montant</p><p>Référence</p>';
    page.start();
    expect(page.getSnapshot().pageLanguage).toBe("fr");
  });

  it("ignores its own widget's controls", () => {
    document.body.innerHTML = `<div id="${HOST_ID}"><button>FR</button></div><p>Solde disponible</p><p>Frais</p><p>Montant</p><p>Référence</p>`;
    page.start();
    expect(page.getSnapshot().pageLanguage).toBe("fr");
  });
});

describe("the page keeps the language the user chose when the site switches", () => {
  const setText = (id: string, value: string) => ((document.getElementById(id)!.firstChild as Text).nodeValue = value);
  const siteSwitchesToEnglish = () => {
    setText("a", "Available balance");
    setText("c", "Fees");
    setText("e", "Account number: CM 001 2345 6789 01");
    (document.querySelector("option")!.firstChild as Text).nodeValue = "Safinum account";
  };

  it("stays in Fulfulde while the site goes from French to English", async () => {
    page.start();
    page.setTarget("ful"); // the user chose Fulfulde on the French site
    expect(text("a")).toBe("Ceede ngonɗe nder konte");
    siteSwitchesToEnglish();
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", switches: 1, translating: true, target: "ful" });
    expect(text("a")).toBe("Ceede ngonɗe nder konte"); // not English, not French
    expect(text("c")).toBe("Njoɓdi");
    expect(text("e")).toBe("Limgal konte: CM 001 2345 6789 01");
  });

  it("also keeps the page when the button is what changes", async () => {
    document.body.innerHTML =
      '<header><button id="lang">EN</button></header><main id="app"><p id="a">Solde disponible</p><p id="c">Frais</p><p id="e">Numéro de compte : CM 001 2345 6789 01</p></main>';
    page.start();
    page.setTarget("ewo");
    expect(text("a")).toBe("Moní e ne á kónte");
    setText("a", "Available balance");
    setText("c", "Fees");
    setText("e", "Account number: CM 001 2345 6789 01");
    setText("lang", "FR"); // the site's button now offers French: the site is in English
    await wait(150);
    expect(page.getSnapshot()).toMatchObject({ pageLanguage: "en", translating: true, target: "ewo" });
    expect(text("a")).toBe("Moní e ne á kónte");
    expect(text("lang")).toBe("FR"); // the button itself is never translated
  });

  it("shows the site's new text as it is once the user picks the site's new language", async () => {
    page.start();
    page.setTarget("ful");
    siteSwitchesToEnglish();
    await wait(150);
    page.setTarget("en"); // the new site language
    expect(page.getSnapshot().translating).toBe(false);
    expect(text("a")).toBe("Available balance");
  });

  it("amounts and names are untouched through the switch", async () => {
    page.start();
    page.setTarget("ful");
    siteSwitchesToEnglish();
    await wait(150);
    expect(text("b")).toBe("250 000 FCFA");
    expect(text("f")).toBe("Jean-Paul Mbarga");
  });

  it("can still be shown in another language after the switch", async () => {
    page.start();
    page.setTarget("ful");
    siteSwitchesToEnglish();
    await wait(150);
    page.setTarget("fr"); // back to a language the site is not in
    expect(text("a")).toBe("Solde disponible");
  });
});
