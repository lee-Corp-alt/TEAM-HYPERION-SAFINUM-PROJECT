import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TO_DARK, TO_LIGHT, relativeLuminance, toneFor } from "../src/content/backdrop-tone";

// Reads the real colours out of the stylesheet and composites the glass layers over many page colours,
// so the "text stays at 4.5:1 or better on dark and light pages" claim is checked, not assumed.

const css = readFileSync(new URL("../src/styles/injected.css", import.meta.url), "utf-8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--g-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

type Rgba = [number, number, number, number];
function colour(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) throw new Error(`cannot read colour ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

type Rgb = [number, number, number];
const over = (top: Rgba, below: Rgb): Rgb => [0, 1, 2].map((i) => top[3] * top[i] + (1 - top[3]) * below[i]) as Rgb;
const lum = (c: Rgb) => relativeLuminance(c[0], c[1], c[2]);
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const dark = tokens('.lexis-dock[data-tone="dark"]');
const light = { ...dark, ...tokens('.lexis-dock[data-tone="light"]') };

// Page colours to put behind the widget: every grey, plus saturated colours, which are the worst cases
// for brightness.
const pages: Rgb[] = [
  ...Array.from({ length: 52 }, (_, i) => [i * 5, i * 5, i * 5] as Rgb),
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [255, 255, 255],
  [10, 14, 20], [15, 23, 42], [30, 41, 59], [51, 65, 85], [100, 116, 139], [226, 232, 240],
];

function surfaces(theme: Record<string, string>, page: Rgb) {
  const shell = over(colour(theme["--g-tint"]), over(colour(theme["--g-fill"]), page));
  const control = over(colour(theme["--g-control"]), shell);
  return { shell, control };
}

describe("frosted glass contrast", () => {
  it("uses the specified glass values", () => {
    expect(dark["--g-fill"]).toBe("rgba(255, 255, 255, 0.18)");
    expect(dark["--g-rim"]).toBe("rgba(255, 255, 255, 0.35)");
    expect(dark["--g-control"]).toBe("rgba(255, 255, 255, 0.25)");
    expect(dark["--g-control-rim"]).toBe("rgba(255, 255, 255, 0.3)");
    expect(css).toMatch(/backdrop-filter:\s*blur\(16px\) saturate\(160%\)/);
    expect(css).toMatch(/-webkit-backdrop-filter:\s*blur\(16px\) saturate\(160%\)/);
    expect(css).toMatch(/box-shadow:\s*0 8px 32px rgba\(0, 0, 0, 0\.25\)/);
  });

  it("keeps white text at 4.5:1 or better on every dark-toned page", () => {
    const text = colour(dark["--g-text"]).slice(0, 3) as Rgb;
    const accent = colour(dark["--g-accent"]).slice(0, 3) as Rgb;
    const active = colour(dark["--g-active"]).slice(0, 3) as Rgb;
    let checked = 0;
    for (const page of pages) {
      if (lum(page) > TO_LIGHT) continue; // a lighter page switches to the dark-text tone
      const { shell, control } = surfaces(dark, page);
      for (const surface of [shell, control]) {
        expect(contrast(text, surface), `text on page ${page}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(accent, shell), `accent on page ${page}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(active, shell), `green status on page ${page}`).toBeGreaterThanOrEqual(4.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("keeps dark slate text at 4.5:1 or better on every light-toned page", () => {
    const text = colour(light["--g-text"]).slice(0, 3) as Rgb;
    const accent = colour(light["--g-accent"]).slice(0, 3) as Rgb;
    const danger = colour(light["--g-danger"]).slice(0, 3) as Rgb;
    const active = colour(light["--g-active"]).slice(0, 3) as Rgb;
    let checked = 0;
    for (const page of pages) {
      if (lum(page) < TO_DARK) continue; // a darker page switches to the white-text tone
      const { shell, control } = surfaces(light, page);
      for (const surface of [shell, control]) {
        expect(contrast(text, surface), `text on page ${page}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(accent, shell), `accent on page ${page}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(danger, control), `danger on page ${page}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(active, shell), `green status on page ${page}`).toBeGreaterThanOrEqual(4.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });
});

describe("tone choice", () => {
  it("is dark on dark pages and light on light pages, and does not flicker at the edge", () => {
    expect(toneFor(relativeLuminance(10, 14, 20), "dark")).toBe("dark");
    expect(toneFor(relativeLuminance(255, 255, 255), "dark")).toBe("light");
    expect(toneFor(relativeLuminance(255, 255, 255), "light")).toBe("light");
    const between = (TO_DARK + TO_LIGHT) / 2;
    expect(toneFor(between, "dark")).toBe("dark");
    expect(toneFor(between, "light")).toBe("light");
  });
});

describe("popup glass", () => {
  const popupCss = readFileSync(new URL("../src/popup/popup.css", import.meta.url), "utf-8");
  const variable = (name: string) => {
    const match = popupCss.match(new RegExp(`${name}:\s*([^;]+);`));
    expect(match, name).not.toBeNull();
    return (match as RegExpMatchArray)[1].trim();
  };
  const theme = {
    "--g-fill": variable("--g-fill"),
    "--g-tint": variable("--g-tint"),
    "--g-control": variable("--g-control"),
  };
  const backdrops = [variable("--backdrop")].map((c) => colour(c).slice(0, 3) as Rgb);

  it("uses the same glass values as the widget", () => {
    expect(variable("--g-fill")).toBe(dark["--g-fill"]);
    expect(variable("--g-tint")).toBe(dark["--g-tint"]);
    expect(variable("--g-rim")).toBe(dark["--g-rim"]);
    expect(variable("--g-control")).toBe(dark["--g-control"]);
    expect(variable("--g-control-rim")).toBe(dark["--g-control-rim"]);
    expect(popupCss).toMatch(/backdrop-filter:\s*blur\(16px\) saturate\(160%\)/);
  });

  it("keeps white text at 4.5:1 or better on the glass and on the backdrop", () => {
    const text = colour(variable("--text")).slice(0, 3) as Rgb;
    const textOnBackdrop = colour(variable("--text-2")).slice(0, 3) as Rgb;
    for (const backdrop of backdrops) {
      expect(lum(backdrop), "backdrop must stay in the dark tone").toBeLessThanOrEqual(TO_LIGHT);
      const { shell, control } = surfaces(theme, backdrop);
      expect(contrast(text, shell)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, control)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(textOnBackdrop, backdrop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
