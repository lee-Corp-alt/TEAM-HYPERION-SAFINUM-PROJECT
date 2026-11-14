// Brightness of the page behind the widget. The frosted-glass widget shows white text over a dark
// page and dark slate text over a light one; this decides which, so text stays readable (WCAG 1.4.3,
// 4.5:1) wherever the widget floats. It only reads the page (computed styles and positions).

import { HOST_ID } from "./scanner";

export type Tone = "dark" | "light";

/**
 * Switch points, as relative luminance of the page behind the widget (0 black … 1 white). They are
 * set so that BOTH text colours keep 4.5:1 on the glass up to and beyond these points; see
 * tests/glass-contrast.test.ts, which checks it. The gap between them stops flicker near the edge.
 */
export const TO_LIGHT = 0.035;
export const TO_DARK = 0.025;

export function toneFor(luminance: number, previous: Tone): Tone {
  if (previous === "dark") return luminance > TO_LIGHT ? "light" : "dark";
  return luminance < TO_DARK ? "dark" : "light";
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour (channels 0–255). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

type Rgba = [number, number, number, number];

const colourCache = new Map<string, Rgba>();
let canvas: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (rgb, hex, oklch, color-mix…) as 0–255 channels and 0–1 alpha. */
function parseColour(value: string): Rgba | null {
  const cached = colourCache.get(value);
  if (cached) return cached;
  let result: Rgba | null = null;
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    result = [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
  } else {
    // Other colour spaces: let the browser convert one pixel.
    if (canvas === undefined) canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (canvas) {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = "#000";
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      result = [r, g, b, a / 255];
    }
  }
  if (result) colourCache.set(value, result);
  return result;
}

/** Luminance of what is painted at a point of the page, or null when it cannot be told (photo, gradient). */
function luminanceAt(x: number, y: number): number | null {
  let transmit = 1;
  let r = 0;
  let g = 0;
  let b = 0;
  const stack = document.elementsFromPoint(x, y).filter((el) => el.id !== HOST_ID);
  for (const el of stack.slice(0, 24)) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const media = el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement;
    const colour = parseColour(style.backgroundColor);
    if (colour && colour[3] > 0) {
      const weight = transmit * colour[3];
      r += weight * colour[0];
      g += weight * colour[1];
      b += weight * colour[2];
      transmit *= 1 - colour[3];
    }
    if ((media || style.backgroundImage !== "none") && transmit > 0.5) return null;
    if (transmit < 0.02) break;
  }
  // Whatever is still see-through shows the browser's white canvas.
  r += transmit * 255;
  g += transmit * 255;
  b += transmit * 255;
  return relativeLuminance(r, g, b);
}

/** Mean luminance behind a rectangle, from a few points across it; null when nothing could be read. */
export function luminanceBehind(rect: DOMRect): number | null {
  const y = rect.top + rect.height / 2;
  const points = [0.15, 0.35, 0.5, 0.65, 0.85].map((f) => [rect.left + rect.width * f, y] as const);
  const readings: number[] = [];
  for (const [x, py] of points) {
    if (x < 0 || py < 0 || x >= window.innerWidth || py >= window.innerHeight) continue;
    const value = luminanceAt(x, py);
    if (value !== null) readings.push(value);
  }
  return readings.length === 0 ? null : readings.reduce((sum, v) => sum + v, 0) / readings.length;
}

/**
 * Keeps `onTone` informed while the widget floats over the page: on scroll, resize and page changes.
 * `rect` returns where the widget is now. Returns a function that stops watching.
 */
export function watchBackdropTone(rect: () => DOMRect | null, onTone: (tone: Tone) => void): () => void {
  let tone: Tone = "dark";
  let frame = 0;
  let timer = 0;

  const sample = () => {
    frame = 0;
    const box = rect();
    if (!box || box.width === 0) return;
    const luminance = luminanceBehind(box);
    if (luminance === null) return; // photo or gradient behind: keep what we had
    const next = toneFor(luminance, tone);
    if (next !== tone) {
      tone = next;
      onTone(tone);
    }
  };
  const soon = () => {
    if (!frame) frame = window.requestAnimationFrame(sample);
  };
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(soon, 300);
  };

  const observer = new MutationObserver(later);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  window.addEventListener("scroll", soon, { capture: true, passive: true });
  window.addEventListener("resize", soon, { passive: true });
  soon();

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", soon, true);
    window.removeEventListener("resize", soon);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}
