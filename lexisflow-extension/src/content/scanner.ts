// Read-only DOM scanner (SRS 3.3). The test page has no hooks of any kind, so everything
// here is heuristic and works on pages it has never seen (FR-DOM-11). It never writes to
// the page.

export const HOST_ID = "lexisflow-root-container";

export type AlertSeverity = "critical" | "warning";

export interface Block {
  el: Element;
  text: string;
  /** "field" = a value the user typed: read back verbatim, never translated. */
  kind: "text" | "field";
  alert: AlertSeverity | null;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "OPTION", "IFRAME", "CANVAS"]);
const UNREADABLE_INPUTS = new Set([
  "password", "hidden", "checkbox", "radio", "submit", "button", "reset", "file", "image", "range", "color",
]);

const ALERT_ROLE = /^(alert|alertdialog|dialog|status)$/;
// Class-name heuristics: explicit words, or the red/amber utility colours used for banners.
const ALERT_CLASS =
  /(^|[\s_-])(alert|error|danger|warning|toast|snackbar|notification)([\s_-]|$)|(?:^|\s)(?:border|bg)-(?:red|rose|amber|orange|yellow)-\d/i;
const CRITICAL_WORDS =
  /fraud|frauduleu|compromis|bloqu|suspect|s[ée]curit|security|\bpin\b|mot de passe|password|code secret|pirat|hack|arnaque|scam|phishing/i;

function isVisible(el: Element): boolean {
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0;
}

function isSkipped(el: Element): boolean {
  return (
    SKIP_TAGS.has(el.tagName.toUpperCase()) ||
    el.id === HOST_ID ||
    el.getAttribute("aria-hidden") === "true"
  );
}

function looksLikeAlert(el: Element): boolean {
  if (el.closest("button, a, label, select, input, textarea")) return false;
  const role = el.getAttribute("role");
  if (role && ALERT_ROLE.test(role)) return true;
  const className = el.getAttribute("class");
  return className !== null && ALERT_CLASS.test(className);
}

/** Nearest alert-like container of an element, if any. */
export function findAlertRoot(el: Element): Element | null {
  for (let node: Element | null = el, depth = 0; node && node !== document.body && depth < 8; depth++) {
    if (looksLikeAlert(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Alert containers at or below an element (used on freshly inserted nodes). */
export function findAlertsWithin(el: Element): Element[] {
  const up = findAlertRoot(el);
  if (up) return [up];
  const found: Element[] = [];
  for (const node of el.querySelectorAll("*")) {
    if (looksLikeAlert(node) && !found.some((root) => root.contains(node))) found.push(node);
  }
  return found;
}

export const alertSeverity = (root: Element): AlertSeverity =>
  CRITICAL_WORDS.test(root.textContent ?? "") ? "critical" : "warning";

function fieldBlock(el: Element): Block | null {
  if (el.closest("[data-sensitive]")) return null;
  if (el instanceof HTMLSelectElement) {
    const text = el.selectedOptions[0]?.textContent?.trim();
    // The option label is page text, not user data, so it can be translated.
    return text ? { el, text, kind: "text", alert: null } : null;
  }
  if (el instanceof HTMLInputElement) {
    // Credentials and one-time codes are never read (NFR-SEC-05).
    if (UNREADABLE_INPUTS.has(el.type) || el.autocomplete === "one-time-code") return null;
  } else if (!(el instanceof HTMLTextAreaElement)) {
    return null;
  }
  const text = el.value.trim();
  return text ? { el, text, kind: "field", alert: null } : null;
}

function ownText(el: Element): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  }
  return text.replace(/\s+/g, " ").trim();
}

function blockFor(el: Element): Block | null {
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return fieldBlock(el);
  const text = ownText(el);
  if (!text) return null;
  const root = findAlertRoot(el);
  return { el, text, kind: "text", alert: root ? alertSeverity(root) : null };
}

/** Speakable blocks at or below `root`, in document order. */
export function scan(root: Element): Block[] {
  if (!root.isConnected) return [];
  for (let node: Element | null = root; node; node = node.parentElement) {
    if (isSkipped(node)) return [];
  }
  if (!isVisible(root)) return [];

  const blocks: Block[] = [];
  const push = (el: Element) => {
    const block = blockFor(el);
    if (block) blocks.push(block);
  };
  push(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const el = node as Element;
      if (isSkipped(el) || !isVisible(el)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) push(node as Element);
  return blocks;
}

const FEE_LABEL = /^(frais|fees?)$/i;
// The sentence that states how fees are computed, e.g. "Frais de 1,5 % (min. …)".
const FEE_RULE = /^(frais de|fee of)\s.*%/i;
const FEE_VALUE = /^(gratuit|free)$/i;
const HAS_AMOUNT = /\d.*(FCFA|F\s?CFA|XAF)/i;

/**
 * Only the blocks about transfer fees (FR-POP-03): the fee-rule sentence, and the "Frais" label
 * together with the value that follows it. Totals, balances and everything else are left alone.
 */
export function selectFeeBlocks(blocks: Block[]): Block[] {
  const picked: Block[] = [];
  blocks.forEach((block, index) => {
    if (block.kind !== "text" || block.alert) return;
    if (FEE_RULE.test(block.text)) {
      picked.push(block);
      return;
    }
    if (!FEE_LABEL.test(block.text)) return;
    picked.push(block);
    for (let next = index + 1; next < Math.min(blocks.length, index + 3); next++) {
      const value = blocks[next];
      if (value.kind === "text" && (FEE_VALUE.test(value.text) || HAS_AMOUNT.test(value.text))) picked.push(value);
      else break;
    }
  });
  return picked;
}

export const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [contenteditable=true]";

/**
 * What to read when the user clicks on text (click-to-read). Controls are left alone, so using the
 * page normally is never affected. A label and its value ("Frais" + "375 FCFA") are read together,
 * since a value alone says little.
 */
export function blocksForClick(target: Element): Block[] {
  if (target.closest(INTERACTIVE)) return [];
  let hit: Element | null = null;
  for (let el: Element | null = target, depth = 0; el && el !== document.body && depth < 4; el = el.parentElement, depth++) {
    if (isSkipped(el)) return [];
    if (ownText(el)) {
      hit = el;
      break;
    }
  }
  if (!hit || !isVisible(hit)) return [];

  const parent = hit.parentElement;
  if (parent && parent !== document.body && !parent.querySelector(INTERACTIVE) && (parent.textContent ?? "").length <= 140) {
    const group = scan(parent).filter((block) => block.kind === "text");
    if (group.length > 1 && group.length <= 4 && group.some((block) => block.el === hit)) return group;
  }
  const single = blockFor(hit);
  return single && single.kind === "text" ? [single] : [];
}

/** The element holding the page's main content: the largest main/section/article, else body. */
export function primaryRegion(): Element {
  let best: Element = document.body;
  let bestLength = 0;
  for (const el of document.querySelectorAll("main, [role=main], section, article")) {
    if (el.closest(`#${HOST_ID}`) || !isVisible(el)) continue;
    const length = (el.textContent ?? "").trim().length;
    if (length > bestLength) {
      best = el;
      bestLength = length;
    }
  }
  return best;
}

/**
 * Everything to read for one press of Play: alerts first (critical before warnings,
 * FR-VOX-09), then the main content, with immediate repeats removed.
 */
export function collectReadingQueue(): Block[] {
  const alerts = scan(document.body).filter((block) => block.alert);
  const rank = (block: Block) => (block.alert === "critical" ? 0 : 1);
  alerts.sort((a, b) => rank(a) - rank(b));

  const inAlerts = new Set(alerts.map((block) => block.el));
  const content = scan(primaryRegion()).filter((block) => !inAlerts.has(block.el));

  const queue: Block[] = [];
  for (const block of [...alerts, ...content]) {
    if (queue[queue.length - 1]?.text !== block.text) queue.push(block);
  }
  return queue;
}
