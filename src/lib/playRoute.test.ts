/**
 * src/lib/playRoute.test.ts - PRD-001 Phase 8 S1 (D148, doc 6.1).
 * Node project (pure). 3 pins: the exact-match law (S4 D-11
 * precedent) - ONLY /play and /play/ route; everything else stays
 * on the App.
 */

import { describe, it, expect } from "vitest";
import { isPlayRoute } from "./playRoute";

describe("isPlayRoute (the whole router)", () => {
  it("/play routes", () => {
    expect(isPlayRoute("/play")).toBe(true);
  });

  it("/play/ routes (trailingSlash:false canonicalizes, accepting both is one ||)", () => {
    expect(isPlayRoute("/play/")).toBe(true);
  });

  it("everything else does NOT route (exact-match law)", () => {
    expect(isPlayRoute("/")).toBe(false);
    expect(isPlayRoute("/play/x")).toBe(false);
    expect(isPlayRoute("/other")).toBe(false);
    expect(isPlayRoute("/player")).toBe(false); // prefix must not leak
    expect(isPlayRoute("/PLAY")).toBe(false); // case-exact
  });
});
