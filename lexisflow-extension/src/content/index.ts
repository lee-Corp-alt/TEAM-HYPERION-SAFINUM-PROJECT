import { DEFAULT_PREFS, loadPrefs, savePrefs, watchPrefs } from "../shared/prefs";
import { HOST_ID, injectLexisFlowUI, removeLexisFlowUI } from "./shadow-root";
import { dispatchCommand, listenForExtensionCommands } from "./shortcuts";

// LexisFlow runs only inside the hackathon test environment. The site is a single-page
// app, so the script is matched on the whole origin and gated on the path here: the
// widget then appears and disappears as the user navigates without a page reload.
const ALLOWED_PATH = "/hackathon-test";

const onAllowedPage = (): boolean =>
  location.pathname === ALLOWED_PATH || location.pathname.startsWith(`${ALLOWED_PATH}/`);

// The popup's on/off switch. Until preferences are read, assume on.
let enabled = DEFAULT_PREFS.enabledForSite;

const shouldRun = (): boolean => enabled && onAllowedPage();

function sync(): void {
  try {
    if (shouldRun()) injectLexisFlowUI();
    // Turning it off removes the widget completely: speech, highlight, observers (FR-WID-11).
    else removeLexisFlowUI();
  } catch (error) {
    // Never let a LexisFlow failure reach the portal (NFR-REL-06).
    console.warn("[LexisFlow] injection failed", error);
  }
}

function start(): void {
  void loadPrefs().then((prefs) => {
    enabled = prefs.enabledForSite;
    sync();
  });
  watchPrefs((prefs) => {
    if (prefs.enabledForSite === enabled) return;
    enabled = prefs.enabledForSite;
    sync();
  });
  sync();

  // Shortcuts Chrome caught itself (manifest "commands"). While LexisFlow is switched off for the site,
  // only Alt+L does anything: it switches it back on and opens the panel, so a keyboard user is never
  // left needing the mouse to get it back.
  listenForExtensionCommands((command) => {
    if (!onAllowedPage()) return;
    if (!enabled) {
      if (command !== "toggle-panel") return;
      enabled = true;
      void loadPrefs().then((prefs) => savePrefs({ ...prefs, enabledForSite: true }));
      sync();
    }
    dispatchCommand(command);
  });

  // Re-inject if portal scripts remove the host (FR-WID-10). Watching only the direct
  // children of <body> keeps this cheap.
  new MutationObserver(() => {
    if (shouldRun() && !document.getElementById(HOST_ID)) sync();
  }).observe(document.body, { childList: true });

  // In-app navigation: content scripts cannot see the page's history.pushState calls,
  // so compare the URL on a slow timer plus the back/forward event.
  let lastPath = location.pathname;
  const checkPath = () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      sync();
    }
  };
  window.addEventListener("popstate", checkPath);
  window.setInterval(checkPath, 500);

  window.addEventListener("pagehide", () => removeLexisFlowUI());
}

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });
