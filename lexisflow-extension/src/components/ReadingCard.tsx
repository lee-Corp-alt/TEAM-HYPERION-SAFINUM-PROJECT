import type { ReadingView } from "../content/reader";
import type { LanguageCode } from "../shared/prefs";
import { t } from "../shared/ui";

interface Props {
  visible: boolean;
  /** Language LexisFlow's own text is shown in. */
  lang: LanguageCode;
  languageLabel: string;
  reading: ReadingView | null;
  /** Shown instead of a sentence: empty page, speech failure. */
  message: string | null;
  error: boolean;
}

export function ReadingCard({ visible, lang, languageLabel, reading, message, error }: Props) {
  const heading = error
    ? t(lang, "cardError")
    : reading?.alert
      ? t(lang, "cardAlert")
      : reading
        ? t(lang, "cardReading")
        : t(lang, "cardInfo");

  return (
    <div
      className={`reading-card ${error ? "is-error" : ""}`}
      aria-hidden={!visible}
    >
      <div className="reading-topline">
        <span className="now-reading">
          <span /> {heading}
        </span>
        <span className="reading-language">
          {languageLabel}
          {reading && ` · ${t(lang, "voiceBrowser")}`}
        </span>
      </div>
      {/* Page text is always rendered as text nodes, never as HTML (NFR-SEC-12). */}
      <p>
        {reading
          ? reading.segments.map((segment, index) =>
              segment.protectedValue ? (
                <mark key={index}>{segment.text}</mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )
          : message}
      </p>
      {reading?.original && <p className="reading-original">{reading.original}</p>}
      {reading?.notice && <p className="reading-notice">{reading.notice}</p>}
      {reading && (
        <>
          <div className="reading-progress">
            <span style={{ width: `${Math.round(reading.progress * 100)}%` }} />
          </div>
          <div className="reading-footer">
            <span>{t(lang, "sentenceOf", { n: reading.sentenceIndex, total: reading.sentenceCount })}</span>
          </div>
        </>
      )}
    </div>
  );
}
