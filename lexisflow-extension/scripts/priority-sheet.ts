// Priority review sheets for native speakers.
//   npm run review:priority   writes one short sheet per national language into team-notes/review-sheets/
//                             (a Word file to edit, a printable page, and a spreadsheet)
//
// A full review (67 sentences x 3 languages, plus the interface) is a lot to ask of a volunteer. These
// sheets hold the sentences where a wrong word does the most harm, in the order the jury cares about:
//   1. security warnings and error messages
//   2. anything about money
//   3. beneficiary and confirmation wording
//   4. the buttons
// plus a few words the extension has no national-language text for yet, which a speaker can supply.
//
// Each sheet is a Word file, a CSV (Excel and Google Sheets) and a printable page. A corrected Word file
// or CSV goes back in with:   npm run review:import -- <path to the returned file>
// The import refuses any cell that damages an amount or a name slot.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { EXTRA_STRINGS, STRINGS } from "../src/shared/i18n/strings.ts";
import { buildDocx, readTables, table as wordTable, text as wordText, type Cell } from "./docx-lite.ts";

export type Lang = "ewo" | "ful" | "dua";
export const LANGUAGES: { code: Lang; name: string; column: number }[] = [
  { code: "ewo", name: "Ewondo", column: 2 },
  { code: "ful", name: "Fulfulde", column: 3 },
  { code: "dua", name: "Duala", column: 4 },
];

export interface Group {
  title: string;
  why: string;
  /** French source sentences, exactly as they appear in the phrase table. */
  sentences: string[];
  /** true: the extension has no text in the national languages for these yet, so the speaker is asked to write it. */
  toSupply?: boolean;
}

export const PRIORITY: Group[] = [
  {
    title: "1. Alertes de sécurité et messages d'erreur",
    why: "Le message doit rester clair et prudent, jamais adouci.",
    sentences: [
      "Alerte de sécurité : vérifiez le numéro du bénéficiaire avant de continuer.",
      "Alerte de sécurité",
      "Une erreur est survenue",
      "Le montant doit être supérieur à zéro.",
      "Solde insuffisant pour effectuer ce transfert.",
      "Vous devez confirmer les informations avant de valider le transfert.",
      "Ce bénéficiaire n'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer.",
      "Vérifiez toujours le nom et le numéro du bénéficiaire avant de confirmer un transfert.",
    ],
  },
  {
    title: "2. Tout ce qui concerne l'argent",
    why: "Montants, frais, totaux, « gratuit ». Un mot faux ici peut coûter de l'argent. Les signes {1} {2} {3} remplacent les montants.",
    sentences: [
      "Solde disponible",
      "Frais de # (min. #, max. #)",
      "Gratuit",
      "Transfert instantané et gratuit",
      "Montant à envoyer",
      "Total à débiter",
      "Solde après opération",
    ],
  },
  {
    title: "3. Bénéficiaire et confirmation",
    why: "Qui reçoit l'argent, et qu'est-ce qu'on confirme.",
    sentences: [
      "Nom du bénéficiaire",
      "J'ai vérifié le nom et le numéro du bénéficiaire.",
      "Vérifiez les informations avant de confirmer le transfert.",
      "Je confirme que les informations ci-dessus sont correctes.",
      "Votre transfert a été envoyé avec succès.",
    ],
  },
  {
    title: "4. Les boutons",
    why: "Chaque bouton garde son propre sens : Retour n'est pas Continuer, Confirmer n'est pas Annuler.",
    sentences: ["Retour", "Continuer", "Modifier", "Confirmer le transfert", "Effectuer un transfert", "Nouveau transfert"],
  },
  {
    title: "5. Mots à fournir (pas encore de traduction)",
    why: "Nous n'avons pas de texte pour ceux-ci. Écrivez la traduction dans la colonne de votre langue si vous la connaissez; sinon laissez vide.",
    toSupply: true,
    sentences: [
      "Envoyer",
      "Confirmer",
      "Annuler",
      "Valider",
      "Virement",
      "Votre compte a été temporairement bloqué.",
      "Ne communiquez jamais votre code PIN ou votre code de vérification.",
    ],
  },
];

type Table = Record<string, Record<string, string>>;
const english = new Map<string, string>([...STRINGS, ...EXTRA_STRINGS].map(([fr, en]) => [fr, typeof en === "string" ? en : en[0]]));
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
const html = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Row {
  group: Group;
  french: string;
  english: string;
  draft: string;
}

/** The rows for one language, in priority order. Throws if a listed sentence is not in the phrase table. */
export function rowsFor(code: Lang, table: Table): Row[] {
  return PRIORITY.flatMap((group) =>
    group.sentences.map((french) => {
      const en = english.get(french);
      if (en === undefined) throw new Error(`priority sentence is not in the phrase table: ${french}`);
      return { group, french, english: en, draft: group.toSupply ? "" : (table[french]?.[code] ?? "") };
    }),
  );
}

export function csvFor(lang: { code: Lang; name: string; column: number }, table: Table): string {
  const header = ["Français (source)", "English", "Ewondo", "Fulfulde", "Duala", "Verdict (Correct / Corrigé / Je ne sais pas)", "Remarque"];
  const lines = [header.map(quote).join(",")];
  for (const row of rowsFor(lang.code, table)) {
    const cells = [row.french, row.english, "", "", "", "", ""];
    cells[lang.column] = row.draft;
    lines.push(cells.map(quote).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`; // BOM so Excel shows accents and special letters correctly
}

export function pageFor(lang: { code: Lang; name: string }, table: Table): string {
  const rows = rowsFor(lang.code, table);
  let body = "";
  let n = 0;
  for (const group of PRIORITY) {
    body += `<h2>${html(group.title)}</h2><p class="why">${html(group.why)}</p><table><tr><th>#</th><th>Français</th><th>English</th><th>${lang.name} (brouillon)</th><th>Votre correction</th><th>Verdict</th></tr>`;
    for (const row of rows.filter((r) => r.group === group)) {
      n++;
      body += `<tr><td>${n}</td><td>${html(row.french)}</td><td>${html(row.english)}</td><td class="draft">${html(row.draft) || "<i>(à écrire)</i>"}</td><td class="blank"></td><td class="verdict">☐ Correct<br>☐ Corrigé<br>☐ Je ne sais pas</td></tr>`;
    }
    body += "</table>";
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relecture ${lang.name}</title>
<style>
body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#111}h1{margin:0 0 4px}h2{margin:22px 0 2px;font-size:16px}.why{margin:0 0 6px;color:#444}
table{border-collapse:collapse;width:100%;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #999;padding:6px 8px;vertical-align:top;text-align:left}th{background:#eee}
.draft{background:#fffbe6}.blank{min-width:200px;height:44px}.verdict{white-space:nowrap;font-size:12px}.note{border:1px solid #999;padding:10px 12px;background:#f6f6f6}
@media print{body{margin:10mm}}
</style></head><body>
<h1>Relecture de traductions en ${lang.name}</h1>
<p class="note"><b>Merci de votre aide.</b> Ces phrases viennent d'une application bancaire de démonstration. Pour chaque ligne, lisez le français et l'anglais, puis regardez le brouillon en ${lang.name} : est-il juste, clair, et dit-il la même chose ? Corrigez-le dans la colonne « Votre correction » et cochez un verdict. Les signes <b>{1} {2} {3}</b> remplacent des montants : gardez-les tels quels dans la phrase. Si vous ne connaissez pas la réponse, cochez « Je ne sais pas » : c'est une réponse utile. Une personne, une langue, environ ${rows.length} lignes (30 à 40 minutes).</p>
<p>Relecteur (nom ou initiales) : ____________________ &nbsp; Date : ____________ &nbsp; Langue maternelle : ____________</p>
${body}
</body></html>`;
}

// ---- the Word version (editable, easy to send back by WhatsApp or email) ----
const COLUMN = { n: 500, french: 3400, english: 3000, draft: 3400, fix: 3500, verdict: 1598 };
const MARKED = String.fromCharCode(0x2612, 0x2611, 0x2714, 0x2713, 0x2705); // ticked-box and tick characters a reader may type
const VERDICTS = ["Correct", "Corrigé", "Je ne sais pas"];

export function docxFor(lang: { code: Lang; name: string }, data: Table): Buffer {
  const rows = rowsFor(lang.code, data);
  let body = wordText(`Relecture de traductions en ${lang.name}`, { bold: true, size: 36 }, 120);
  body += wordText(
    `Merci de votre aide. Ces phrases viennent d'une application bancaire de démonstration. Pour chaque ligne, lisez le français et l'anglais, puis regardez le brouillon en ${lang.name} : est-il juste, clair, et dit-il la même chose ? Écrivez votre correction dans la colonne « Votre correction » (laissez-la vide si le brouillon est bon) et cochez un verdict en remplaçant ☐ par ☒. Les signes {1} {2} {3} remplacent des montants : gardez-les tels quels dans la phrase. Si vous ne connaissez pas la réponse, cochez « Je ne sais pas » : c'est une réponse utile. Une personne, une langue, ${rows.length} lignes (30 à 40 minutes).`,
    { size: 22 },
    160,
  );
  body += wordText("Relecteur (nom ou initiales) : ____________________     Date : ____________     Langue maternelle : ____________", { size: 22 }, 200);
  let n = 0;
  for (const group of PRIORITY) {
    body += wordText(group.title, { bold: true, size: 26 }, 40) + wordText(group.why, { italic: true, size: 20 }, 100);
    const head = (width: number, label: string): Cell => ({ width, lines: [label], fill: "E5E5E5" });
    const header = [head(COLUMN.n, "#"), head(COLUMN.french, "Français"), head(COLUMN.english, "English"), head(COLUMN.draft, `${lang.name} (brouillon)`), head(COLUMN.fix, "Votre correction"), head(COLUMN.verdict, "Verdict")];
    const lines = rows
      .filter((r) => r.group === group)
      .map((r): Cell[] => {
        n++;
        return [
          { width: COLUMN.n, lines: [String(n)] },
          { width: COLUMN.french, lines: [r.french] },
          { width: COLUMN.english, lines: [r.english] },
          { width: COLUMN.draft, lines: [r.draft || "(à écrire)"], fill: "FFF8DC" },
          { width: COLUMN.fix, lines: [] },
          { width: COLUMN.verdict, lines: VERDICTS.map((v) => `☐ ${v}`) },
        ];
      });
    body += wordTable(header, lines);
  }
  return buildDocx(body);
}

export interface ReturnedRow {
  french: string;
  correction: string;
  /** Which verdicts the reader ticked (informational: the team confirms the count by looking at the sheet). */
  verdicts: string[];
}

const canonical = new Map<string, string>();
const flat = (value: string) => value.normalize("NFC").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
for (const [fr] of [...STRINGS, ...EXTRA_STRINGS]) canonical.set(flat(fr), fr);

/** What a speaker sent back in Word: the language of the sheet and each row's correction and verdict. */
export function parseReturnedDocx(docx: Buffer): { language: Lang | null; rows: ReturnedRow[] } {
  let language: Lang | null = null;
  const rows: ReturnedRow[] = [];
  for (const cells of readTables(docx)) {
    const header = cells.find((c) => c.includes("(brouillon)"));
    if (header) {
      language = LANGUAGES.find((l) => header.includes(l.name))?.code ?? language;
      continue;
    }
    if (cells.length < 6) continue;
    const french = flat(cells[1]);
    rows.push({
      french: canonical.get(french) ?? french,
      correction: cells[4].replace(/\s*\n\s*/g, " ").trim(),
      verdicts: VERDICTS.filter((v) => new RegExp(`[${MARKED}xX]\\s*${v}`).test(cells[5])),
    });
  }
  return { language, rows };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "")) {
  const table = JSON.parse(readFileSync(new URL("../src/shared/i18n/national.json", import.meta.url), "utf8")) as Table;
  const out = new URL("../../team-notes/review-sheets/", import.meta.url);
  mkdirSync(out, { recursive: true });
  const names: Record<Lang, string> = { ewo: "ewondo", ful: "fulfulde", dua: "duala" };
  for (const lang of LANGUAGES) {
    writeFileSync(new URL(`priorite-${names[lang.code]}.csv`, out), csvFor(lang, table));
    writeFileSync(new URL(`priorite-${names[lang.code]}.html`, out), pageFor(lang, table));
    writeFileSync(new URL(`priorite-${names[lang.code]}.docx`, out), docxFor(lang, table));
  }
  const total = PRIORITY.reduce((n, g) => n + g.sentences.length, 0);
  console.log(`wrote 3 sheets (${total} rows each) to team-notes/review-sheets/`);
}
