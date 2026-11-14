import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { LexisDock } from "../components/LexisDock";
import { loadWidgetFont } from "../shared/font";
import injectedStyles from "../styles/injected.css?inline";
import { HoverReader } from "./hover-reader";
import { PageTranslator } from "./page-translator";
import { Reader } from "./reader";
import { HOST_ID } from "./scanner";
import { installPageShortcuts } from "./shortcuts";

export { HOST_ID };

let root: Root | null = null;
let reader: Reader | null = null;
let translator: PageTranslator | null = null;
let hover: HoverReader | null = null;
let removeShortcuts: (() => void) | null = null;

/** Injects the single widget host. Idempotent (FR-WID-02). */
export function injectLexisFlowUI(): void {
  if (document.getElementById(HOST_ID)) return;

  // The host is the only node LexisFlow adds to the page (FR-WID-07).
  const host = document.createElement("div");
  host.id = HOST_ID;
  // `all: initial` shields the host from portal rules such as `div { ... }`.
  host.style.cssText =
    "all: initial; position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; pointer-events: none;";
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(injectedStyles);
    shadowRoot.adoptedStyleSheets = [sheet];
  } catch {
    // Fallback for browsers without constructable stylesheets (UC-01, 5a).
    const style = document.createElement("style");
    style.textContent = injectedStyles;
    shadowRoot.appendChild(style);
  }

  loadWidgetFont();

  // Layer for the hover-to-read box: inside the shadow root, so the portal never sees or styles it.
  // Added before the dock so the dock paints above it.
  const hoverLayer = document.createElement("div");
  hoverLayer.className = "hover-layer";
  hoverLayer.setAttribute("aria-hidden", "true");
  shadowRoot.appendChild(hoverLayer);

  const mount = document.createElement("div");
  mount.id = "lexisflow-app-root";
  shadowRoot.appendChild(mount);

  reader = new Reader();
  reader.start();
  hover = new HoverReader(hoverLayer, reader);
  if (import.meta.env.DEV) (window as unknown as { __lfReader: Reader }).__lfReader = reader;
  // Page translation tells the reader which language the page was written in, since its text no longer shows it.
  translator = new PageTranslator((language) => reader?.setPageLanguage(language));
  translator.start();
  if (import.meta.env.DEV) (window as unknown as { __lfTranslator: PageTranslator }).__lfTranslator = translator;

  removeShortcuts = installPageShortcuts();

  root = createRoot(mount);
  root.render(
    <ErrorBoundary>
      <LexisDock reader={reader} translator={translator} hover={hover} />
    </ErrorBoundary>,
  );
}

/** Removes the widget and everything it changed: speech, highlight, observers. */
export function removeLexisFlowUI(): void {
  // Put the page back exactly as the site wrote it before anything else is torn down.
  translator?.destroy();
  translator = null;
  removeShortcuts?.();
  removeShortcuts = null;
  hover?.destroy();
  hover = null;
  reader?.destroy();
  reader = null;
  root?.unmount();
  root = null;
  document.getElementById(HOST_ID)?.remove();
}
