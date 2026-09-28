/**
 * src/lib/shareUrl.test.ts - PRD-001 Phase 8 S1 (D149, doc 6.1).
 *
 * jsdom via JSDOM_FILES. 6 pins, headed by THE stale-copy bug-class
 * gate: with a write pending, copyShareUrl must run the registered
 * writer BEFORE reading location.href / calling writeText (the
 * flush-before-copy law, D149). Clipboard mocking follows the
 * shipped IdeaBar.test.tsx defineProperty pattern.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { copyShareUrl, shareStatusText } from "./shareUrl";
import { registerUrlWriter, scheduleUrlWrite } from "./urlSyncBus";
import { ideaFromChord } from "../../engine/core/idea";

function mockClipboard(writeText: (t: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function copiedText(writeText: { mock: { calls: string[][] } }): string {
  return writeText.mock.calls[0][0];
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("copyShareUrl - flush-before-copy (THE bug-class gate)", () => {
  it("a pending write runs BEFORE clipboard.writeText (call order)", async () => {
    const order: string[] = [];
    const unregister = registerUrlWriter(() => order.push("write"));
    const writeText = vi.fn(async () => {
      order.push("copy");
    });
    mockClipboard(writeText);
    scheduleUrlWrite(); // pending within the 200ms debounce window
    const status = await copyShareUrl();
    expect(status).toBe("copied");
    expect(order).toEqual(["write", "copy"]);
    unregister();
  });

  it("the copied URL is FRESH: the flushed writer's replaceState lands in it", async () => {
    const unregister = registerUrlWriter(() => {
      window.history.replaceState({}, "", "/?bpm=132");
    });
    const writeText = vi.fn(async () => {});
    mockClipboard(writeText);
    scheduleUrlWrite();
    await copyShareUrl();
    expect(copiedText(writeText)).toBe("http://localhost/?bpm=132");
    unregister();
  });
});

describe("copyShareUrl - the three shipped fallback states", () => {
  it("statuses map to the three VERBATIM strings (a shipped contract)", () => {
    expect(shareStatusText("copied")).toBe("Share link copied to clipboard.");
    expect(shareStatusText("unavailable")).toBe(
      "Share link ready (clipboard unavailable).",
    );
    expect(shareStatusText("blocked")).toBe(
      "Share link ready (clipboard blocked).",
    );
  });

  it("writeText throwing -> 'blocked'", async () => {
    mockClipboard(() => Promise.reject(new Error("NotAllowedError")));
    expect(await copyShareUrl()).toBe("blocked");
  });

  it("no clipboard API -> 'unavailable' (never throws)", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    expect(await copyShareUrl()).toBe("unavailable");
  });
});

describe("copyShareUrl - the idea param", () => {
  it("an explicit idea re-sets the param preserving every other key", async () => {
    window.history.replaceState({}, "", "/?mode=explore&transpose=2");
    const writeText = vi.fn(async () => {});
    mockClipboard(writeText);
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    await copyShareUrl(idea);
    const params = new URL(copiedText(writeText)).searchParams;
    expect(params.get("idea")).not.toBeNull();
    expect(params.get("mode")).toBe("explore");
    expect(params.get("transpose")).toBe("2");
    // No idea argument -> the URL is copied EXACTLY as written:
    const writeText2 = vi.fn(async () => {});
    mockClipboard(writeText2);
    await copyShareUrl();
    expect(new URL(copiedText(writeText2)).searchParams.has("idea")).toBe(false);
  });
});
