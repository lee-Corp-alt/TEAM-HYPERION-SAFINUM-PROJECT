// Spoken forms of protected values (FR-VOX-05). A browser voice may read "250 000" as two
// numbers, so amounts are converted to words here, deterministically, before speech.

import { numericValue, type ProtectedToken } from "./protect";

export type VoiceLang = "fr" | "en";

const FR_UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function frBelow100(n: number): string {
  if (n < 20) return FR_UNITS[n];
  if (n < 70) {
    const tens = FR_TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit === 0 ? tens : unit === 1 ? `${tens} et un` : `${tens}-${FR_UNITS[unit]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${FR_UNITS[n - 60]}`;
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${FR_UNITS[n - 80]}`;
}

function frBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return frBelow100(rest);
  const head = hundreds === 1 ? "cent" : `${FR_UNITS[hundreds]} cent`;
  if (rest === 0) return hundreds > 1 ? `${head}s` : head;
  return `${head} ${frBelow100(rest)}`;
}

const EN_UNITS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail =
    rest < 20
      ? EN_UNITS[rest]
      : rest % 10 === 0
        ? EN_TENS[rest / 10]
        : `${EN_TENS[Math.floor(rest / 10)]}-${EN_UNITS[rest % 10]}`;
  if (hundreds === 0) return tail;
  return rest === 0 ? `${EN_UNITS[hundreds]} hundred` : `${EN_UNITS[hundreds]} hundred ${tail}`;
}

/** Whole number in words. Groups are joined with a comma so the voice pauses between them. */
export function numberToWords(n: number, lang: VoiceLang): string | null {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) return null;
  if (n === 0) return lang === "fr" ? "zéro" : "zero";
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const units = n % 1e3;

  if (lang === "fr") {
    if (billions) parts.push(`${frBelow1000(billions)} milliard${billions > 1 ? "s" : ""}`);
    if (millions) parts.push(`${frBelow1000(millions)} million${millions > 1 ? "s" : ""}`);
    // "mille" is invariable and "cents"/"vingts" lose their s before it.
    if (thousands) {
      parts.push(thousands === 1 ? "mille" : `${frBelow1000(thousands).replace(/(cent|vingt)s$/, "$1")} mille`);
    }
    if (units) parts.push(frBelow1000(units));
  } else {
    if (billions) parts.push(`${enBelow1000(billions)} billion`);
    if (millions) parts.push(`${enBelow1000(millions)} million`);
    if (thousands) parts.push(`${enBelow1000(thousands)} thousand`);
    if (units) parts.push(enBelow1000(units));
  }
  return parts.join(", ");
}

const digitWords = (digits: string, lang: VoiceLang): string =>
  [...digits].map((d) => (lang === "fr" ? FR_UNITS : EN_UNITS)[Number(d)]).join(" ");

/** Letters and digits one at a time, with a pause between the groups as written. */
function spellOut(raw: string, lang: VoiceLang): string {
  return raw
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((group) =>
      [...group]
        .map((char) =>
          /\d/.test(char) ? digitWords(char, lang) : char === "+" ? "plus" : char.toUpperCase(),
        )
        .join(" "),
    )
    .join(", ");
}

const MONTHS: Record<VoiceLang, string[]> = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
// How each month is abbreviated on the page, French and English, matched by the word's first letters.
const MONTH_PREFIXES = ["jan", "fév|fev", "mar", "avr|apr", "mai|may", "juin|jun", "juil|jul", "août|aout|aug", "sep", "oct", "nov", "déc|dec"];

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  return MONTH_PREFIXES.findIndex((alternatives) => alternatives.split("|").some((p) => w.startsWith(p)));
}

/**
 * A date in the voice's own language and order, so it is neither read as raw symbols nor in a foreign
 * format: French "05 nov. 2026" is "November 5, 2026" in English, English "Nov 5, 2026" is "5 novembre
 * 2026" in French. A date already in the voice's format keeps its digits as written.
 */
function spokenDate(raw: string, lang: VoiceLang): string {
  const french = raw.match(/^(\d{1,2}) (\p{L}+)\.? (\d{4})$/u);
  const english = raw.match(/^(\p{L}+)\.? (\d{1,2}), (\d{4})$/u);
  const [day, word, year] = french ? [french[1], french[2], french[3]] : english ? [english[2], english[1], english[3]] : [];
  const month = word === undefined ? -1 : monthIndex(word);
  if (month < 0) return raw;
  return lang === "fr" ? `${day} ${MONTHS.fr[month]} ${year}` : `${MONTHS.en[month]} ${Number(day)}, ${year}`;
}

/** The currency named by an amount token, in words; CFA francs unless the amount says otherwise. */
function currencyWords(raw: string, lang: VoiceLang): string {
  if (/EUR|€/.test(raw)) return " euros";
  if (/USD|\$/.test(raw)) return " dollars";
  return lang === "fr" ? " francs CFA" : " CFA francs";
}

/** What the voice should say for one protected value. Never drops or rounds anything. */
export function spokenToken(token: ProtectedToken, lang: VoiceLang): string {
  if (token.kind === "date") return spokenDate(token.raw, lang);
  const value = numericValue(token);
  if (!value) return spellOut(token.raw, lang);

  const whole = numberToWords(Number(value.integer), lang) ?? digitWords(value.integer, lang);
  const sign =
    value.sign === "-" ? (lang === "fr" ? "moins " : "minus ") : value.sign === "+" ? "plus " : "";
  const fraction = value.fraction
    ? `${lang === "fr" ? " virgule " : " point "}${digitWords(value.fraction, lang)}`
    : "";
  const unit =
    token.kind === "amount"
      ? currencyWords(token.raw, lang)
      : token.kind === "percent"
        ? lang === "fr"
          ? " pour cent"
          : " percent"
        : "";
  return `${sign}${whole}${fraction}${unit}`;
}
