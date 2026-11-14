import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { watchBackdropTone, type Tone } from "../content/backdrop-tone";
import { onCommand, takePanelCommand } from "../content/shortcuts";
import type { Command } from "../shared/commands";
import type { HoverReader } from "../content/hover-reader";
import type { PageTranslator } from "../content/page-translator";
import type { Reader } from "../content/reader";
import {
  DEFAULT_PREFS,
  LANGUAGES,
  SPEEDS,
  formatSpeed,
  loadPrefs,
  savePrefs,
  watchPrefs,
  type LanguageCode,
  type UserPreferences,
} from "../shared/prefs";
import { t as translateUi, type UiKey } from "../shared/ui";
import { BrandMark, ChevronDown, PauseIcon, PlayIcon, ReadAllIcon, VolumeIcon } from "./icons";
import { ReadingCard } from "./ReadingCard";

const WAVE_BARS = [12, 20, 30, 18, 26, 14, 22];

function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {WAVE_BARS.map((height, index) => (
        <span key={index} style={{ height, animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}

interface Props {
  reader: Reader;
  translator: PageTranslator;
  hover: HoverReader;
}

export function LexisDock({ reader, translator, hover }: Props) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot);
  const page = useSyncExternalStore(translator.subscribe, translator.getSnapshot);
  // Always starts collapsed on each page load; not saved, so an old expanded state never returns.
  const [expanded, setExpanded] = useState(false);
  const [readingAll, setReadingAll] = useState(false);
  const [pageReading, setPageReading] = useState(false);
  // Frosted glass: white text over a dark page, dark text over a light one (see backdrop-tone.ts).
  const dockRef = useRef<HTMLElement>(null);
  const [tone, setTone] = useState<Tone>("dark");

  // Two different languages:
  //  - the SITE's language (page.pageLanguage): LexisFlow's own text is always shown in it;
  //  - the language the page is READ and SHOWN in (effective): the user's choice, or the site's own.
  const siteLanguage = page.pageLanguage;
  const effective: LanguageCode = prefs.language === "auto" ? siteLanguage : prefs.language;
  const t = (key: UiKey, vars?: Record<string, string | number>) => translateUi(siteLanguage, key, vars);

  useEffect(() => {
    let active = true;
    void loadPrefs().then((stored) => {
      if (!active) return;
      setPrefs(stored);
      setLoaded(true);
    });
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

  // The page follows the chosen language by itself: no button. Choosing the site's own language
  // puts the original text back.
  useEffect(() => {
    if (loaded) translator.setTarget(effective);
  }, [translator, loaded, effective]);

  // The site's own EN/FR button: LexisFlow's own text follows the site's language, which is stored
  // for the popup. The page stays in the language the user chose; the translator re-translates the
  // site's new text into it (and choosing the site's own language shows its text as it is).
  useEffect(() => {
    if (loaded && page.detected && prefs.pageLanguage !== siteLanguage) update({ pageLanguage: siteLanguage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, page.detected, siteLanguage]);

  useEffect(() => {
    reader.configure(effective, prefs.playbackSpeed, prefs.autoReadFees);
  }, [reader, effective, prefs.playbackSpeed, prefs.autoReadFees]);

  useEffect(
    () => watchBackdropTone(() => dockRef.current?.querySelector(".widget-shell")?.getBoundingClientRect() ?? null, setTone),
    [expanded],
  );

  // "Read all": reads the whole page from the top by itself. It is over when the reader goes idle.
  useEffect(() => {
    if (readingAll && (state.status === "idle" || state.status === "error")) setReadingAll(false);
  }, [readingAll, state.status]);

  // Play: every text block on the page (translated, when the page is translated) gets a box, and
  // resting the pointer on a box reads that block aloud. Pause removes the boxes and stops the speech.
  useEffect(() => {
    hover.setActive(pageReading);
  }, [hover, pageReading]);
  // Switched off only when the dock goes away, not between changes.
  useEffect(() => () => hover.setActive(false), [hover]);

  const togglePlay = () => {
    if (pageReading || readingAll) reader.stopReading();
    setPageReading(!pageReading);
    setReadingAll(false);
  };

  // Read all: starts reading the whole page now; pressing it again stops. It replaces the pointer
  // reading (with both on, hovering would cut the page reading short).
  const toggleReadAll = () => {
    if (readingAll) {
      reader.stopReading();
      setReadingAll(false);
      return;
    }
    setPageReading(false);
    setReadingAll(true);
    reader.stopReading();
    reader.toggle(); // inside the click, so the browser allows audio to start
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Alt+Shift+L / Alt+Shift+S, only with focus inside the bar.
    const panelCommand = takePanelCommand(event.nativeEvent);
    if (panelCommand === "next-language") return cycleLanguage();
    if (panelCommand === "next-speed") return cycleSpeed();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(prefs.playbackSpeed) + 1) % SPEEDS.length];
    update({ playbackSpeed: next });
  };

  const cycleLanguage = () => {
    const next = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === effective) + 1) % LANGUAGES.length].code;
    update({ language: next === siteLanguage ? "auto" : next });
  };

  // ---- global shortcuts (Alt+L / R / P / O), from the page or from Chrome's own shortcut handling ----
  /** Where keyboard focus was before Alt+L opened the panel, to give it back when Alt+L closes it. */
  const returnFocus = useRef<HTMLElement | null>(null);
  const runCommand = (command: Command) => {
    const root = dockRef.current?.getRootNode();
    const focused = root instanceof ShadowRoot ? root.activeElement : null;
    switch (command) {
      case "toggle-panel":
        if (expanded) {
          setExpanded(false);
          // Focus goes back where it came from; it is never left on a control that just disappeared.
          if (focused instanceof HTMLElement) {
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else focused.blur();
          }
          returnFocus.current = null;
        } else {
          const active = document.activeElement;
          returnFocus.current = !focused && active instanceof HTMLElement && active !== document.body ? active : null;
          setExpanded(true);
          // The first control of the panel (it exists collapsed or expanded, so no wait is needed).
          dockRef.current?.querySelector<HTMLButtonElement>(".play-button")?.focus();
        }
        break;
      case "toggle-pointer-reading":
        togglePlay();
        break;
      case "toggle-read-all":
        // Pause and resume keep the place on the page; the Read all button and Escape stop it outright.
        if (readingAll && (state.status === "playing" || state.status === "paused")) {
          reader.toggle();
        } else {
          toggleReadAll();
        }
        break;
      case "original-language":
        if (prefs.language !== "auto") update({ language: "auto" });
        break;
    }
  };
  // Escape, from anywhere (focus in the bar or on the page), goes one step at a time:
  //   1. stop whatever is being read (and leave hover/tap reading),
  //   2. collapse the expanded bar,
  //   3. close LexisFlow, exactly like the × button.
  // Listens after the page (bubbling) and stands down when the page already handled the key; while the
  // user is typing in a page field, Escape belongs to that field, so the closing step is skipped there.
  const escapeStep = (event: globalThis.KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const root = dockRef.current?.getRootNode();
    const inBar = root instanceof ShadowRoot && root.activeElement !== null;

    if (pageReading || readingAll || reader.getSnapshot().status === "playing") {
      reader.stopReading();
      setPageReading(false);
      setReadingAll(false);
    } else if (expanded) {
      setExpanded(false);
      // The tools row disappears: keep keyboard focus on a control that stays (WCAG 2.4.3).
      if (inBar) dockRef.current?.querySelector<HTMLButtonElement>(".collapse-button")?.focus();
    } else {
      const target = event.composedPath()[0];
      const typing =
        target instanceof HTMLElement &&
        !inBar &&
        (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
      if (typing) return;
      // Hand keyboard focus back to where it was on the page (or leave it there if it never left).
      if (inBar && returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
      update({ enabledForSite: false });
    }
  };
  const latestEscape = useRef(escapeStep);
  latestEscape.current = escapeStep;
  useEffect(() => {
    const handle = (event: globalThis.KeyboardEvent) => latestEscape.current(event);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  const latestCommand = useRef(runCommand);
  latestCommand.current = runCommand;
  useEffect(() => onCommand((command) => latestCommand.current(command)), []);

  const language = LANGUAGES.find((l) => l.code === effective) ?? LANGUAGES[3];
  const speedLabel = formatSpeed(prefs.playbackSpeed);
  const isPlaying = state.status === "playing";
  const isError = state.status === "error";
  const showCard = (isPlaying && state.reading !== null) || state.message !== null;
  const dockClass = [
    "lexis-dock",
    showCard && "is-playing",
    isPlaying && "is-active",
    isError && "is-error",
    !expanded && "is-collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  const toolInfo = page.translating
    ? t("translatedInfo", { done: page.translated, left: page.left })
    : pageReading
      ? t("hoverToReadOn")
      : readingAll
        ? t("readAllOn")
        : "";

  // One permanent, visually hidden live region for status messages. (A region that is hidden and shown
  // again, like the reading card, can fail to be announced.) It speaks only status, never each sentence,
  // since the voice is already reading those.
  const announcement = state.message ?? "";

  return (
    <aside ref={dockRef} className={dockClass} data-tone={tone} aria-label={t("dockLabel")} onKeyDown={onKeyDown}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <ReadingCard
        visible={showCard}
        lang={siteLanguage}
        languageLabel={language.label}
        reading={isPlaying ? state.reading : null}
        message={state.message}
        error={isError}
      />

      <div className="widget-shell">
        <div className="widget-main">
          <div className="widget-brand">
            <span className="status-orbit">
              <BrandMark />
            </span>
            {expanded && (
              <div>
                <strong>LexisFlow</strong>
                <small>
                  {isError ? t("statusError") : isPlaying ? t("statusReading") : t("statusActive")}
                </small>
              </div>
            )}
          </div>

          <button
            className="play-button"
            type="button"
            onClick={togglePlay}
            aria-pressed={pageReading}
            aria-label={t("play")}
            aria-keyshortcuts="Alt+R"
            title={`${t("play")} (Alt+R)`}
          >
            {pageReading ? <PauseIcon /> : <PlayIcon />}
          </button>

          {expanded && (
            <div className="wave-wrap">
              {isPlaying ? (
                <Waveform />
              ) : (
                <span className="ready-label">{state.status === "paused" ? t("wavePaused") : t("waveReady")}</span>
              )}
            </div>
          )}

          <label className="select-wrap">
            <span className="sr-only">{t("languageLabel")}</span>
            <select
              value={effective}
              onChange={(event) => {
                const chosen = event.target.value as LanguageCode;
                // The site's own language means "leave the page as it is".
                update({ language: chosen === siteLanguage ? "auto" : chosen });
              }}
              aria-label={t("languageLabel")}
              aria-keyshortcuts="Alt+Shift+L"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code === siteLanguage ? `${l.label} · ${t("originalTag")}` : l.label}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>

          <button
            className="speed-button"
            type="button"
            onClick={cycleSpeed}
            aria-label={t("speed", { speed: speedLabel })}
            aria-keyshortcuts="Alt+Shift+S"
            title="Alt+Shift+S"
          >
            {speedLabel}
          </button>

          <button
            className="close-button"
            type="button"
            onClick={() => update({ enabledForSite: false })}
            aria-label={t("close")}
            aria-keyshortcuts="Escape"
            title={`${t("closeHint")} · Esc`}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <button
            className="collapse-button"
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? t("collapse") : t("expand")}
            aria-keyshortcuts="Alt+L"
            title={`${expanded ? t("collapse") : t("expand")} (Alt+L)`}
          >
            <ChevronDown />
          </button>
        </div>

        {expanded && (
          <div className="widget-tools">
            <button
              type="button"
              className={`tool-button ${readingAll ? "is-on" : ""}`}
              aria-pressed={readingAll}
              aria-keyshortcuts="Alt+P"
              title={`${t("readAll")} (Alt+P)`}
              onClick={toggleReadAll}
            >
              <ReadAllIcon />
              {t("readAll")}
            </button>
            <span className="tool-info" role="status" aria-live="polite">
              {toolInfo}
            </span>
          </div>
        )}

        {expanded && (
          <div className="widget-hint">
            <span>
              <VolumeIcon /> {t("voiceBrowser")}
            </span>
            <span className="hint-keys" aria-hidden="true">
              <kbd>Alt</kbd>+<kbd>L</kbd> · <kbd>Esc</kbd>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
