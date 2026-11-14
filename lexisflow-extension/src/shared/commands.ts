// LexisFlow's keyboard commands. Shared by the service worker (which receives the shortcuts declared in
// manifest.json) and the content script (which carries them out). No DOM access here.

/** Names match the "commands" keys in manifest.json. */
export const COMMANDS = ["toggle-panel", "toggle-pointer-reading", "toggle-read-all", "original-language"] as const;
export type Command = (typeof COMMANDS)[number];

/** Work only while keyboard focus is inside the LexisFlow bar. */
export type PanelCommand = "next-language" | "next-speed";

/** Message the service worker sends to the tab when a manifest shortcut is pressed. */
export const COMMAND_MESSAGE = "LEXIS_COMMAND";
export interface CommandMessage {
  type: typeof COMMAND_MESSAGE;
  command: Command;
}

export const isCommand = (value: unknown): value is Command =>
  typeof value === "string" && (COMMANDS as readonly string[]).includes(value);

/** Alt + letter, anywhere on the page. */
export const GLOBAL_KEYS: Readonly<Record<string, Command>> = {
  l: "toggle-panel",
  r: "toggle-pointer-reading",
  p: "toggle-read-all",
  o: "original-language",
};

/** Alt + Shift + letter, with focus inside the bar. */
export const PANEL_KEYS: Readonly<Record<string, PanelCommand>> = {
  l: "next-language",
  s: "next-speed",
};
