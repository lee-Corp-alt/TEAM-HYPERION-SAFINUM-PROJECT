// LexisFlow's own text (buttons, labels, notices) in the five languages (SRS EIR-UI-05).
// French and English are written by the team. Ewondo, Fulfulde and Duala are unverified drafts
// that need a native speaker; until then a missing or empty entry falls back to French.

import table from "./i18n/ui.json";
import type { LanguageCode } from "./prefs";

export type UiKey = Exclude<keyof typeof table, "__status__">;
type Row = Record<LanguageCode, string>;

export function t(lang: LanguageCode, key: UiKey, vars: Record<string, string | number> = {}): string {
  const row = table[key] as Row;
  const text = row[lang]?.trim() ? row[lang] : row.fr;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export const UI_KEYS = Object.keys(table).filter((key) => key !== "__status__") as UiKey[];

/** Raw access for tests and the review sheet. */
export const uiRow = (key: UiKey): Row => table[key] as Row;
