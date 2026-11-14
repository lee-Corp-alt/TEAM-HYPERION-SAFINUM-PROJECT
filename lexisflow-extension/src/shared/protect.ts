// Financial data lockdown (SRS 3.4). Every value that must survive translation untouched
// is swapped for an opaque placeholder before any text processing and restored verbatim
// afterwards. Formats come from docs/PAGE-MAP.md.

export type TokenKind =
  | "reference"
  | "code"
  | "phone"
  | "account"
  | "date"
  | "amount"
  | "percent"
  | "number";

export interface ProtectedToken {
  kind: TokenKind;
  /** Exact source substring. This is what is displayed and what validation compares. */
  raw: string;
  placeholder: string;
}

export interface ProtectedText {
  /** Source text with each token replaced by its placeholder. */
  template: string;
  tokens: ProtectedToken[];
}

const CURRENCY = "(?:FCFA|F\\s?CFA|XAF|XOF|EUR|USD|€)";
// Digits, optional space-separated thousands (space, NBSP, narrow NBSP), optional , or . groups.
const NUM = "\\d+(?:[ \\u00A0\\u202F]\\d{3})*(?:[.,]\\d+)*";
const SIGNED = `(?<![\\p{L}\\p{N}_])[+\\-\\u2212]?${NUM}`;
// Month names in either case ("nov." in French, "Nov" in English), without relying on the `i` flag
// (which would also loosen the reference and account patterns above).
const anyCase = (word: string): string =>
  [...word].map((c) => (c.toLowerCase() !== c.toUpperCase() ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c)).join("");
const MONTH = `(?:${[
  "janv", "févr", "fevr", "mars", "avr", "mai", "juin", "juil", "août", "aout", "sept", "oct", "nov", "déc", "dec",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep",
]
  .map(anyCase)
  .join("|")})[a-zéûA-ZÉÛ]*\\.?`;

// Order matters: the more specific shapes are tried first at each position.
const PATTERN = new RegExp(
  [
    `(?<reference>\\b[A-Z]{2,}-\\d{2,}-[A-Z0-9]{3,}\\b|\\b(?:TXN|TRX)\\d{4,}\\b)`,
    `(?<code>\\b[A-Z]{3,}_\\d{2,}\\b)`,
    // International (+237 …, 00237 …) and national Cameroon mobile numbers (6xx xx xx xx).
    `(?<phone>\\+\\d[\\d ]{6,}\\d|(?<![\\p{L}\\p{N}_])00237[\\d ]{6,}\\d|(?<![\\p{L}\\p{N}_+])6\\d{2}(?:[ .-]\\d{2}){3}(?!\\d))`,
    // Account numbers: the site's "CM 001 2345 6789 01" form and spaced or compact IBANs.
    `(?<account>\\b[A-Z]{2} \\d{3}(?: \\d{2,4}){2,}\\b|\\b[A-Z]{2}\\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\\b)`,
    // "05 nov. 2026" (French) and "Nov 5, 2026" (English) are each one protected value.
    `(?<date>\\b\\d{1,2} ${MONTH} \\d{4}\\b|\\b${MONTH} \\d{1,2}, \\d{4}\\b)`,
    `(?<amount>${SIGNED}\\s?${CURRENCY}(?![A-Za-z])|(?<![\\p{L}\\p{N}_])[$€]\\s?${NUM})`,
    `(?<percent>${SIGNED}\\s?%)`,
    `(?<number>${SIGNED})`,
  ].join("|"),
  "gu",
);

const PLACEHOLDER = /⟦N(\d+)⟧/g;

export function protect(text: string): ProtectedText {
  const tokens: ProtectedToken[] = [];
  const template = text.replace(PATTERN, (raw, ...rest) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>;
    const kind = (Object.keys(groups).find((key) => groups[key] !== undefined) ?? "number") as TokenKind;
    const placeholder = `⟦N${tokens.length + 1}⟧`;
    tokens.push({ kind, raw, placeholder });
    return placeholder;
  });
  return { template, tokens };
}

/** Puts every token back verbatim. Throws if the template does not use each placeholder exactly once. */
export function restore(template: string, tokens: ProtectedToken[]): string {
  const used = new Set<number>();
  const text = template.replace(PLACEHOLDER, (_, n: string) => {
    const index = Number(n) - 1;
    const token = tokens[index];
    if (!token || used.has(index)) throw new Error(`placeholder ⟦N${n}⟧ invalid or repeated`);
    used.add(index);
    return token.raw;
  });
  if (used.size !== tokens.length) throw new Error("a protected value is missing from the output");
  return text;
}

/**
 * Integrity validator (FR-TRN-03): the output must contain exactly the same protected
 * values as the source, character for character. Order may differ.
 */
export function sameProtectedValues(output: string, source: ProtectedToken[]): boolean {
  const sorted = (raws: string[]) => [...raws].sort().join("\u0000");
  return sorted(protect(output).tokens.map((t) => t.raw)) === sorted(source.map((t) => t.raw));
}

export interface NumericValue {
  sign: "" | "+" | "-";
  /** Integer digits with separators removed. */
  integer: string;
  /** Decimal digits, or null when the value is whole. */
  fraction: string | null;
}

/** Reads the number inside an amount, percent or number token. */
export function numericValue(token: ProtectedToken): NumericValue | null {
  if (token.kind !== "amount" && token.kind !== "percent" && token.kind !== "number") return null;
  const match = token.raw.match(/^([+\-−]?)[$€]?\s?(\d[\d   .,]*\d|\d)/u);
  if (!match) return null;
  const sign = match[1] === "" ? "" : match[1] === "+" ? "+" : "-";
  const body = match[2].replace(/[   ]/g, "");
  const separators = body.match(/[.,]/g) ?? [];
  if (separators.length === 0) return { sign, integer: body, fraction: null };

  // "250,000 FCFA" (English page) groups thousands; "1,5 %" is a decimal. A separator is a
  // thousands mark when every group after it has exactly three digits and the value is not
  // a percentage; CFA francs have no decimal subdivision in use.
  const groups = body.split(/[.,]/);
  const allThousands = groups.slice(1).every((group) => group.length === 3);
  const distinct = new Set(separators).size;
  if (token.kind !== "percent" && allThousands && distinct === 1) {
    return { sign, integer: groups.join(""), fraction: null };
  }
  const fraction = groups.pop() as string;
  return { sign, integer: groups.join(""), fraction };
}
