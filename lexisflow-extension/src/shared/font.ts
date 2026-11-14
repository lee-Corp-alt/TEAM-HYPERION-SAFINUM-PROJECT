import manropeDataUrl from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline";

export const FONT_FAMILY = "LexisFlow Manrope";

/**
 * `@font-face` does not work inside a shadow root, and adding a stylesheet to the page
 * would modify the portal. The FontFace API registers the bundled font without adding
 * any DOM node, and a binary source is not a network fetch, so page CSP cannot block it.
 */
export function loadWidgetFont(): void {
  try {
    if ([...document.fonts].some((face) => face.family === FONT_FAMILY)) return;
    const base64 = manropeDataUrl.slice(manropeDataUrl.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const face = new FontFace(FONT_FAMILY, bytes.buffer, { weight: "200 800", style: "normal" });
    document.fonts.add(face);
    void face.load().catch(() => {});
  } catch {
    // The stylesheet falls back to system fonts.
  }
}
