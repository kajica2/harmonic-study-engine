/**
 * engine/core/rng.golden.test.ts - exact PRNG stream pins (REQ-FND-2/3).
 *
 * Why this file exists: rng.test.ts pins PROPERTIES (determinism, range,
 * mean) and the re-export pin checks function IDENTITY. Neither catches a
 * silent change to the mulberry32/hashSeed ALGORITHM itself - flipping a
 * magic constant leaves every property assertion green while shifting all
 * generated output. These goldens close that hole: they pin the exact
 * doubles/uint32s produced by the current algorithm, and they pin the SAME
 * values through the src/magenta/noise.ts re-export path so any future
 * drift of that shim (e.g. someone restoring an old copy) also fails.
 *
 * Values generated from engine/core/rng.ts at PRD-001 Phase 0 verification.
 * IEEE-754 double + imul/>>> semantics are spec-exact on all platforms.
 */

import { describe, it, expect } from "vitest";
import { mulberry32, hashSeed, createRng } from "./rng";
import {
  mulberry32 as noiseMulberry32,
  hashSeed as noiseHashSeed,
} from "../../src/magenta/noise";

function draws(seed: number, n: number): number[] {
  const g = mulberry32(seed);
  return Array.from({ length: n }, () => g());
}

describe("mulberry32 exact stream goldens", () => {
  it("seed 42 produces the pinned first 8 draws", () => {
    expect(draws(42, 8)).toEqual([
      0.6011037519201636,
      0.44829055899754167,
      0.8524657934904099,
      0.6697340414393693,
      0.17481389874592423,
      0.5265925421845168,
      0.2732279943302274,
      0.6247446539346129,
    ]);
  });

  it("seed 0 produces the pinned first 6 draws", () => {
    expect(draws(0, 6)).toEqual([
      0.26642920868471265,
      0.0003297457005828619,
      0.2232720274478197,
      0.1462021479383111,
      0.46732782293111086,
      0.5450490827206522,
    ]);
  });

  it("negative seed -1 (uint32-normalized) produces the pinned first 6 draws", () => {
    expect(draws(-1, 6)).toEqual([
      0.8964226141106337,
      0.189478256739676,
      0.7156526781618595,
      0.9440599093213677,
      0.8452364315744489,
      0.5391399988438934,
    ]);
  });
});

describe("hashSeed exact goldens", () => {
  it("pins known uint32 outputs", () => {
    expect(hashSeed("path-1")).toBe(2708719632);
    expect(hashSeed("stella")).toBe(2985074220);
    expect(hashSeed("")).toBe(2166136261); // FNV offset basis, no rounds
  });
});

describe("createRng derived goldens", () => {
  it("int(6) stream from seed 7 is pinned", () => {
    const r = createRng(7);
    const got = Array.from({ length: 6 }, () => r.int(6));
    expect(got).toEqual([0, 0, 5, 4, 3, 2]);
  });
});

describe("noise.ts re-export stream goldens (PRD-001 Phase 0 shim)", () => {
  it("re-exported mulberry32 yields the identical pinned stream", () => {
    const g = noiseMulberry32(42);
    const viaNoise = Array.from({ length: 8 }, () => g());
    expect(viaNoise).toEqual(draws(42, 8));
    expect(viaNoise[0]).toBe(0.6011037519201636);
  });

  it("re-exported hashSeed yields the identical pinned uint32s", () => {
    expect(noiseHashSeed("path-1")).toBe(2708719632);
    expect(noiseHashSeed("stella")).toBe(2985074220);
  });
});
