// A just-big-enough Word (.docx) writer and reader, with no dependencies. A .docx is a zip file of XML
// parts; this builds one with the parts Word needs, and reads the parts back out of a file Word saved.
// Used for the review sheets handed to native speakers (scripts/priority-sheet.ts).

import { deflateRawSync, inflateRawSync } from "node:zlib";

// ---- zip ----
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (data: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip archive of the files, compressed the way Word compresses its own (pass `false` to store them as they are). */
export function zip(files: { name: string; data: Buffer }[], compress = true): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const packed = compress ? deflateRawSync(data) : data;
    const method = compress ? 8 : 0;
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // file names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    locals.push(local, packed);
    centrals.push(central);
    offset += local.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The files of a zip archive (stored or deflated), by name. */
export function unzip(archive: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file (this does not look like a Word document)");
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error("damaged zip directory");
    const method = archive.readUInt16LE(at + 10);
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    const raw = archive.subarray(dataAt, dataAt + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ---- Word XML ----
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const xml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  /** Half-points: 22 is 11 pt. */
  size?: number;
}
export const run = (text: string, style: RunStyle = {}): string =>
  `<w:r><w:rPr>${style.bold ? "<w:b/>" : ""}${style.italic ? "<w:i/>" : ""}<w:sz w:val="${style.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
export const paragraph = (runs: string, spaceAfter = 80): string => `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/></w:pPr>${runs}</w:p>`;
/** A paragraph from text, with an optional style and an optional shaded box. */
export const text = (value: string, style: RunStyle = {}, spaceAfter = 80): string => paragraph(run(value, style), spaceAfter);

export interface Cell {
  width: number;
  /** One paragraph per entry; empty means an empty cell the reader can type in. */
  lines: string[];
  fill?: string;
  bold?: boolean;
}
export const table = (header: Cell[], rows: Cell[][]): string => {
  const border = `<w:top w:val="single" w:sz="4" w:color="888888"/><w:left w:val="single" w:sz="4" w:color="888888"/><w:bottom w:val="single" w:sz="4" w:color="888888"/><w:right w:val="single" w:sz="4" w:color="888888"/><w:insideH w:val="single" w:sz="4" w:color="888888"/><w:insideV w:val="single" w:sz="4" w:color="888888"/>`;
  const cell = (c: Cell, boldAll = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${c.width}" w:type="dxa"/>${c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : ""}</w:tcPr>${
      c.lines.length ? c.lines.map((line) => paragraph(run(line, { bold: boldAll || c.bold, size: 20 }), 40)).join("") : "<w:p/>"
    }</w:tc>`;
  const rowXml = (cells: Cell[], head = false) =>
    `<w:tr><w:trPr><w:cantSplit/>${head ? "<w:tblHeader/>" : ""}</w:trPr>${cells.map((c) => cell(c, head)).join("")}</w:tr>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${header.reduce((n, c) => n + c.width, 0)}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${header.map((c) => `<w:gridCol w:w="${c.width}"/>`).join("")}</w:tblGrid>${rowXml(header, true)}${rows.map((r) => rowXml(r)).join("")}</w:tbl>` +
    paragraph("", 0)
  );
};

/** A complete .docx (A4, landscape) from body XML. */
export function buildDocx(body: string): Buffer {
  const part = (name: string, content: string) => ({ name, data: Buffer.from(content, "utf8") });
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    part(
      "[Content_Types].xml",
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    part(
      "_rels/.rels",
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    part(
      "word/document.xml",
      `${head}<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ),
  ]);
}

/** The text of every table row in a .docx, as rows of cells (each cell: its paragraphs joined with a line break). */
export function readTables(docx: Buffer): string[][] {
  const documentXml = unzip(docx).get("word/document.xml");
  if (!documentXml) throw new Error("word/document.xml is missing: this is not a Word document");
  const source = documentXml.toString("utf8");
  const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const textOf = (fragment: string) =>
    [...fragment.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)]
      .map((p) => unescape([...p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map((t) => (t[1] === undefined ? "\t" : t[1])).join("")))
      .join("\n");
  return [...source.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((row) => [...row[0].matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((cell) => textOf(cell[0])));
}
