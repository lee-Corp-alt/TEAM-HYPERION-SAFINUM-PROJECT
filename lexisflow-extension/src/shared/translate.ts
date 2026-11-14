// Template translation with integrity validation (SRS 3.4). Nothing leaves the page: the
// tables are bundled, and text with no template is returned in its source language rather
// than guessed at (NFR-REL-08: prefer saying less over saying something possibly wrong).

import national from "./i18n/national.json";
import { EXTRA_STRINGS, STRINGS } from "./i18n/strings";
import type { LanguageCode } from "./prefs";
import { protect, restore, sameProtectedValues, type ProtectedToken } from "./protect";

export type SourceLang = "fr" | "en";

export type TranslationStatus =
  /** Already in the requested language. */
  | "same"
  /** Translated from a curated template and validated. */
  | "template"
  /** Only protected values and punctuation: nothing to translate. */
  | "verbatim"
  /** A template exists but has no entry for the requested language yet. */
  | "missing"
  /** No template: unseen content, a name, or user-typed text. */
  | "unknown";

export interface Segment {
  text: string;
  protectedValue?: boolean;
  token?: ProtectedToken;
}

export interface Translation {
  status: TranslationStatus;
  /** Language the returned text is actually in. */
  lang: LanguageCode;
  text: string;
  segments: Segment[];
  tokens: ProtectedToken[];
}

type Variants = Partial<Record<LanguageCode, string>>;
interface Entry {
  variants: Variants;
}
interface Pattern {
  regex: RegExp;
  source: LanguageCode;
  entry: Entry;
}

const HASH = /⟦N\d+⟧/g;

/** Comparison form: placeholders become `#`, case, spacing and apostrophes are evened out. */
export const normalizeKey = (template: string): string =>
  template
    .replace(HASH, "#")
    .replace(/[  ]/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const exact = new Map<string, { source: LanguageCode; entry: Entry }>();
const patterns: Pattern[] = [];
const nationalTable = national as Record<string, Partial<Record<"ewo" | "ful" | "dua", string>>>;

export type ReviewStatus = "draft" | "validated";

/**
 * Whether a national language's strings have been validated by a native speaker.
 * Set in national.json under "__status__"; anything other than "validated" is a draft.
 */
export function nationalStatus(code: LanguageCode): ReviewStatus | null {
  if (code !== "ewo" && code !== "ful" && code !== "dua") return null;
  return nationalTable.__status__?.[code] === "validated" ? "validated" : "draft";
}

function register(key: string, source: LanguageCode, entry: Entry): void {
  const normalized = normalizeKey(key);
  if (normalized.includes("*")) {
    const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", "(.+)");
    patterns.push({ regex: new RegExp(`^${escaped}$`, "iu"), source, entry });
  } else if (!exact.has(normalized)) {
    exact.set(normalized, { source, entry });
  }
}

for (const [fr, en] of [...STRINGS, ...EXTRA_STRINGS]) {
  const enList = typeof en === "string" ? [en] : en;
  const extra = nationalTable[fr] ?? {};
  // The French column is written in source syntax; convert it for use as a target.
  let slot = 0;
  const frTarget = fr.replace(/#/g, () => `{${++slot}}`).replace("*", "{*}");
  const variants: Variants = { fr: frTarget, en: enList[0] };
  for (const code of ["ewo", "ful", "dua"] as const) {
    const value = extra[code]?.trim();
    if (value) variants[code] = value;
  }
  const entry: Entry = { variants };
  register(fr, "fr", entry);
  // English keys are matched without their {n} markers.
  for (const key of enList) register(key.replace(/\{\d+\}/g, "#").replace("{*}", "*"), "en", entry);
  // Text already in a national language is recognised too, so a translated page can be read back
  // (and translated into another language) without being mistaken for unknown content.
  for (const code of ["ewo", "ful", "dua"] as const) {
    const value = variants[code];
    if (value) register(value.replace(/\{\d+\}/g, "#").replace("{*}", "*"), code, entry);
  }
}

function toSegments(template: string, tokens: ProtectedToken[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of template.matchAll(/⟦N(\d+)⟧/g)) {
    if (match.index > cursor) segments.push({ text: template.slice(cursor, match.index) });
    const token = tokens[Number(match[1]) - 1];
    segments.push({ text: token.raw, protectedValue: true, token });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) segments.push({ text: template.slice(cursor) });
  return segments;
}

/** Fills a target template: `{n}` → nth placeholder, `{*}` → verbatim capture. */
function render(variant: string, wildcard: string | null): string {
  return variant.replace(/\{(\d+)\}/g, (_, n: string) => `⟦N${n}⟧`).replace("{*}", wildcard ?? "");
}

export function translate(text: string, target: LanguageCode, hint: SourceLang = "fr"): Translation {
  const clean = text.replace(/\s+/g, " ").trim();
  const { template, tokens } = protect(clean);
  const sourceResult = (status: TranslationStatus, lang: LanguageCode): Translation => ({
    status,
    lang,
    text: clean,
    segments: toSegments(template, tokens),
    tokens,
  });

  const key = normalizeKey(template);
  if (!/\p{L}/u.test(key.replace(/#/g, ""))) return sourceResult("verbatim", hint);

  let found = exact.get(key) ?? null;
  let wildcard: string | null = null;
  if (!found) {
    const flat = template.replace(HASH, "#").replace(/[  ]/g, " ").replace(/[’‘]/g, "'");
    for (const pattern of patterns) {
      const match = flat.match(pattern.regex);
      if (match) {
        found = pattern;
        wildcard = match[1];
        break;
      }
    }
  }
  if (!found) return sourceResult("unknown", hint);
  if (found.source === target) return sourceResult("same", target);

  const variant = found.entry.variants[target];
  if (!variant) return sourceResult("missing", found.source);

  try {
    const rendered = render(variant, wildcard);
    const output = restore(rendered, tokens);
    if (!sameProtectedValues(output, tokens)) throw new Error("protected values changed");
    return { status: "template", lang: target, text: output, segments: toSegments(rendered, tokens), tokens };
  } catch (error) {
    // Validation failed: discard the translation and fall back to the source (FR-TRN-04).
    console.warn("[LexisFlow] translation rejected by integrity check", error);
    return sourceResult("missing", found.source);
  }
}

/** Which source language a text is in, when a template recognises it. */
export function detectSource(text: string): SourceLang | null {
  const key = normalizeKey(protect(text.replace(/\s+/g, " ").trim()).template);
  const hit = exact.get(key) ?? patterns.find((p) => p.regex.test(key));
  // Only French and English count as a page language; text in a national language says nothing about it.
  return hit && (hit.source === "fr" || hit.source === "en") ? hit.source : null;
}
