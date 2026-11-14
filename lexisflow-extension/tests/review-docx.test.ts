import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// The Word review sheet: it must build, survive being edited in Word, and read back correctly.

const root = process.cwd();
const table = JSON.parse(readFileSync(join(root, "src/shared/i18n/national.json"), "utf-8")) as Record<string, Record<string, string>>;

interface Docx {
  unzip: (b: Buffer) => Map<string, Buffer>;
  zip: (files: { name: string; data: Buffer }[], compress?: boolean) => Buffer;
}
interface Sheet {
  LANGUAGES: { code: "ewo" | "ful" | "dua"; name: string; column: number }[];
  docxFor: (lang: { code: "ewo" | "ful" | "dua"; name: string }, data: unknown) => Buffer;
  parseReturnedDocx: (docx: Buffer) => { language: string | null; rows: { french: string; correction: string; verdicts: string[] }[] };
}
const load = async <T>(file: string) => (await import(/* @vite-ignore */ pathToFileURL(join(root, "scripts", file)).href)) as T;

/** Edits the sheet's XML the way Word saves it: changed runs, split text, proofing marks, new compression. */
async function editedLikeWord(docx: Buffer, change: (xml: string) => string): Promise<Buffer> {
  const { unzip, zip } = await load<Docx>("docx-lite.ts");
  const parts = unzip(docx);
  const xml = change(parts.get("word/document.xml")!.toString("utf8"));
  return zip([...parts].map(([name, data]) => ({ name, data: name === "word/document.xml" ? Buffer.from(xml, "utf8") : data })));
}
/** The XML of the table row that holds this French sentence. */
const rowXml = (xml: string, french: string) => [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0]).find((r) => r.includes(french))!;

describe("Word review sheets", () => {
  it("build for every language as a valid archive with the five groups of 33 rows", async () => {
    const { LANGUAGES, docxFor, parseReturnedDocx } = await load<Sheet>("priority-sheet.ts");
    const { unzip } = await load<Docx>("docx-lite.ts");
    for (const lang of LANGUAGES) {
      const docx = docxFor(lang, table);
      expect([...unzip(docx).keys()].sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
      const xml = unzip(docx).get("word/document.xml")!.toString("utf8");
      expect(xml.match(/<w:tbl>/g)).toHaveLength(5);
      expect(xml).toContain("landscape");
      const read = parseReturnedDocx(docx);
      expect(read.language).toBe(lang.code);
      expect(read.rows).toHaveLength(33);
      for (const row of read.rows) expect(row.correction, row.french).toBe(""); // nothing is pre-filled for the speaker
    }
  });

  it("show the speaker's own draft and nobody else's", async () => {
    const { docxFor } = await load<Sheet>("priority-sheet.ts");
    const { unzip } = await load<Docx>("docx-lite.ts");
    const xml = unzip(docxFor({ code: "dua", name: "Duala" }, table)).get("word/document.xml")!.toString("utf8");
    expect(xml).toContain("Duala (brouillon)");
    expect(xml).not.toContain("Ewondo (brouillon)");
    expect(xml).toContain(table["Gratuit"].dua);
    expect(xml).not.toContain(table["Gratuit"].ewo);
  });

  it("read a correction and a ticked verdict after Word has split the text into several runs", async () => {
    const { LANGUAGES, docxFor, parseReturnedDocx } = await load<Sheet>("priority-sheet.ts");
    const lang = LANGUAGES.find((l) => l.code === "ful")!;
    const returned = await editedLikeWord(docxFor(lang, table), (xml) => {
      const row = rowXml(xml, "Gratuit");
      const cells = [...row.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
      const typed = cells[4].replace(
        "<w:p/>",
        '<w:p w14:paraId="1A2B3C4D"><w:pPr><w:rPr><w:lang w:val="fr-CM"/></w:rPr></w:pPr><w:r w:rsidR="00A1B2C3"><w:t>Bi</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t xml:space="preserve">ɗɗe </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>goonga</w:t></w:r></w:p>',
      );
      const ticked = cells[5].replace("☐ Corrigé", "☒ Corrigé");
      return xml.replace(row, row.replace(cells[4], typed).replace(cells[5], ticked));
    });
    const read = parseReturnedDocx(returned);
    const gratuit = read.rows.find((r) => r.french === "Gratuit")!;
    expect(gratuit.correction).toBe("Biɗɗe goonga");
    expect(gratuit.verdicts).toEqual(["Corrigé"]);
    expect(read.language).toBe("ful");
    expect(read.rows.filter((r) => r.correction)).toHaveLength(1); // the rest are untouched
  });

  it("keep the amount signs in a speaker's sentence exactly as typed, so the importer can check them", async () => {
    const { LANGUAGES, docxFor, parseReturnedDocx } = await load<Sheet>("priority-sheet.ts");
    const fees = "Frais de # (min. #, max. #)";
    const returned = await editedLikeWord(docxFor(LANGUAGES[0], table), (xml) => {
      const row = rowXml(xml, "(min. #, max. #)");
      const cell = [...row.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((m) => m[0])[4];
      return xml.replace(row, row.replace(cell, cell.replace("<w:p/>", "<w:p><w:r><w:t>Mbɔ {1} (o {2}, {3})</w:t></w:r></w:p>")));
    });
    const row = parseReturnedDocx(returned).rows.find((r) => r.french === fees)!;
    expect(row.correction).toBe("Mbɔ {1} (o {2}, {3})");
  });

  it("match a French sentence even if Word turned its apostrophe into a curly one", async () => {
    const { LANGUAGES, docxFor, parseReturnedDocx } = await load<Sheet>("priority-sheet.ts");
    const returned = await editedLikeWord(docxFor(LANGUAGES[2], table), (xml) => xml.split("n'a jamais").join("n’a jamais"));
    const rows = parseReturnedDocx(returned).rows;
    expect(rows.some((r) => r.french === "Ce bénéficiaire n'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer.")).toBe(true);
  });

  it("say clearly when the file is not a Word document", async () => {
    const { parseReturnedDocx } = await load<Sheet>("priority-sheet.ts");
    expect(() => parseReturnedDocx(Buffer.from("this is only text"))).toThrow(/not a zip file/);
  });
});
