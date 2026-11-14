// Keeps the page in the language the user chose, and notices when the site itself changes language.
//
//  - setTarget(language): the page's visible text is rewritten in place from the curated
//    translations. Choosing the site's own language puts the original text back. It always works
//    from the ORIGINAL text, so switching language never compounds changes.
//  - Language detection never stops: when the site's own EN/FR button re-renders the page in the
//    other language, `switches` goes up and the widget falls back to following the site.
//
// What is never touched: amounts, numbers, names, references (the translator locks them), anything
// typed in a field, scripts, styles, and the widget itself.

import type { LanguageCode } from "../shared/prefs";
import { detectSource, translate, type SourceLang } from "../shared/translate";
import { HOST_ID } from "./scanner";

export interface TranslatorState {
  /** The language the site is written in. Only meaningful once `detected` is true (until then: French). */
  pageLanguage: SourceLang;
  detected: boolean;
  /** Counts the times the site itself switched language (its own EN/FR button). */
  switches: number;
  /** The language the page is being shown in. */
  target: LanguageCode;
  /** True while the page is shown in a language other than the site's own. */
  translating: boolean;
  /** Texts replaced by a translation. */
  translated: number;
  /** Texts with no translation, left exactly as the site wrote them. */
  left: number;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "IFRAME"]);
/** A language is only (re)decided from this many recognisable texts at once, so one stray sentence cannot flip it. */
const MIN_VOTES = 4;
/** …and only switched when this share of them agree. */
const SWITCH_SHARE = 0.75;

/** Every translatable text node under `root`, skipping whole subtrees that must not be touched. */
function textNodesUnder(root: Node): Text[] {
  const found: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement;
    if (parent && !parent.closest(`#${HOST_ID}`) && !SKIP_TAGS.has(parent.tagName.toUpperCase())) found.push(root as Text);
    return found;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return found;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        return el.id === HOST_ID || SKIP_TAGS.has(el.tagName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) found.push(node as Text);
  return found;
}

export class PageTranslator {
  private state: TranslatorState = {
    pageLanguage: "fr",
    detected: false,
    switches: 0,
    target: "fr",
    translating: false,
    translated: 0,
    left: 0,
  };
  private listeners = new Set<() => void>();
  /** Text node → its text before we changed it. */
  private originals = new Map<Text, string>();
  /** Text node → the text we wrote, to tell our own changes from the page's. */
  private written = new WeakMap<Text, string>();
  private observer: MutationObserver | null = null;
  private queue = new Set<Node>();
  private timer = 0;

  /** `onPageLanguage` tells the reader which language the site is written in. */
  constructor(private onPageLanguage: (language: SourceLang) => void = () => {}) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): TranslatorState => this.state;

  private set(patch: Partial<TranslatorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Starts watching the page. Detects the site's language from what is already there. */
  start(): void {
    if (this.observer || !document.body) return;
    const votes = this.vote(textNodesUnder(document.body).map((node) => node.nodeValue ?? ""));
    this.decide(votes, true);
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /** Shows the page in `target`. The site's own language puts the original text back. */
  setTarget(target: LanguageCode): void {
    this.set({ target });
    this.own(() => this.reapply());
  }

  /** Puts every original text back and stops. */
  destroy(): void {
    window.clearTimeout(this.timer);
    this.own(() => this.restoreAll());
    this.observer?.disconnect();
    this.observer = null;
    this.listeners.clear();
  }

  // ---- language of the site ----
  private vote(texts: string[]): { fr: number; en: number } {
    const votes = { fr: 0, en: 0 };
    for (const text of texts) {
      const language = detectSource(text.trim());
      if (language) votes[language]++;
    }
    return votes;
  }

  /**
   * The site's own language button. It shows the language you would switch TO: "EN" while the site is
   * in French, "FR" while it is in English. Reading it is more reliable than recognising sentences,
   * whose wording can differ from the site's.
   */
  private readSiteButton(): SourceLang | null {
    let found: SourceLang | null = null;
    for (const el of document.querySelectorAll("button, a, [role=button]")) {
      if (el.closest(`#${HOST_ID}`)) continue;
      const label = (el.textContent ?? "").trim().toUpperCase();
      if (label !== "EN" && label !== "FR") continue;
      const language: SourceLang = label === "EN" ? "fr" : "en";
      if (found && found !== language) return null; // conflicting controls: do not guess
      found = language;
    }
    return found;
  }

  /** Records the site's language. "initial" the first time it is known, "switched" when the site changed it. */
  private settle(language: SourceLang): "initial" | "switched" | null {
    if (!this.state.detected) {
      this.set({ pageLanguage: language, detected: true });
      this.onPageLanguage(language);
      // The target may have been chosen before the site's language was known: show the page correctly now.
      this.own(() => this.reapply());
      return "initial";
    }
    if (language === this.state.pageLanguage) return null;
    this.set({ pageLanguage: language, switches: this.state.switches + 1 });
    this.onPageLanguage(language);
    return "switched";
  }

  /**
   * Decides the site's language. The site's own language button settles it; recognising a batch of
   * known sentences is the fallback, and then only a clear majority counts as the site switching.
   */
  private decide(votes: { fr: number; en: number }, initial = false): "initial" | "switched" | null {
    const button = this.readSiteButton();
    if (button) return this.settle(button);
    const total = votes.fr + votes.en;
    if (total < MIN_VOTES) return null;
    const language: SourceLang = votes.en > votes.fr ? "en" : "fr";
    if (!this.state.detected) return this.settle(language);
    if (initial || language === this.state.pageLanguage || Math.max(votes.fr, votes.en) / total < SWITCH_SHARE) return null;
    return this.settle(language);
  }

  // ---- translating ----
  private translateNode(node: Text): "translated" | "left" | "skip" {
    const original = node.nodeValue ?? "";
    const core = original.trim();
    if (!core) return "skip";
    if (/^(EN|FR)$/i.test(core)) return "skip"; // the site's language button keeps its label
    const result = translate(core, this.state.target, this.state.pageLanguage);
    if (result.status === "template") {
      const start = original.indexOf(core);
      const value = original.slice(0, start) + result.text + original.slice(start + core.length);
      this.originals.set(node, original);
      this.written.set(node, value);
      node.nodeValue = value;
      return "translated";
    }
    // "same" and "verbatim" (numbers, names…) need no change; anything else has no translation.
    return result.status === "same" || result.status === "verbatim" ? "skip" : "left";
  }

  private reapply(): void {
    if (!document.body) return;
    this.restoreAll(); // always start from the original text
    if (this.state.target === this.state.pageLanguage) {
      this.set({ translating: false, translated: 0, left: 0 });
      return;
    }
    let translated = 0;
    let left = 0;
    for (const node of textNodesUnder(document.body)) {
      const outcome = this.translateNode(node);
      if (outcome === "translated") translated++;
      else if (outcome === "left") left++;
    }
    this.set({ translating: true, translated, left });
  }

  private restoreAll(): void {
    for (const [node, original] of this.originals) {
      // Only undo our own change; if the page rewrote this text meanwhile, leave its version.
      if (node.isConnected && node.nodeValue === this.written.get(node)) node.nodeValue = original;
    }
    this.originals.clear();
    this.written = new WeakMap();
  }

  // ---- the page changing under us ----
  /**
   * Runs our own text changes without mistaking them for the site's. Changes the site already made
   * are taken first; the records our changes create are discarded afterwards. (Comparing texts is not
   * enough: when the site switches to English it writes exactly the English text we had put there.)
   */
  private own<T>(change: () => T): T {
    if (this.observer) this.onMutations(this.observer.takeRecords());
    try {
      return change();
    } finally {
      this.observer?.takeRecords();
    }
  }

  private onMutations(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "characterData") {
        const node = record.target as Text;
        this.originals.delete(node); // the page changed it: its new text is the new original
        this.written.delete(node);
        this.queue.add(node);
      } else {
        for (const added of record.addedNodes) this.queue.add(added);
      }
    }
    if (this.queue.size > 0) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.flush(), 60);
    }
  }

  /** Handles text the page added or changed: notices a language switch, translates what is new. */
  private flush(): void {
    const nodes: Text[] = [];
    for (const item of this.queue) {
      if (!item.isConnected) continue;
      for (const node of textNodesUnder(item)) if (!this.written.has(node)) nodes.push(node);
    }
    this.queue.clear();
    if (nodes.length === 0) return;

    // These are texts as the page wrote them (our own translations are filtered out above), so
    // they show which language the site is in now.
    const outcome = this.decide(this.vote(nodes.map((node) => node.nodeValue ?? "")));
    if (outcome === "switched") {
      // The site changed language, but the page stays in the language the user chose: translate the
      // site's new text into it. (Choosing the site's new language shows its text as it is.)
      this.own(() => this.reapply());
      return;
    }
    if (!this.state.translating) return;

    let translated = 0;
    let left = 0;
    this.own(() => {
      for (const node of nodes) {
        const result = this.translateNode(node);
        if (result === "translated") translated++;
        else if (result === "left") left++;
      }
    });
    if (translated || left) {
      this.set({ translated: this.state.translated + translated, left: this.state.left + left });
    }
  }
}
