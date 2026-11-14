import { describe, expect, it } from "vitest";
import { siteStateForUrl } from "../src/popup/site";

describe("siteStateForUrl", () => {
  it("allows only the SAFINUM test environment", () => {
    expect(siteStateForUrl("https://safinum.cm/hackathon-test")).toBe("allowed");
    expect(siteStateForUrl("https://safinum.cm/hackathon-test/guide")).toBe("allowed");
  });

  it("blocks everything else", () => {
    expect(siteStateForUrl("https://safinum.cm/")).toBe("blocked");
    expect(siteStateForUrl("https://safinum.cm/hackathon")).toBe("blocked");
    expect(siteStateForUrl("http://safinum.cm/hackathon-test")).toBe("blocked");
    expect(siteStateForUrl("https://evil.example/safinum.cm/hackathon-test")).toBe("blocked");
    expect(siteStateForUrl("https://safinum.cm.evil.example/hackathon-test")).toBe("blocked");
    expect(siteStateForUrl("https://www.safinum.cm/hackathon-test")).toBe("blocked");
    expect(siteStateForUrl("chrome://extensions")).toBe("blocked");
  });

  it("blocks when the URL is unreadable", () => {
    expect(siteStateForUrl(undefined)).toBe("blocked");
    expect(siteStateForUrl("")).toBe("blocked");
    expect(siteStateForUrl("not a url")).toBe("blocked");
  });
});
