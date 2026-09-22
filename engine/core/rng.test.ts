/**
 * engine/core/rng.test.ts - pins REQ-FND-2 / REQ-FND-3.
 *
 * The re-export identity pin at the bottom guards the PRD-001 Phase 0
 * move: src/magenta/noise.ts must re-export THE SAME function objects
 * from engine/core/rng.ts, so magenta golden tests (exact streams)
 * keep passing with zero behavior change.
 */

import { describe, it, expect } from "vitest";
import { mulberry32, hashSeed, createRng } from "./rng";
import {
  mulberry32 as noiseMulberry32,
  hashSeed as noiseHashSeed,
} from "../../src/magenta/noise";

describe("mulberry32", () => {
  it("produces an identical 1000-draw stream for two handles with the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it("draws stay in [0, 1)", () => {
    const a = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("mean of 1000 draws is roughly 0.5", () => {
    const a = mulberry32(123);
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += a();
    expect(sum / 1000).toBeGreaterThanOrEqual(0.45);
    expect(sum / 1000).toBeLessThanOrEqual(0.55);
  });

  it("different seeds produce different streams", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let anyDiff = false;
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });
});

describe("hashSeed", () => {
  it("is stable and uint32 for a known input", () => {
    const h = hashSeed("path-1");
    expect(h).toBe(hashSeed("path-1"));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(4294967295);
  });

  it("distinguishes different strings", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("createRng", () => {
  it("exposes the seed it was created from", () => {
    expect(createRng(9).seed).toBe(9);
    expect(createRng(-1).seed).toBe(4294967295); // uint32 wrap
  });

  it("int() is deterministic, in range, and rejects invalid bounds", () => {
    const a = createRng(5);
    const b = createRng(5);
    for (let i = 0; i < 100; i++) {
      const v = a.int(6);
      expect(b.int(6)).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    expect(() => a.int(0)).toThrow(RangeError);
    expect(() => a.int(1.5)).toThrow(RangeError);
  });

  it("range() is inclusive on both ends and rejects empty ranges", () => {
    const r = createRng(11);
    for (let i = 0; i < 100; i++) {
      const v = r.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
    expect(() => r.range(5, 4)).toThrow(RangeError);
  });

  it("bool() honors p deterministically at the extremes", () => {
    const a = createRng(3);
    const b = createRng(3);
    expect(a.bool(0)).toBe(false);
    expect(b.bool(0)).toBe(false);
    expect(a.bool(1)).toBe(true);
    expect(b.bool(1)).toBe(true);
  });

  it("pick() is deterministic and never mutates its input", () => {
    const arr = ["a", "b", "c"] as const;
    const chosen = createRng(8).pick(arr);
    expect(chosen).toBe(createRng(8).pick(arr));
    expect(arr).toEqual(["a", "b", "c"]);
    expect(() => createRng(8).pick([])).toThrow(RangeError);
  });

  it("weighted() respects a 100:1 skew and rejects bad input", () => {
    const items = [
      { item: "hot", weight: 100 },
      { item: "cold", weight: 1 },
    ];
    const r = createRng(17);
    let hot = 0;
    for (let i = 0; i < 200; i++) {
      if (r.weighted(items) === "hot") hot++;
    }
    expect(hot).toBeGreaterThan(150);
    expect(() => r.weighted([])).toThrow(RangeError);
    expect(() => r.weighted([{ item: "x", weight: 0 }])).toThrow(RangeError);
  });

  it("shuffle() returns a permutation, leaves the input untouched, and is deterministic", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(23).shuffle(input);
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).toEqual(createRng(23).shuffle(input));
  });
});

describe("noise.ts re-export identity (PRD-001 Phase 0 move)", () => {
  it("src/magenta/noise re-exports the exact engine function objects", () => {
    expect(noiseMulberry32).toBe(mulberry32);
    expect(noiseHashSeed).toBe(hashSeed);
  });
});
