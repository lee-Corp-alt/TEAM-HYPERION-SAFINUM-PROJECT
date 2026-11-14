import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relativeLuminance } from "../src/content/backdrop-tone";

// Keyboard-only accessibility of the widget, checked from its source (no browser needed). The behaviour
// itself (real Tab, Shift+Tab, Enter, Space and Escape presses) is exercised in the dev harness.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf-8");
const css = read("src/styles/injected.css").replace(/\/\*[\s\S]*?\*\//g, ""); // without comments
const dock = read("src/components/LexisDock.tsx");
const card = read("src/components/ReadingCard.tsx");

/** The opening tag of the first <button> whose className is `cls` (arrows like "() =>" do not end it). */
const buttonTag = (cls: string) => dock.match(new RegExp(`<button(?:=>|[^>])*?className="${cls}"(?:=>|[^>])*>`))?.[0] ?? "";

/** The CSS rules whose selector list matches `test`, as [selector, body]. */
function rules(source: string, test: RegExp): [string, string][] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1].trim().replace(/\s+/g, " "), m[2]] as [string, string])
    .filter(([selector]) => test.test(selector));
}
const hex = (value: string): [number, number, number] => {
  const n = parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (value: string) => relativeLuminance(...hex(value));
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("1. native controls in a natural order", () => {
  it("makes every clickable thing a real <button> or <select>, never a div with a handler", () => {
    const elements = [...dock.matchAll(/<(\w+)[^<>]*?\bonClick=/g)].map((m) => m[1]);
    expect(elements.length).toBeGreaterThan(4);
    for (const tag of elements) expect(tag).toBe("button");
    expect(dock).toMatch(/<select/);
  });

  it("does not reorder focus: no positive tabindex and no focus trap", () => {
    expect(dock).not.toMatch(/tabIndex=\{?["']?[1-9]/);
    expect(dock + card).not.toMatch(/\.focus\(\)[\s\S]{0,200}addEventListener\(["']focusout/);
  });

  it("has the controls in reading order: Play, language, speed, close, expand, then the tools row", () => {
    const at = (needle: string) => dock.indexOf(needle);
    const order = ['className="play-button"', "<select", 'className="speed-button"', 'className="close-button"', 'className="collapse-button"', "tool-button"].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("2. visible focus rings", () => {
  const ring = rules(css, /^button:focus-visible, select:focus-visible$/)[0]?.[1] ?? "";

  it("draws a real outline (which high-contrast modes keep) on every button and select", () => {
    expect(ring).toMatch(/outline:\s*2px solid #38bdf8/i);
    expect(ring).toMatch(/outline-offset:\s*2px/);
    expect(ring).toMatch(/box-shadow:\s*0 0 0 2px #0f172a/);
  });

  it("only removes the outline for mouse focus, never for keyboard focus", () => {
    expect(rules(css, /:focus:not\(:focus-visible\)/).length).toBeGreaterThan(0);
    for (const [selector, body] of rules(css, /.*/)) {
      if (/outline:\s*none/.test(body)) expect(selector, "outline: none must only apply to non-keyboard focus").toMatch(/:focus:not\(:focus-visible\)/);
    }
  });

  it("does not let per-control rules replace the ring with a weaker one", () => {
    for (const [selector, body] of rules(css, /:focus-visible/)) {
      if (/^button:focus-visible, select:focus-visible$/.test(selector)) continue;
      if (/:not\(:focus-visible\)/.test(selector)) continue; // the mouse-focus rule
      expect(body, selector).not.toMatch(/outline:\s*none/);
      expect(body, selector).not.toMatch(/0 0 0 5px/); // the old shadow-only ring
    }
  });

  it("switches to the system highlight colour in forced-colors (high-contrast) mode", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*button:focus-visible,\s*select:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/);
  });

  it("keeps the indicator at 3:1 or better on light and dark glass", () => {
    expect(contrast("#38bdf8", "#0f172a")).toBeGreaterThanOrEqual(3); // sky outline next to the dark ring and on dark glass
    expect(contrast("#0f172a", "#ffffff")).toBeGreaterThanOrEqual(3); // dark ring on light glass
    expect(contrast("#0f172a", "#e2e8f0")).toBeGreaterThanOrEqual(3);
  });

  it("leaves room for the ring: the bar pads its controls by more than the 6 px it extends", () => {
    for (const [, body] of rules(css, /^\.widget-main$/)) {
      const pad = body.match(/padding:\s*(\d+)px/);
      if (pad) expect(Number(pad[1])).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("3. Enter, Space and Escape", () => {
  it("gets Enter and Space from native buttons, with no handler that cancels them", () => {
    expect(dock).not.toMatch(/key\s*===\s*["'](Enter|\s)["']/);
    expect(dock).not.toMatch(/preventDefault/);
  });

  it("handles Escape one step at a time: stop reading, then collapse (focus on the expand button), then close", () => {
    const handler = dock.slice(dock.indexOf("const escapeStep"), dock.indexOf("const latestEscape"));
    expect(handler).toMatch(/event\.key !== "Escape"/);
    const stop = handler.indexOf("reader.stopReading()");
    const collapse = handler.indexOf("setExpanded(false)");
    const close = handler.indexOf("enabledForSite: false");
    expect(stop).toBeGreaterThan(-1);
    expect(collapse).toBeGreaterThan(stop);
    expect(close).toBeGreaterThan(collapse);
    expect(handler).toMatch(/collapse-button"\)\?\.focus\(\)/);
  });

  it("works from anywhere: one window listener, not tied to focus being inside the bar", () => {
    expect(dock).toMatch(/window\.addEventListener\("keydown", handle\)/);
    expect(dock).not.toMatch(/if \(event\.key !== "Escape"\) return;\s*if \(pageReading/); // no leftover bar-only handler
  });

  it("is polite about it: listens after the page, stands down when the page handled the key, leaves typing alone", () => {
    const handler = dock.slice(dock.indexOf("const escapeStep"), dock.indexOf("const latestEscape"));
    expect(handler).toMatch(/event\.defaultPrevented/);
    expect(handler).toMatch(/event\.isComposing/);
    expect(handler).toMatch(/isContentEditable[\s\S]{0,120}input\|textarea\|select/);
    expect(handler).not.toMatch(/preventDefault|stopPropagation/); // never consumes the key
    expect(dock).not.toMatch(/addEventListener\("keydown", handle, (true|\{[^}]*capture)/); // bubbling, after the page
  });

  it("tells the user about it: the close button's tooltip and shortcut name both say Escape", () => {
    expect(dock).toMatch(/aria-keyshortcuts="Escape"/);
    expect(dock).toMatch(/title=\{`\$\{t\("closeHint"\)\} · Esc`\}/);
    expect(dock).toMatch(/<kbd>Esc<\/kbd>/);
  });
});

describe("4. names and live regions", () => {
  it("gives every icon-only button an aria-label", () => {
    for (const cls of ["play-button", "speed-button", "close-button", "collapse-button"]) {
      expect(buttonTag(cls), cls).toMatch(/aria-label=/);
    }
    expect(dock).toMatch(/<select(?:=>|[^>])*aria-label=/);
  });

  it("keeps one label per toggle and reports its state with aria-pressed / aria-expanded instead of swapping the label", () => {
    const play = buttonTag("play-button");
    expect(play).toMatch(/aria-pressed=\{pageReading\}/);
    expect(play).toMatch(/aria-label=\{t\("play"\)\}/);
    expect(play).not.toMatch(/pause/);
    expect(dock).toMatch(/aria-expanded=\{expanded\}/);
  });

  it("announces status through one permanent polite live region", () => {
    expect(dock).toMatch(/<div className="sr-only" role="status" aria-live="polite" aria-atomic="true">/);
    expect(dock).toMatch(/const announcement = state\.message/);
  });

  it("does not use the show/hide reading card as the live region", () => {
    expect(card).not.toMatch(/aria-live/);
    expect(card).toMatch(/aria-hidden=\{!visible\}/);
  });
});
