// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchCommand,
  globalCommandFor,
  installPageShortcuts,
  onCommand,
  panelCommandFor,
  resetCommands,
} from "../src/content/shortcuts";
import { COMMANDS, GLOBAL_KEYS } from "../src/shared/commands";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

beforeEach(() => resetCommands());

describe("which keys are shortcuts", () => {
  it("maps Alt + L / R / P / O to the four global commands", () => {
    expect(globalCommandFor(key({ key: "l", code: "KeyL", altKey: true }))).toBe("toggle-panel");
    expect(globalCommandFor(key({ key: "r", code: "KeyR", altKey: true }))).toBe("toggle-pointer-reading");
    expect(globalCommandFor(key({ key: "p", code: "KeyP", altKey: true }))).toBe("toggle-read-all");
    expect(globalCommandFor(key({ key: "o", code: "KeyO", altKey: true }))).toBe("original-language");
    expect(globalCommandFor(key({ key: "L", code: "KeyL", altKey: true }))).toBe("toggle-panel"); // Caps Lock
  });

  it("maps Alt + Shift + L / S to the in-bar commands, and keeps the two sets apart", () => {
    expect(panelCommandFor(key({ key: "L", code: "KeyL", altKey: true, shiftKey: true }))).toBe("next-language");
    expect(panelCommandFor(key({ key: "S", code: "KeyS", altKey: true, shiftKey: true }))).toBe("next-speed");
    expect(globalCommandFor(key({ key: "L", code: "KeyL", altKey: true, shiftKey: true }))).toBeNull();
    expect(panelCommandFor(key({ key: "l", code: "KeyL", altKey: true }))).toBeNull();
  });

  it("falls back to the physical key when Alt changes the character (Mac)", () => {
    expect(globalCommandFor(key({ key: "¬", code: "KeyL", altKey: true }))).toBe("toggle-panel");
  });

  it("ignores plain letters, Ctrl/Cmd combinations, AltGr and a held-down key", () => {
    expect(globalCommandFor(key({ key: "l", code: "KeyL" }))).toBeNull(); // typing
    expect(globalCommandFor(key({ key: "l", code: "KeyL", altKey: true, ctrlKey: true }))).toBeNull(); // AltGr on Windows
    expect(globalCommandFor(key({ key: "l", code: "KeyL", altKey: true, metaKey: true }))).toBeNull();
    expect(globalCommandFor(key({ key: "l", code: "KeyL", altKey: true, modifierAltGraph: true }))).toBeNull();
    expect(globalCommandFor(key({ key: "l", code: "KeyL", altKey: true, repeat: true }))).toBeNull();
    expect(globalCommandFor(key({ key: "x", code: "KeyX", altKey: true }))).toBeNull();
  });
});

describe("the page key listener", () => {
  let remove: () => void;
  beforeEach(() => {
    remove = installPageShortcuts();
  });
  afterEach(() => remove());

  it("delivers a shortcut to the bar and keeps the page from also acting on it", () => {
    const got: string[] = [];
    onCommand((command) => got.push(command));
    const event = key({ key: "p", code: "KeyP", altKey: true });
    document.body.dispatchEvent(event);
    expect(got).toEqual(["toggle-read-all"]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves every other key completely alone", () => {
    const got: string[] = [];
    onCommand((command) => got.push(command));
    for (const init of [{ key: "p", code: "KeyP" }, { key: "Tab" }, { key: " " }, { key: "Enter" }, { key: "x", code: "KeyX", altKey: true }]) {
      const event = key(init);
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(got).toEqual([]);
  });

  it("stops listening when LexisFlow is removed", () => {
    const got: string[] = [];
    onCommand((command) => got.push(command));
    remove();
    const event = key({ key: "l", code: "KeyL", altKey: true });
    document.body.dispatchEvent(event);
    expect(got).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("delivery", () => {
  it("runs one press once, even if Chrome's shortcut and the page listener both report it", () => {
    const got: string[] = [];
    onCommand((command) => got.push(command));
    dispatchCommand("toggle-panel");
    dispatchCommand("toggle-panel");
    expect(got).toEqual(["toggle-panel"]);
  });

  it("accepts the same shortcut again after a moment, and different shortcuts at once", () => {
    const got: string[] = [];
    onCommand((command) => got.push(command));
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    dispatchCommand("toggle-panel");
    dispatchCommand("original-language");
    now.mockReturnValue(1400);
    dispatchCommand("toggle-panel");
    now.mockRestore();
    expect(got).toEqual(["toggle-panel", "original-language", "toggle-panel"]);
  });

  it("holds a command that arrives before the bar exists and hands it over when it mounts", () => {
    dispatchCommand("toggle-panel"); // Alt+L while LexisFlow was switched off
    const got: string[] = [];
    onCommand((command) => got.push(command));
    expect(got).toEqual(["toggle-panel"]);
  });
});

describe("manifest and service worker", () => {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(join(root, "public/manifest.json"), "utf-8")) as {
    commands: Record<string, { suggested_key: { default: string }; description: string }>;
    permissions: string[];
  };

  it("declares the four shortcuts with the same names and keys the code uses", () => {
    expect(Object.keys(manifest.commands).sort()).toEqual([...COMMANDS].sort());
    for (const [letter, command] of Object.entries(GLOBAL_KEYS)) {
      expect(manifest.commands[command].suggested_key.default).toBe(`Alt+${letter.toUpperCase()}`);
      expect(manifest.commands[command].description.length).toBeGreaterThan(10);
    }
  });

  it("stays within Chrome's limit of four suggested shortcuts and needs no new permission", () => {
    expect(Object.keys(manifest.commands).length).toBeLessThanOrEqual(4);
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "storage"]);
  });

  it("has the service worker pass each shortcut to the tab it was pressed in", () => {
    const worker = readFileSync(join(root, "src/background/background.ts"), "utf-8");
    expect(worker).toMatch(/chrome\.commands\?\.onCommand\.addListener/);
    expect(worker).toMatch(/chrome\.tabs\.sendMessage\(tab\.id, message\)/);
  });

  it("only accepts shortcut messages from this extension itself", () => {
    const content = readFileSync(join(root, "src/content/shortcuts.ts"), "utf-8");
    expect(content).toMatch(/sender\.id !== chrome\.runtime\.id/);
  });
});
