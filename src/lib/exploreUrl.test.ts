/**
 * src/lib/exploreUrl.test.ts - PRD-001 Phase 8 S1 (D146, doc 6.1).
 *
 * Node project (pure logic). 7 pins: the raw-text round trip through
 * URLSearchParams (spaces/#/=/& survive - the encoding is the
 * params object's job, never ours), the 200-char governor boundary
 * (200 OK, 201 skip), null/"" skip, hasExploreParams, and the
 * absent/empty parse-to-null law (field-wise doctrine: absent is
 * never "").
 */

import { describe, it, expect } from "vitest";
import {
  ESEED_URL_MAX,
  EXPLORE_URL_KEYS,
  hasExploreParams,
  parseExploreSeedParam,
  serializeExploreSeed,
} from "./exploreUrl";

describe("serializeExploreSeed / parseExploreSeedParam round trip", () => {
  it("the key set is exactly [eseed]", () => {
    expect(EXPLORE_URL_KEYS).toEqual(["eseed"]);
  });

  it("raw text round-trips through URLSearchParams (spaces/#/=/& survive)", () => {
    const seeds = [
      "Dm7 G7 Cmaj7",
      "chord:Cmaj7#11",
      "mode=dorian&seed=x",
      "ii-V#I & more",
      "ii-V-I",
    ];
    for (const seedText of seeds) {
      const rec = serializeExploreSeed(seedText);
      expect(rec.eseed).toBe(seedText);
      const qs = new URLSearchParams();
      qs.set("eseed", rec.eseed as string);
      expect(parseExploreSeedParam(new URLSearchParams(qs.toString()))).toBe(seedText);
    }
  });

  it("exactly 200 chars serializes (boundary OK)", () => {
    const s = "a".repeat(ESEED_URL_MAX);
    expect(serializeExploreSeed(s).eseed).toBe(s);
  });

  it("201 chars SKIPS the key (governor honesty)", () => {
    expect(serializeExploreSeed("a".repeat(ESEED_URL_MAX + 1)).eseed).toBeNull();
  });

  it("null and '' skip the key (never an empty eseed= in the URL)", () => {
    expect(serializeExploreSeed(null).eseed).toBeNull();
    expect(serializeExploreSeed("").eseed).toBeNull();
  });

  it("parse: absent and empty both land at null (absent is never '')", () => {
    expect(parseExploreSeedParam(new URLSearchParams(""))).toBeNull();
    expect(parseExploreSeedParam(new URLSearchParams("?eseed="))).toBeNull();
  });
});

describe("hasExploreParams", () => {
  it("true only when an explore key is actually present", () => {
    expect(hasExploreParams(new URLSearchParams(""))).toBe(false);
    expect(hasExploreParams(new URLSearchParams("?eseed="))).toBe(true);
    expect(hasExploreParams(new URLSearchParams("?mode=explore"))).toBe(false);
    // The etude bare-`seed` key is NOT an explore key (the collision
    // D146 renamed away from).
    expect(hasExploreParams(new URLSearchParams("?seed=42"))).toBe(false);
  });
});
