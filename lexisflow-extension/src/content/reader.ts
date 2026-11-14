// Playback controller: scan → translate → speak → highlight, plus live handling of alerts
// and of content inserted after load. Everything runs in the page; nothing is transmitted.

import { spokenToken, type VoiceLang } from "../shared/numbers";
import type { LanguageCode } from "../shared/prefs";
import { protect } from "../shared/protect";
import { detectSource, nationalStatus, translate, type Segment, type SourceLang } from "../shared/translate";
import { t } from "../shared/ui";
import { TextHighlightEngine } from "./overlay";
import {
  HOST_ID,
  alertSeverity,
  blocksForClick,
  collectReadingQueue,
  findAlertsWithin,
  scan,
  selectFeeBlocks,
  type Block,
} from "./scanner";

export type ReaderStatus = "idle" | "playing" | "paused" | "error";

export interface ReadingView {
  segments: Segment[];
  /** Source sentence, shown when it differs from what is displayed. */
  original: string | null;
  sentenceIndex: number;
  sentenceCount: number;
  /** 0..1 across the whole queue. */
  progress: number;
  notice: string | null;
  alert: boolean;
}

export interface ReaderState {
  status: ReaderStatus;
  reading: ReadingView | null;
  /** Message shown when nothing is being read (empty page, speech failure). */
  message: string | null;
}

interface Item {
  block: Block;
  segments: Segment[];
  original: string | null;
  spoken: string;
  voice: VoiceLang;
  notice: string | null;
}

const NATIONAL: readonly LanguageCode[] = ["ewo", "ful", "dua"];

// Letters the French voice cannot read are mapped to the nearest French spelling, for
// speech only. What is displayed always keeps the exact orthography.
const FRENCH_VOICE_MAP: Record<string, string> = {
  ɓ: "b", Ɓ: "B", ɗ: "d", Ɗ: "D", ƴ: "y", Ƴ: "Y", ŋ: "ng", Ŋ: "Ng", ñ: "gn", Ñ: "Gn", ń: "n", Ń: "N",
  ɛ: "è", Ɛ: "È", ɔ: "o", Ɔ: "O", ə: "e", Ə: "E", ʼ: "", "’": "'",
};
export function approximateForFrenchVoice(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[ɓƁɗƊƴƳŋŊñÑńŃʼ’]/g, (char) => FRENCH_VOICE_MAP[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tone marks
    .replace(/[ɛƐɔƆəƏ]/g, (char) => FRENCH_VOICE_MAP[char] ?? char)
    .normalize("NFC");
}

function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(lang) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    null
  );
}

export class Reader {
  private state: ReaderState = { status: "idle", reading: null, message: null };
  private listeners = new Set<() => void>();
  private queue: Item[] = [];
  private index = 0;
  private generation = 0;
  private language: LanguageCode = "fr";
  private speed = 1;
  private sourceHint: SourceLang = "fr";
  private highlighter = new TextHighlightEngine();
  private observer: MutationObserver | null = null;
  private changed = new Set<Element>();
  private flushTimer = 0;
  private watchdog = 0;
  private seenAlerts = new WeakSet<Element>();
  private autoReadFees = false;
  private autoReadTimer = 0;
  /** Fee elements already announced, so a value changing while the user types does not repeat it. */
  private announcedFees = new WeakSet<Element>();
  /** The language the site is written in (its text may be shown translated, so it cannot be read back from the page). */
  private pageLanguage: SourceLang | null = null;
  /** The language LexisFlow's own messages are written in: the site's. */
  private uiLanguage: LanguageCode = "fr";
  private clickHandler: ((event: MouseEvent) => void) | null = null;

  // ---- store interface for React ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): ReaderState => this.state;

  private set(patch: Partial<ReaderState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ---- lifecycle ----
  start(): void {
    for (const root of findAlertsWithin(document.body)) this.seenAlerts.add(root);
    this.observer = new MutationObserver(this.onMutations);
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Set by the page translator: the language the site is written in. */
  setPageLanguage(language: SourceLang | null): void {
    this.pageLanguage = language;
    if (language) this.uiLanguage = language;
  }

  /** Click-to-read: while on, clicking plain text on the page reads it. The click itself is never blocked. */
  setClickToRead(on: boolean): void {
    if (on && !this.clickHandler) {
      this.clickHandler = (event) => this.onPageClick(event);
      document.addEventListener("click", this.clickHandler, true);
    } else if (!on && this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true);
      this.clickHandler = null;
    }
  }

  private onPageClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.composedPath().some((node) => node instanceof Element && node.id === HOST_ID)) return;
    const target = event.target instanceof Element ? event.target : null;
    const blocks = target ? blocksForClick(target) : [];
    if (blocks.length === 0) return;
    this.readBlocks(blocks);
  }

  /**
   * Reads exactly these blocks now, replacing whatever is queued. Money, numbers, references and
   * names go through the same lock and spoken form as a full-page reading (see `prepare`), and the
   * browser voice speaks them. Used by click-to-read and hover-to-read.
   */
  readBlocks(blocks: Block[]): void {
    if (blocks.length === 0) return;
    this.hintFrom(blocks);
    this.queue = blocks.map((block) => this.prepare(block));
    this.index = 0;
    this.speakCurrent();
  }

  private hintFrom(blocks: Block[]): void {
    this.sourceHint = this.pageLanguage ?? detectSource(blocks[0].text) ?? this.sourceHint;
  }

  /** Stops speaking and drops the queue (the reading highlight goes with it). */
  stopReading(): void {
    this.finish();
  }

  destroy(): void {
    this.setClickToRead(false);
    window.clearTimeout(this.autoReadTimer);
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.clearTimeout(this.flushTimer);
    this.halt();
    this.listeners.clear();
  }

  configure(language: LanguageCode, speed: number, autoReadFees = false): void {
    const languageChanged = language !== this.language;
    const speedChanged = speed !== this.speed;
    const autoTurnedOn = autoReadFees && !this.autoReadFees;
    this.language = language;
    this.speed = speed;
    this.autoReadFees = autoReadFees;
    if (autoTurnedOn) this.scheduleAutoRead(600);
    if (this.state.status !== "playing") return;
    if (languageChanged) {
      // Restart the current block in the new language (FR-LNG-05).
      this.queue = this.queue.map((item) => this.prepare(item.block));
      this.speakCurrent();
    } else if (speedChanged) {
      this.speakCurrent();
    }
  }

  toggle(): void {
    if (this.state.status === "playing") {
      this.halt();
      this.set({ status: "paused", message: null });
    } else if (this.state.status === "paused" && this.queue[this.index]?.block.el.isConnected) {
      this.speakCurrent();
    } else {
      this.play();
    }
  }

  // ---- queue ----
  private play(): void {
    const blocks = collectReadingQueue();
    for (const root of findAlertsWithin(document.body)) this.seenAlerts.add(root);
    if (blocks.length === 0) {
      this.halt();
      this.set({ status: "idle", reading: null, message: t(this.uiLanguage, "nothingToRead") });
      return;
    }
    this.sourceHint = this.guessSource(blocks);
    this.queue = blocks.map((block) => this.prepare(block));
    this.index = 0;
    this.speakCurrent();
  }

  /** The page's own language, from the first blocks a template recognises. */
  private guessSource(blocks: Block[]): SourceLang {
    if (this.pageLanguage) return this.pageLanguage;
    const votes = { fr: 0, en: 0 };
    for (const block of blocks) {
      if (block.kind !== "text") continue;
      const source = detectSource(block.text);
      if (source) votes[source]++;
      if (votes.fr + votes.en >= 8) break;
    }
    return votes.en > votes.fr ? "en" : "fr";
  }

  private prepare(block: Block): Item {
    const speak = (segments: Segment[], voice: VoiceLang, approximate = false) =>
      segments
        .map((s) => (s.token ? spokenToken(s.token, voice) : approximate ? approximateForFrenchVoice(s.text) : s.text))
        .join("");

    // One voice for the whole reading, so the language never jumps from block to block:
    //  - French or English chosen: that language, for translated text, names, typed details and
    //    text with no translation alike (money and numbers are spoken in it too).
    //  - Ewondo, Fulfulde or Duala chosen (no voice exists): the page's own language, which is also
    //    the language money is pronounced in.
    const voice = this.readingVoice();

    if (block.kind === "field") {
      // User-typed data: shown and spoken exactly as entered, never translated.
      const { tokens } = protect(block.text);
      const result = translate(block.text, this.sourceHint, this.sourceHint);
      const segments =
        tokens.length > 0 ? result.segments : [{ text: block.text, protectedValue: true }];
      return {
        block,
        segments: segments.map((s) => ({ ...s, protectedValue: true })),
        original: null,
        spoken: speak(segments, voice),
        voice,
        notice: null,
      };
    }

    const result = translate(block.text, this.language, this.sourceHint);
    const national = NATIONAL.includes(result.lang);
    const untranslated =
      (result.status === "missing" || result.status === "unknown") && result.lang !== this.language;
    return {
      block,
      segments: result.segments,
      original: result.status === "template" ? block.text : null,
      spoken: speak(result.segments, voice, national),
      voice,
      notice: untranslated
        ? t(this.uiLanguage, "noticeUntranslated")
        : national
          ? t(this.uiLanguage, nationalStatus(result.lang) === "draft" ? "noticeDraft" : "noticeApproximate")
          : null,
    };
  }

  /** The voice used for everything in the current reading. */
  private readingVoice(): VoiceLang {
    return this.language === "fr" || this.language === "en" ? this.language : this.sourceHint;
  }

  // ---- speech ----
  private halt(): void {
    this.generation++;
    window.clearTimeout(this.watchdog);
    window.speechSynthesis?.cancel();
    this.highlighter.removeHighlight();
  }

  private finish(): void {
    this.halt();
    this.queue = [];
    this.index = 0;
    this.set({ status: "idle", reading: null, message: null });
  }

  private fail(message: string): void {
    this.halt();
    this.set({ status: "error", reading: null, message });
  }

  private speakCurrent(): void {
    while (this.index < this.queue.length && !this.queue[this.index].block.el.isConnected) this.index++;
    const item = this.queue[this.index];
    if (!item) return this.finish();

    this.halt();
    const generation = this.generation;
    const total = this.queue.length;
    const position = this.index;

    const publish = (fraction: number) =>
      this.set({
        status: "playing",
        message: null,
        reading: {
          segments: item.segments,
          original: item.original,
          sentenceIndex: position + 1,
          sentenceCount: total,
          progress: (position + fraction) / total,
          notice: item.notice,
          alert: item.block.alert !== null,
        },
      });

    const next = () => {
      this.index = position + 1;
      this.speakCurrent();
    };

    // Highlight and show the sentence at once; audio follows as soon as it is ready.
    this.highlighter.highlightElement(item.block.el);
    this.speakBrowser(item, generation, publish, next);
  }

  /** The browser's own voice: instant, nothing to download, and it works offline with a local voice (FR-OFF-03). */
  private speakBrowser(item: Item, generation: number, publish: (fraction: number) => void, next: () => void): void {
    const synth = window.speechSynthesis;
    if (!synth) return this.fail(t(this.uiLanguage, "speechUnavailable"));

    const utterance = new SpeechSynthesisUtterance(item.spoken);
    utterance.lang = item.voice === "fr" ? "fr-FR" : "en-US";
    const voice = pickVoice(item.voice);
    if (voice) utterance.voice = voice;
    // 1.0× maps to a slightly slow rate so numbers stay intelligible (FR-OFF-03).
    utterance.rate = Math.min(2, Math.max(0.5, this.speed * 0.95));

    utterance.onstart = () => {
      if (generation === this.generation) window.clearTimeout(this.watchdog);
    };
    utterance.onboundary = (event) => {
      if (generation !== this.generation) return;
      publish(Math.min(1, event.charIndex / Math.max(1, item.spoken.length)));
    };
    utterance.onend = () => {
      if (generation === this.generation) next();
    };
    utterance.onerror = (event) => {
      if (generation !== this.generation) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      this.fail(t(this.uiLanguage, "speechFailed"));
    };

    publish(0);
    synth.speak(utterance);
    this.watchdog = window.setTimeout(() => {
      if (generation === this.generation && !synth.speaking) {
        this.fail(t(this.uiLanguage, "speechNoStart"));
      }
    }, 4000);
  }

  // ---- auto-read fees (popup option, FR-POP-02/03) ----
  private scheduleAutoRead(delay: number): void {
    if (!this.autoReadFees) return;
    window.clearTimeout(this.autoReadTimer);
    this.autoReadTimer = window.setTimeout(() => this.autoReadNow(), delay);
  }

  /**
   * When a page shows fees, reads the fee blocks (and only those) once. Never interrupts a
   * reading in progress, and never repeats for a fee that is already on screen.
   */
  private autoReadNow(): void {
    if (!this.autoReadFees || this.state.status !== "idle" || document.hidden) return;
    const blocks = collectReadingQueue();
    const fees = selectFeeBlocks(blocks);
    // Something to announce only if a fee element appeared that has not been announced yet.
    if (!fees.some((block) => !this.announcedFees.has(block.el))) return;
    for (const block of fees) this.announcedFees.add(block.el);
    this.sourceHint = this.guessSource(blocks);
    this.queue = fees.map((block) => this.prepare(block));
    this.index = 0;
    this.speakCurrent();
  }

  // ---- live page changes ----
  private onVisibility = (): void => {
    if (document.hidden && this.state.status === "playing") this.toggle();
  };

  private onMutations = (records: MutationRecord[]): void => {
    for (const record of records) {
      if (record.type === "characterData") {
        if (record.target.parentElement) this.changed.add(record.target.parentElement);
        continue;
      }
      for (const node of record.addedNodes) {
        const el = node instanceof Element ? node : node.parentElement;
        if (el && el.id !== HOST_ID) this.changed.add(el);
      }
    }
    if (this.changed.size === 0) return;
    window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(this.flush, 120);
  };

  private flush = (): void => {
    const changed = [...this.changed].filter((el) => el.isConnected);
    this.changed.clear();
    if (changed.length === 0) return;
    const playing = this.state.status === "playing";

    // The step was replaced under us: read the new content from the top.
    if (playing && !this.queue[this.index]?.block.el.isConnected) {
      this.play();
      return;
    }

    const newAlerts: Element[] = [];
    for (const el of changed) {
      for (const root of findAlertsWithin(el)) {
        if (!this.seenAlerts.has(root)) {
          this.seenAlerts.add(root);
          newAlerts.push(root);
        }
      }
    }

    if (newAlerts.length > 0) {
      const critical = newAlerts.some((root) => alertSeverity(root) === "critical");
      const items = newAlerts.flatMap((root) => scan(root)).map((block) => this.prepare(block));
      if (items.length === 0) return;
      if (!playing) {
        // Alerts are announced even when nothing is playing (FR-ALR-07).
        this.queue = items;
        this.index = 0;
        this.speakCurrent();
      } else if (critical) {
        // Interrupt now; the interrupted sentence restarts afterwards (FR-ALR-03).
        this.queue.splice(this.index, 0, ...items);
        this.speakCurrent();
      } else {
        this.queue.splice(this.index + 1, 0, ...items);
      }
      return;
    }

    if (!playing) {
      this.scheduleAutoRead(1200);
      return;
    }
    // Other content that appeared or changed while reading: update or append it.
    for (const el of changed) {
      for (const block of scan(el)) {
        const at = this.queue.findIndex((item) => item.block.el === block.el);
        if (at === -1) this.queue.push(this.prepare(block));
        else if (at > this.index) this.queue[at] = this.prepare(block);
      }
    }
  };
}
