// TextHighlightEngine (SRS 3.6). Outline and box-shadow do not take part in layout, so the
// highlighted element and everything around it keep their exact size and position.

const OUTLINE = "2px solid #F59E0B";
const GLOW = "0 0 12px rgba(245, 158, 11, 0.5)";

export class TextHighlightEngine {
  private active: HTMLElement | null = null;
  private restoreStyles: (() => void) | null = null;

  /** Highlights one element, removing any previous highlight first (FR-HLT-05). */
  highlightElement(el: Element): void {
    if (el === this.active) return;
    this.removeHighlight();
    if (!(el instanceof HTMLElement) || !el.isConnected) return;

    const style = el.style;
    const original = {
      outline: style.outline,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      transition: style.transition,
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    style.transition = reducedMotion ? "none" : "outline-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out";
    style.outline = OUTLINE;
    style.outlineOffset = "2px";
    style.boxShadow = GLOW;

    this.active = el;
    this.restoreStyles = () => {
      // Exact restore, including empty strings (FR-HLT-03).
      style.outline = original.outline;
      style.outlineOffset = original.outlineOffset;
      style.boxShadow = original.boxShadow;
      style.transition = original.transition;
      if (el.getAttribute("style") === "") el.removeAttribute("style");
    };

    const rect = el.getBoundingClientRect();
    const offScreen = rect.bottom < 0 || rect.top > window.innerHeight;
    if (offScreen) el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
  }

  removeHighlight(): void {
    this.restoreStyles?.();
    this.restoreStyles = null;
    this.active = null;
  }
}
