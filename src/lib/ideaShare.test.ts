/**
 * src/lib/ideaShare.test.ts - PRD-001 Phase 8 S1 (D149, doc 6.1).
 *
 * Node project (pure logic; btoa/atob/URL are node globals). THE
 * anti-drift law of this slice: the codec must match the SHIPPED
 * paths byte-for-byte - encode == the shipped IdeaBar scheme
 * (btoa(encodeURIComponent(JSON))), decode == the shipped App:1450
 * path (atob -> decodeURIComponent -> JSON.parse -> isIdea, warn on
 * throw, silent on guard-fail). Links are already in the wild; drift
 * here breaks them. 9 pins.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  IDEA_URL_KEY,
  IDEA_URL_MAX,
  decodeIdeaParam,
  encodeIdeaParam,
  withIdeaParam,
} from "./ideaShare";
import { ideaFromChord, isIdea, type Idea } from "../../engine/core/idea";

const IDEA = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);

function bigIdea(): Idea {
  return {
    ...IDEA,
    kind: "melody",
    chord: null,
    melody: Array.from({ length: 600 }, (_, i) => 60 + (i % 24)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shipped-scheme byte-compat (the no-drift law)", () => {
  it("encode EXACTLY matches the shipped IdeaBar scheme", () => {
    // IdeaBar.tsx:68-76 verbatim: btoa(encodeURIComponent(JSON)).
    const shipped = btoa(encodeURIComponent(JSON.stringify(IDEA)));
    expect(encodeIdeaParam(IDEA)).toBe(shipped);
    expect(IDEA_URL_KEY).toBe("idea");
  });

  it("decode EXACTLY matches the shipped App:1450 path (round-trip identity)", () => {
    const enc = encodeIdeaParam(IDEA) as string;
    // The shipped decoder, replicated here against OUR encoder:
    const viaShippedPath = JSON.parse(decodeURIComponent(atob(enc)));
    expect(isIdea(viaShippedPath)).toBe(true);
    expect(decodeIdeaParam(enc)).toEqual(IDEA);
  });

  it("decode of a SHIPPED-encoded payload lands the idea (forward compat)", () => {
    const shippedEnc = btoa(encodeURIComponent(JSON.stringify(IDEA)));
    // The shipped App assembled the URL as ?idea=encodeURIComponent(b64);
    // URLSearchParams hands the decoder the DECODED value:
    const qs = new URLSearchParams(`?idea=${encodeURIComponent(shippedEnc)}`);
    expect(decodeIdeaParam(qs.get("idea"))).toEqual(IDEA);
  });
});

describe("decodeIdeaParam drop semantics (the shipped split)", () => {
  it("malformed base64/JSON -> null + console.warn ONCE", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decodeIdeaParam("%%%not-base64%%%")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(decodeIdeaParam(btoa("}{ not json"))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("valid JSON failing the isIdea guard -> null WITHOUT a warn (shipped silence)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = btoa(encodeURIComponent(JSON.stringify({ hello: "world" })));
    expect(decodeIdeaParam(raw)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("absent (null) -> null, no warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decodeIdeaParam(null)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("governor asymmetry (D149)", () => {
  it("writer-encode past IDEA_URL_MAX -> null (skip the key ONLY)", () => {
    expect(IDEA_URL_MAX).toBe(1500);
    expect(encodeIdeaParam(bigIdea())).toBeNull();
    expect(encodeIdeaParam(IDEA)).not.toBeNull(); // small rides
  });

  it("decode has NO cap - an over-governor payload still lands", () => {
    const raw = btoa(encodeURIComponent(JSON.stringify(bigIdea())));
    expect(raw.length).toBeGreaterThan(IDEA_URL_MAX);
    expect(decodeIdeaParam(raw)).toEqual(bigIdea());
  });

  it("withIdeaParam sets/replaces/deletes preserving every other key, governor-free", () => {
    const href = "http://localhost/app?mode=etude&transpose=2&style=jazz#frag";
    // SET (past the governor - explicit copy always lands):
    const withBig = withIdeaParam(href, bigIdea());
    const p1 = new URL(withBig).searchParams;
    expect(p1.get("idea")).not.toBeNull();
    expect(p1.get("mode")).toBe("etude");
    expect(p1.get("transpose")).toBe("2");
    expect(p1.get("style")).toBe("jazz");
    expect(new URL(withBig).hash).toBe("#frag");
    // REPLACE:
    const withSmall = withIdeaParam(withBig, IDEA);
    expect(new URL(withSmall).searchParams.get("idea")).toBe(encodeIdeaParam(IDEA));
    // DELETE:
    const cleared = withIdeaParam(href, null);
    expect(new URL(cleared).searchParams.has("idea")).toBe(false);
    expect(new URL(cleared).searchParams.get("mode")).toBe("etude");
  });
});
