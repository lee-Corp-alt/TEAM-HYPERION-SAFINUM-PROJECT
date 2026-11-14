// Page reading by pointer. When the user presses Play, moving the pointer over the page's text (the
// translated text when the page is translated) draws an amber box around the block under it, and
// resting there for a moment reads that block aloud with the local voice. Only the block under the
// pointer is ever boxed. A touch screen has no hover, so there a tap on text does the same at once:
// it boxes the block and reads it. Taps on buttons, links and fields keep doing what the page says and
// are not read; scrolling, dragging and long presses are ignored.
//
//  - The box lives in LexisFlow's shadow root, as a fixed-position element placed from the block's
//    bounding rectangle. The portal's own elements, styles and layout are never touched.
//  - Nothing is attached to the page while the mode is off, and turning it off (or `destroy()`)
//    removes the box and every listener.
//  - Accessibility (WCAG 2.2): the box is decorative (aria-hidden) and never takes pointer events, so
//    it cannot block or change what the user can click (1.4.13 hoverable/persistent); Escape
//    dismisses the emphasis and stops the speech without preventing the page's own Escape handling
//    (1.4.13 dismissible); the box has a dark halo so it keeps 3:1 contrast on light and dark
//    backgrounds (1.4.11); there is no animation (2.3.3); forced-colors mode is supported. Reading
//    starts only after the pointer rests (a dwell), so moving across the page never produces speech.

import { HOST_ID, INTERACTIVE, scan, type Block } from "./scanner";

/** What the hover reader needs from the playback controller (`Reader` satisfies it). */
export interface HoverSpeaker {
  readBlocks(blocks: Block[]): void;
  stopReading(): void;
}

/** How long the pointer must rest on a block before it is read. */
export const HOVER_DWELL_MS = 300;
/** Space between the text and the box, so it never covers glyph edges. */
const PAD = 4;
/** The page is rescanned this long after it stops changing. */
const RESCAN_MS = 150;
/** A touch counts as a tap when the finger moves no more than this many pixels... */
const TAP_MAX_MOVE = 10;
/** ...and is lifted within this long (a longer press is not a tap). */
const TAP_MAX_MS = 600;

export class HoverReader {
  private active = false;
  private hot: HTMLDivElement;
  private blocks = new Map<Element, Block>();
  private current: Block | null = null;
  /** The block last read, so resting on the same text does not repeat it. */
  private spokenFor: Element | null = null;
  /** Dismissed with Escape: no emphasis (and no reading) until the pointer moves to a different block. */
  private dismissed: Element | null = null;
  private dwellTimer = 0;
  private frame = 0;
  private rescanTimer = 0;
  private pendingTarget: Element | null = null;
  private touchStart: { x: number; y: number; at: number } | null = null;
  private observer: MutationObserver | null = null;

  constructor(
    /** An element inside the shadow root; the box is added to it and removed again on destroy. */
    layer: HTMLElement,
    private speaker: HoverSpeaker,
    private dwellMs = HOVER_DWELL_MS,
  ) {
    this.hot = layer.ownerDocument.createElement("div");
    this.hot.className = "hover-box";
    this.hot.hidden = true;
    this.hot.setAttribute("aria-hidden", "true");
    layer.appendChild(this.hot);
  }

  /** Starts (true) or stops (false) the mode. Stopping removes the box and every listener. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.attach();
    else this.detach();
  }

  destroy(): void {
    this.setActive(false);
    this.hot.remove();
  }

  // ---- lifecycle ----
  private attach(): void {
    document.addEventListener("pointermove", this.onPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerdown", this.onPointerDown, { capture: true, passive: true });
    document.addEventListener("pointerup", this.onPointerUp, { capture: true, passive: true });
    document.addEventListener("keydown", this.onKeyDown, true);
    document.documentElement.addEventListener("pointerleave", this.clearHot);
    window.addEventListener("scroll", this.onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", this.onViewportChange, { passive: true });
    // The page changes under us (translation, steps of the journey): follow it.
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.id === HOST_ID))) {
        this.scheduleRescan();
      }
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "class"],
    });
    this.rescan();
  }

  private detach(): void {
    document.removeEventListener("pointermove", this.onPointerMove, true);
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("pointerup", this.onPointerUp, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    document.documentElement.removeEventListener("pointerleave", this.clearHot);
    window.removeEventListener("scroll", this.onViewportChange, true);
    window.removeEventListener("resize", this.onViewportChange);
    this.observer?.disconnect();
    this.observer = null;
    window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.rescanTimer);
    this.frame = 0;
    this.rescanTimer = 0;
    this.pendingTarget = null;
    this.touchStart = null;
    this.clearHot();
    this.blocks.clear();
    this.spokenFor = null;
    this.dismissed = null;
  }

  // ---- what is on the page ----
  private scheduleRescan(): void {
    window.clearTimeout(this.rescanTimer);
    this.rescanTimer = window.setTimeout(() => this.rescan(), RESCAN_MS);
  }

  private rescan(): void {
    this.rescanTimer = 0;
    if (!this.active || !document.body) return;
    this.blocks = new Map(scan(document.body).map((block) => [block.el, block]));
    if (this.current && !this.blocks.has(this.current.el)) this.clearHot();
    else this.placeHot();
  }

  /** The block under the pointer: the nearest element at or above the target that holds text. */
  private blockAt(target: Element | null): Block | null {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      const block = this.blocks.get(el);
      if (block) return block;
    }
    return null;
  }

  // ---- pointer tracking ----
  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return; // no hover on touch screens (a tap is handled on pointerup)
    this.pendingTarget = this.targetOf(event);
    // One update per frame, however fast the pointer moves.
    if (!this.frame) this.frame = window.requestAnimationFrame(this.flush);
  };

  /**
   * What the pointer is on, or null for LexisFlow's own widget (dock, reading card, anything in its
   * shadow root), which is never boxed or read.
   */
  private targetOf(event: PointerEvent): Element | null {
    const path = event.composedPath();
    const own = path.some((node) => node instanceof Element && node.id === HOST_ID);
    const target = path[0] instanceof Element ? path[0] : event.target;
    return own || !(target instanceof Element) || this.isOwn(target) ? null : target;
  }

  // ---- touch: a tap reads, there being no hover ----
  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    this.touchStart = { x: event.clientX, y: event.clientY, at: performance.now() };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    const start = this.touchStart;
    this.touchStart = null;
    // A scroll never gets here (the browser cancels the pointer); a drag or a long press is not a tap.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MAX_MOVE) return;
    if (performance.now() - start.at > TAP_MAX_MS) return;

    const target = this.targetOf(event);
    if (!target) return; // LexisFlow's own controls: leave everything as it is
    const block = this.blockAt(target);
    if (!block) return this.clearHot(); // empty space: drop the box, let any speech finish
    if (block.el.closest(INTERACTIVE)) return; // a control does its job; it is not read on top of that

    this.dismissed = null;
    this.cancelDwell();
    this.current = block;
    this.placeHot();
    // Read the text as it is now, at once (the finger already chose it), and again if tapped again.
    const fresh = scan(block.el).find((candidate) => candidate.el === block.el);
    if (!fresh) return;
    this.spokenFor = block.el;
    this.speaker.readBlocks([fresh]);
  };

  /** True for the widget's host and for anything inside it, even inside its shadow root. */
  private isOwn(el: Element): boolean {
    for (let node: Node | null = el; node; ) {
      if (node instanceof Element && node.id === HOST_ID) return true;
      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }
    return false;
  }

  private flush = (): void => {
    this.frame = 0;
    this.update(this.pendingTarget);
  };

  private update(target: Element | null): void {
    const block = this.blockAt(target);
    if (!block) return this.clearHot();

    if (this.dismissed) {
      if (block.el === this.dismissed) return;
      this.dismissed = null;
    }
    if (block.el !== this.current?.el) {
      this.current = block;
      this.cancelDwell();
      if (block.el !== this.spokenFor) {
        this.dwellTimer = window.setTimeout(this.readNow, this.dwellMs);
      }
    }
    this.placeHot();
  }

  // ---- reading ----
  private readNow = (): void => {
    this.dwellTimer = 0;
    const block = this.current;
    if (!this.active || !block?.el.isConnected) return;
    // Read the text as it is now: the page (or the translator) may have rewritten it while the pointer rested.
    const fresh = scan(block.el).find((candidate) => candidate.el === block.el);
    if (!fresh) return;
    this.spokenFor = block.el;
    this.speaker.readBlocks([fresh]);
  };

  private cancelDwell(): void {
    window.clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
  }

  // ---- the boxes ----
  private static rectOf(el: Element, pad: number): { x: number; y: number; w: number; h: number } | null {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      x: Math.round(rect.left - pad),
      y: Math.round(rect.top - pad),
      w: Math.round(rect.width + pad * 2),
      h: Math.round(rect.height + pad * 2),
    };
  }

  private static draw(box: HTMLDivElement, r: { x: number; y: number; w: number; h: number }): void {
    const style = box.style;
    style.transform = `translate(${r.x}px, ${r.y}px)`;
    style.width = `${r.w}px`;
    style.height = `${r.h}px`;
    box.hidden = false;
  }

  /** The box on the block under the pointer. */
  private placeHot(): void {
    const block = this.current;
    const r = block?.el.isConnected && block.el !== this.dismissed ? HoverReader.rectOf(block.el, PAD) : null;
    if (!r) return this.clearHot();
    HoverReader.draw(this.hot, r);
  }

  private clearHot = (): void => {
    this.cancelDwell();
    this.current = null;
    this.hot.hidden = true;
  };

  private onViewportChange = (): void => {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.placeHot();
    });
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.current) this.dismissed = this.current.el;
    this.clearHot();
    if (this.spokenFor) this.speaker.stopReading();
  };
}
