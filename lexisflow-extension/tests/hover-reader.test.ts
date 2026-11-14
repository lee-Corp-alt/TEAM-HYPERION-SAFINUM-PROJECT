// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverReader, type HoverSpeaker } from "../src/content/hover-reader";
import { HOST_ID, type Block } from "../src/content/scanner";

const PAGE = `
  <main>
    <p id="a">Solde disponible</p>
    <p id="b">250 000 FCFA</p>
    <p id="c">Frais <b id="c2">375 FCFA</b></p>
    <button id="btn">Valider le transfert</button>
    <input id="name" value="Jean-Paul Mbarga">
    <input id="pwd" type="password" value="secret">
    <input id="pin" data-sensitive value="1234">
    <div id="${HOST_ID}"><p id="own">Solde disponible</p></div>
  </main>`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const el = (id: string) => document.getElementById(id) as HTMLElement;

/** jsdom has no layout: give elements a rectangle and visibility so there is something to box. */
function layout(): void {
  for (const node of document.querySelectorAll("body, main, main *")) {
    (node as HTMLElement).getBoundingClientRect = () => new DOMRect(20, 40, 200, 24);
    (node as HTMLElement).checkVisibility = () => true;
  }
}

function hover(target: Element): void {
  const event = new Event("pointermove", { bubbles: true }) as PointerEvent;
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

class Speaker implements HoverSpeaker {
  read: string[][] = [];
  stops = 0;
  readBlocks(blocks: Block[]): void {
    this.read.push(blocks.map((block) => block.text));
  }
  stopReading(): void {
    this.stops++;
  }
}

let layer: HTMLElement;
let speaker: Speaker;
let reader: HoverReader;
const hot = () => layer.querySelector(".hover-box") as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = PAGE;
  layout();
  layer = document.createElement("div");
  document.body.appendChild(layer);
  speaker = new Speaker();
  reader = new HoverReader(layer, speaker, 20);
});
afterEach(() => reader.destroy());

describe("Play: the box follows the pointer", () => {
  it("draws nothing while off", async () => {
    hover(el("a"));
    await wait(40);
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });

  it("boxes nothing until the pointer is on text, and only that one block", async () => {
    reader.setActive(true);
    await wait(40);
    expect(layer.querySelectorAll(".hover-box")).toHaveLength(1);
    expect(hot().hidden).toBe(true);
    hover(el("a"));
    await wait(40);
    expect(hot().hidden).toBe(false);
    expect(hot().getAttribute("aria-hidden")).toBe("true");
    expect(layer.querySelectorAll(".hover-box")).toHaveLength(1);
  });

  it("hides the box again when the pointer leaves the text", async () => {
    reader.setActive(true);
    hover(el("a"));
    await wait(40);
    hover(document.body);
    await wait(40);
    expect(hot().hidden).toBe(true);
  });

  it("follows text the page changes, such as a translation", async () => {
    reader.setActive(true);
    const added = Object.assign(document.createElement("p"), { id: "n", textContent: "New text" });
    document.querySelector("main")!.appendChild(added);
    layout();
    await wait(250);
    hover(added);
    await wait(80);
    expect(hot().hidden).toBe(false);
    expect(speaker.read).toEqual([["New text"]]);
  });
});

describe("hovering a box", () => {
  it("emphasises the block and reads it once the pointer rests, amount untouched", async () => {
    reader.setActive(true);
    hover(el("b"));
    await wait(80);
    expect(hot().hidden).toBe(false);
    expect(speaker.read).toEqual([["250 000 FCFA"]]);
  });

  it("reads the nearest block under the pointer, not its parent's text", async () => {
    reader.setActive(true);
    hover(el("c2"));
    await wait(80);
    expect(speaker.read).toEqual([["375 FCFA"]]);
  });

  it("reads buttons and typed values, never a password or sensitive field", async () => {
    reader.setActive(true);
    hover(el("btn"));
    await wait(80);
    hover(el("name"));
    await wait(80);
    hover(el("pwd"));
    await wait(80);
    hover(el("pin"));
    await wait(80);
    expect(speaker.read).toEqual([["Valider le transfert"], ["Jean-Paul Mbarga"]]);
  });

  it("does not read blocks the pointer only passes over", async () => {
    reader.setActive(true);
    hover(el("a"));
    await wait(5);
    hover(el("b"));
    await wait(80);
    expect(speaker.read).toEqual([["250 000 FCFA"]]);
  });

  it("does not repeat the same block while the pointer stays on it", async () => {
    reader.setActive(true);
    hover(el("a"));
    await wait(60);
    hover(el("a"));
    await wait(60);
    expect(speaker.read).toEqual([["Solde disponible"]]);
  });

  it("ignores the LexisFlow widget itself", async () => {
    reader.setActive(true);
    hover(document.querySelector(`#${HOST_ID} p`) as Element);
    await wait(60);
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });

  it("never boxes or reads text inside the widget's shadow root (dock, reading card)", async () => {
    reader.setActive(true);
    const widget = document.getElementById(HOST_ID) as HTMLElement;
    const shadow = widget.attachShadow({ mode: "open" });
    shadow.innerHTML = `<aside><strong id="dock">LexisFlow</strong><p id="card">250 000 FCFA</p></aside>`;
    for (const node of shadow.querySelectorAll("*")) {
      (node as HTMLElement).getBoundingClientRect = () => new DOMRect(20, 40, 200, 24);
      (node as HTMLElement).checkVisibility = () => true;
    }
    for (const id of ["dock", "card"]) {
      const event = new Event("pointermove", { bubbles: true, composed: true }) as PointerEvent;
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      shadow.getElementById(id)!.dispatchEvent(event);
      await wait(80);
      expect(hot().hidden).toBe(true);
    }
    expect(speaker.read).toEqual([]);
  });

  it("Escape drops the emphasis and stops the speech, without blocking the page's own handler", async () => {
    reader.setActive(true);
    hover(el("a"));
    await wait(60);
    let reachedPage = false;
    document.body.addEventListener("keydown", () => (reachedPage = true));
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(hot().hidden).toBe(true);
    expect(speaker.stops).toBe(1);
    expect(reachedPage).toBe(true);
    expect(escape.defaultPrevented).toBe(false);

    hover(el("a")); // stays dismissed until the pointer goes elsewhere
    await wait(60);
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toHaveLength(1);
  });
});

describe("pausing", () => {
  it("removes the box and every listener", async () => {
    reader.setActive(true);
    hover(el("a"));
    await wait(5);
    reader.setActive(false);
    expect(hot().hidden).toBe(true);
    hover(el("b"));
    await wait(60);
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });

  it("removes its box from the shadow layer on destroy", () => {
    reader.setActive(true);
    reader.destroy();
    expect(layer.querySelector(".hover-box")).toBeNull();
  });
});

describe("reading starts only after the pointer rests", () => {
  it("reads the block once the pointer has rested, and not before", async () => {
    const slow = new HoverReader(layer, speaker, 300);
    slow.setActive(true);
    hover(el("b"));
    await wait(160); // before the reading point (300 ms)
    expect(speaker.read).toEqual([]);
    await wait(250);
    expect(speaker.read).toEqual([["250 000 FCFA"]]);
    slow.destroy();
  });

  it("reads nothing for text the pointer only passes over", async () => {
    const slow = new HoverReader(layer, speaker, 300);
    slow.setActive(true);
    hover(el("a"));
    await wait(40);
    hover(el("b"));
    await wait(40);
    hover(el("c"));
    await wait(40);
    hover(document.body);
    await wait(40);
    expect(speaker.read).toEqual([]);
    slow.destroy();
  });

  it("reads nothing when the pointer leaves the text before it has rested", async () => {
    const slow = new HoverReader(layer, speaker, 300);
    slow.setActive(true);
    hover(el("a"));
    await wait(160);
    hover(document.body);
    await wait(400);
    expect(speaker.read).toEqual([]);
    slow.destroy();
  });
});

describe("touch screens: a tap reads, there being no hover", () => {
  function touch(type: "pointerdown" | "pointerup" | "pointermove", target: Element, x = 100, y = 100): void {
    const event = new Event(type, { bubbles: true, composed: true }) as PointerEvent;
    Object.defineProperties(event, { pointerType: { value: "touch" }, clientX: { value: x }, clientY: { value: y } });
    target.dispatchEvent(event);
  }
  const tap = (target: Element, x = 100, y = 100) => {
    touch("pointerdown", target, x, y);
    touch("pointerup", target, x, y);
  };

  it("boxes the tapped text and reads it at once, amount untouched", () => {
    reader.setActive(true);
    tap(el("b"));
    expect(hot().hidden).toBe(false);
    expect(speaker.read).toEqual([["250 000 FCFA"]]);
  });

  it("reads again when the same text is tapped again", () => {
    reader.setActive(true);
    tap(el("a"));
    tap(el("a"));
    expect(speaker.read).toEqual([["Solde disponible"], ["Solde disponible"]]);
  });

  it("does not read a button or a field it was tapped on: they do what the page says", () => {
    reader.setActive(true);
    tap(el("btn"));
    tap(el("name"));
    expect(speaker.read).toEqual([]);
  });

  it("ignores a drag and a long press", () => {
    reader.setActive(true);
    touch("pointerdown", el("a"), 100, 100);
    touch("pointerup", el("a"), 100, 160); // moved 60 px: a drag
    expect(speaker.read).toEqual([]);

    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(1000); // pointerdown
    touch("pointerdown", el("a"), 100, 100);
    now.mockReturnValueOnce(2000); // pointerup 1 s later: a long press
    touch("pointerup", el("a"), 100, 100);
    now.mockRestore();
    expect(speaker.read).toEqual([]);
  });

  it("does nothing on touch movement alone", () => {
    reader.setActive(true);
    touch("pointermove", el("a"));
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });

  it("tapping empty space drops the box but lets the speech finish", () => {
    reader.setActive(true);
    tap(el("a"));
    expect(hot().hidden).toBe(false);
    tap(document.body);
    expect(hot().hidden).toBe(true);
    expect(speaker.stops).toBe(0);
  });

  it("ignores taps on LexisFlow's own widget", () => {
    reader.setActive(true);
    tap(document.querySelector(`#${HOST_ID} p`) as Element);
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });

  it("Escape stops what a tap started", () => {
    reader.setActive(true);
    tap(el("a"));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(hot().hidden).toBe(true);
    expect(speaker.stops).toBe(1);
  });

  it("does nothing once Play is turned off", () => {
    reader.setActive(true);
    reader.setActive(false);
    tap(el("a"));
    expect(hot().hidden).toBe(true);
    expect(speaker.read).toEqual([]);
  });
});
