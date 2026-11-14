export type SiteState = "checking" | "allowed" | "blocked";

/** Only the SAFINUM test environment is supported (the popup shows its controls disabled elsewhere). */
export function siteStateForUrl(url: string | undefined): "allowed" | "blocked" {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && parsed.hostname === "safinum.cm" && parsed.pathname.startsWith("/hackathon-test")
      ? "allowed"
      : "blocked";
  } catch {
    return "blocked";
  }
}

/**
 * The active tab's state. `activeTab` makes its URL readable once the user opens the popup, so no
 * extra permission is needed. Without the tabs API (the dev harness) the page is treated as allowed;
 * adding `?site=blocked` to the dev URL previews the other state.
 */
export async function checkSite(): Promise<"allowed" | "blocked"> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return new URLSearchParams(location.search).get("site") === "blocked" ? "blocked" : "allowed";
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return siteStateForUrl(tab?.url);
  } catch {
    return "blocked";
  }
}
