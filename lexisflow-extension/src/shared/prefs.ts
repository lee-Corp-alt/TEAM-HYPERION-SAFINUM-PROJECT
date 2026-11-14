export type LanguageCode = "ewo" | "ful" | "dua" | "fr" | "en";

export interface Language {
  code: LanguageCode;
  /** BCP-47 tag used for speech synthesis. */
  locale: string;
  label: string;
  /** Browser voices for the national languages are generally unavailable (SRS C-12). */
  nativeVoice: boolean;
}

export const LANGUAGES: readonly Language[] = [
  { code: "ewo", locale: "ewo", label: "Ewondo", nativeVoice: false },
  { code: "ful", locale: "ff", label: "Fulfulde", nativeVoice: false },
  { code: "dua", locale: "dua", label: "Duala", nativeVoice: false },
  { code: "fr", locale: "fr-FR", label: "Français", nativeVoice: true },
  { code: "en", locale: "en-US", label: "English", nativeVoice: true },
];

export const SPEEDS = [0.8, 1, 1.25, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];

export const formatSpeed = (speed: Speed): string => (speed === 1 ? "1.0x" : `${speed}x`);

/** "auto" = read and show the page in the language the site itself is in (nothing is translated). */
export type ChosenLanguage = LanguageCode | "auto";

export interface UserPreferences {
  /** The language the user chose to read and translate the page into. */
  language: ChosenLanguage;
  /** The language the site was last seen in. LexisFlow's own text (bar and popup) is shown in it. */
  pageLanguage: "fr" | "en";
  playbackSpeed: Speed;
  autoReadFees: boolean;
  enabledForSite: boolean;
  /** false = compact pill, true = full dock with badge and hint row. */
  dockExpanded: boolean;
  schemaVersion: 1;
}

export const DEFAULT_PREFS: UserPreferences = {
  language: "auto",
  pageLanguage: "fr",
  playbackSpeed: 1,
  autoReadFees: false,
  enabledForSite: true,
  dockExpanded: false,
  schemaVersion: 1,
};

const KEY = "lexisflow.prefs";

/** `chrome.storage` is absent in the dev harness; preferences then live in memory only. */
const storage = (): chrome.storage.LocalStorageArea | null =>
  typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;

function sanitize(raw: unknown): UserPreferences {
  const value = (raw ?? {}) as Partial<UserPreferences>;
  return {
    ...DEFAULT_PREFS,
    ...(value.language === "auto" || LANGUAGES.some((l) => l.code === value.language) ? { language: value.language } : {}),
    ...(value.pageLanguage === "fr" || value.pageLanguage === "en" ? { pageLanguage: value.pageLanguage } : {}),
    ...(SPEEDS.includes(value.playbackSpeed as Speed) ? { playbackSpeed: value.playbackSpeed } : {}),
    ...(typeof value.autoReadFees === "boolean" ? { autoReadFees: value.autoReadFees } : {}),
    ...(typeof value.enabledForSite === "boolean" ? { enabledForSite: value.enabledForSite } : {}),
    ...(typeof value.dockExpanded === "boolean" ? { dockExpanded: value.dockExpanded } : {}),
  } as UserPreferences;
}

export async function loadPrefs(): Promise<UserPreferences> {
  const area = storage();
  if (!area) return DEFAULT_PREFS;
  try {
    const stored = await area.get(KEY);
    return sanitize(stored[KEY]);
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: UserPreferences): Promise<void> {
  try {
    await storage()?.set({ [KEY]: prefs });
  } catch {
    // Storage failure is non-fatal: the value stays in component state (UC-02, 4a).
  }
}

/** Deletes the stored preferences; everything returns to its default (DR-03). */
export async function resetPrefs(): Promise<UserPreferences> {
  try {
    await storage()?.remove(KEY);
  } catch {
    // Nothing stored or storage unavailable: defaults apply either way.
  }
  return DEFAULT_PREFS;
}

/** Keeps the pill in sync with changes made elsewhere, e.g. the popup (FR-LNG-08). */
export function watchPrefs(onChange: (prefs: UserPreferences) => void): () => void {
  if (!storage()) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]) onChange(sanitize(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** The language the page is read and shown in: the user's choice, or the site's own language. */
export const effectiveLanguage = (prefs: Pick<UserPreferences, "language" | "pageLanguage">): LanguageCode =>
  prefs.language === "auto" ? prefs.pageLanguage : prefs.language;
