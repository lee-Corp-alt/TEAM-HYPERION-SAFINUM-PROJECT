import { useEffect, useState } from "react";
import { BrandMark, ChevronDown } from "../components/icons";
import {
  DEFAULT_PREFS,
  LANGUAGES,
  loadPrefs,
  resetPrefs,
  savePrefs,
  watchPrefs,
  type ChosenLanguage,
  type UserPreferences,
} from "../shared/prefs";
import { nationalStatus } from "../shared/translate";
import { t as translateUi, type UiKey } from "../shared/ui";
import { checkSite, type SiteState } from "./site";

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="row switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
    </button>
  );
}

export function Popup() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [site, setSite] = useState<SiteState>("checking");

  useEffect(() => {
    let active = true;
    void loadPrefs().then((stored) => active && setPrefs(stored));
    void checkSite().then((state) => active && setSite(state));
    const stopWatching = watchPrefs(setPrefs);
    return () => {
      active = false;
      stopWatching();
    };
  }, []);

  const update = (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void savePrefs(next);
  };

  const blocked = site === "blocked";
  const disabled = blocked || site === "checking";
  const draft = prefs.language !== "auto" && nationalStatus(prefs.language) === "draft";
  /** LexisFlow's own text, in the language the site is in (kept up to date by the bar on the page). */
  const t = (key: UiKey) => translateUi(prefs.pageLanguage, key);

  return (
    <main className="popup" aria-label={t("popupAria")}>
      <header className="head">
        <span className="orbit">
          <BrandMark />
        </span>
        <div>
          <h1>LexisFlow</h1>
          <p>{t("popupTagline")}</p>
        </div>
      </header>

      {blocked && (
        <p className="notice" role="status">
          {t("popupBlocked")}
        </p>
      )}

      <Switch
        label={t("popupEnable")}
        hint={t("popupEnableHint")}
        checked={prefs.enabledForSite}
        disabled={disabled}
        onChange={(value) => update({ enabledForSite: value })}
      />

      <section aria-labelledby="read-title">
        <h2 id="read-title">{t("popupRead")}</h2>
        <label className="field">
          <span className="row-label">{t("popupLanguage")}</span>
          <span className="select-wrap">
            <select
              value={prefs.language}
              disabled={disabled}
              aria-label={t("popupLanguage")}
              onChange={(event) => update({ language: event.target.value as ChosenLanguage })}
            >
              <option value="auto">{t("languageAuto")}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown />
          </span>
        </label>
        {draft && <p className="hint-draft">{t("popupDraft")}</p>}
      </section>

      <footer className="foot">
        <button
          type="button"
          className="link"
          disabled={disabled}
          onClick={() => void resetPrefs().then(setPrefs)}
        >
          {t("popupReset")}
        </button>
      </footer>
    </main>
  );
}
