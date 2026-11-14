// Keyboard shortcuts, content-script side.
//
// A shortcut can arrive two ways, and both end in `dispatchCommand`:
//  1. Chrome's own extension shortcut (manifest.json "commands"): the service worker hears it and sends
//     the tab a message. Chrome swallows the key, so the page never sees it.
//  2. A key listener on the page, for when Chrome did not bind the shortcut (another extension already
//     owns it) and for the dev harness, which has no service worker.
// If both ever fire for one press, the second is dropped.
//
// Only Alt + L / R / P / O are taken from the page, and only while LexisFlow is on. AltGr (which
// browsers report as Ctrl + Alt and which types characters on French keyboards) is never matched.

import {
  COMMAND_MESSAGE,
  GLOBAL_KEYS,
  PANEL_KEYS,
  isCommand,
  type Command,
  type CommandMessage,
  type PanelCommand,
} from "../shared/commands";

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat"> & {
  getModifierState?: (key: string) => boolean;
};

/** The letter of a key press: what the layout types, else the physical key (Alt changes `key` on a Mac). */
function letterOf(event: KeyLike): string | null {
  if (event.key?.length === 1 && /[a-z]/i.test(event.key)) return event.key.toLowerCase();
  return /^Key([A-Z])$/.exec(event.code ?? "")?.[1].toLowerCase() ?? null;
}

const altOnly = (event: KeyLike): boolean =>
  event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat && !event.getModifierState?.("AltGraph");

/** The global command for Alt + letter, or null. */
export function globalCommandFor(event: KeyLike): Command | null {
  if (!altOnly(event) || event.shiftKey) return null;
  const letter = letterOf(event);
  return letter ? (GLOBAL_KEYS[letter] ?? null) : null;
}

/** The in-bar command for Alt + Shift + letter, or null. */
export function panelCommandFor(event: KeyLike): PanelCommand | null {
  if (!altOnly(event) || !event.shiftKey) return null;
  const letter = letterOf(event);
  return letter ? (PANEL_KEYS[letter] ?? null) : null;
}

/** Like `panelCommandFor`, and keeps the browser from also acting on the key when it matches. */
export function takePanelCommand(event: KeyboardEvent): PanelCommand | null {
  const command = panelCommandFor(event);
  if (command) event.preventDefault();
  return command;
}

// ---- delivery to the bar ----
type Listener = (command: Command) => void;
let listener: Listener | null = null;
/** A command that arrived while the bar was not mounted yet (Alt+L turning LexisFlow back on). */
let pending: Command | null = null;
let last: { command: Command; at: number } | null = null;
const SAME_PRESS_MS = 250;

export function dispatchCommand(command: Command): void {
  const now = performance.now();
  if (last && last.command === command && now - last.at < SAME_PRESS_MS) return;
  last = { command, at: now };
  if (listener) listener(command);
  else pending = command;
}

/** The bar subscribes here. A command that was waiting for it is delivered at once. */
export function onCommand(next: Listener): () => void {
  listener = next;
  if (pending) {
    const command = pending;
    pending = null;
    next(command);
  }
  return () => {
    if (listener === next) listener = null;
  };
}

/** For tests. */
export function resetCommands(): void {
  listener = null;
  pending = null;
  last = null;
}

/** Listens for Alt + L / R / P / O on the page while LexisFlow is on. Returns a function that stops. */
export function installPageShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const command = globalCommandFor(event);
    if (!command) return;
    event.preventDefault(); // e.g. a page access key on the same letter
    dispatchCommand(command);
  };
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    pending = null;
  };
}

/** Receives the shortcuts Chrome itself caught (sent by this extension's service worker only). */
export function listenForExtensionCommands(handle: Listener): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message: CommandMessage, sender) => {
    if (sender.id !== chrome.runtime.id || message?.type !== COMMAND_MESSAGE || !isCommand(message.command)) return;
    handle(message.command);
  });
}
