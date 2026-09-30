/**
 * src/lib/slideshow.test.ts — PIN-001.
 *
 * The slideshow's alpha curve + active-layer derivation are the
 * single source of truth for the new beat-timed visual surface.
 * If the math drifts, every frame silently re-frames wrong; the
 * node pins here are the only place we can verify it without a
 * running renderer.
 *
 * Pinned laws:
 *   - layerAtBeat at beat=0 returns alpha=1.0, activeLayer=0.
 *   - layerAtBeat at beat=barsPerLayer-1 returns alpha ~ 0.0,
 *     activeLayer STILL 0 (we're inside the dwell; the swap hasn't
 *     happened yet — the OTHER layer has crossfaded IN).
 *   - layerAtBeat at beat=barsPerLayer returns activeLayer=1,
 *     alpha=1.0 (swap just happened; we're at the start of dwell 1).
 *   - swapBeat at beat=0 returns barsPerLayer; at beat=barsPerLayer
 *     returns 2 * barsPerLayer; at beat=3*barsPerLayer-1 returns
 *     3 * barsPerLayer.
 *   - Defensive: layerCount=0 throws; barsPerLayer <= 0 throws
 *     for the *strict* helpers (we expose safe defaults from the
 *     production entry points — see "Defensive" suite below).
 *
 * This is pure logic — runs in the node project (no DOM).
 */

import { describe, it, expect } from "vitest";
import {
  layerAtBeat,
  swapBeat,
  type SlideshowConfig,
} from "./slideshow";

describe("layerAtBeat - canonical dwell", () => {
  // barsPerLayer = 4 — small enough to keep arithmetic obvious,
  // large enough to see the cosine breath curve at non-trivial
  // points (not just endpoints).

  it("beat=0 returns alpha=1.0, activeLayer=0", () => {
    const r = layerAtBeat({ beat: 0, barsPerLayer: 4, layerCount: 2 });
    expect(r.activeLayer).toBe(0);
    expect(r.otherLayer).toBe(1);
    expect(r.alpha).toBeCloseTo(1, 10);
  });

  it("beat=barsPerLayer-1 returns alpha~0.0, activeLayer still 0", () => {
    // Last beat of dwell 0: the active layer has fully crossfaded
    // OUT (alpha ~ 0) but is still "the layer currently fading
    // IN's predecessor" — the next beat will swap.
    const r = layerAtBeat({ beat: 3, barsPerLayer: 4, layerCount: 2 });
    expect(r.activeLayer).toBe(0);
    expect(r.otherLayer).toBe(1);
    expect(r.alpha).toBeCloseTo(0, 10);
  });

  it("beat=barsPerLayer returns activeLayer=1, alpha=1.0", () => {
    // Just swapped. New dwell starts: activeLayer 1 at full alpha.
    const r = layerAtBeat({ beat: 4, barsPerLayer: 4, layerCount: 2 });
    expect(r.activeLayer).toBe(1);
    expect(r.otherLayer).toBe(0);
    expect(r.alpha).toBeCloseTo(1, 10);
  });

  it("midpoint of dwell has alpha exactly 0.5 (cosine midpoint)", () => {
    // The cosine curve is symmetric: at t = 0.5, cos(pi/2) = 0,
    // mapped to 0.5. This is the most "neutral" frame visually —
    // both layers at equal opacity. Test it directly so a future
    // refactor (e.g. swap cosine for linear) has to acknowledge
    // the change.
    const r = layerAtBeat({ beat: 1.5, barsPerLayer: 4, layerCount: 2 });
    expect(r.alpha).toBeCloseTo(0.5, 10);
  });
});

describe("layerAtBeat - multi-layer wrap", () => {
  it("cycles through 3 layers: 0 -> 1 -> 2 -> 0", () => {
    const bpl = 4;
    expect(layerAtBeat({ beat: 0, barsPerLayer: bpl, layerCount: 3 }).activeLayer).toBe(0);
    expect(layerAtBeat({ beat: 4, barsPerLayer: bpl, layerCount: 3 }).activeLayer).toBe(1);
    expect(layerAtBeat({ beat: 8, barsPerLayer: bpl, layerCount: 3 }).activeLayer).toBe(2);
    expect(layerAtBeat({ beat: 12, barsPerLayer: bpl, layerCount: 3 }).activeLayer).toBe(0);
  });

  it("otherLayer is the next layer modulo layerCount", () => {
    const r0 = layerAtBeat({ beat: 0, barsPerLayer: 4, layerCount: 3 });
    expect(r0.otherLayer).toBe(1);
    const r2 = layerAtBeat({ beat: 8, barsPerLayer: 4, layerCount: 3 });
    // Active 2 -> wraps to 0
    expect(r2.otherLayer).toBe(0);
  });

  it("large beats wrap modulo layerCount (no drift across long sessions)", () => {
    // 1000 beats, 4 per layer, 3 layers: 1000 / 4 = dwell 250,
    // 250 % 3 = 1. So activeLayer must be 1.
    const r = layerAtBeat({ beat: 1000, barsPerLayer: 4, layerCount: 3 });
    expect(r.activeLayer).toBe(1);
    expect(r.alpha).toBeCloseTo(1, 10);
  });
});

describe("swapBeat - next-swap lookahead", () => {
  it("beat=0 -> barsPerLayer", () => {
    expect(swapBeat({ beat: 0, barsPerLayer: 4 })).toBe(4);
  });

  it("beat=barsPerLayer -> 2 * barsPerLayer", () => {
    expect(swapBeat({ beat: 4, barsPerLayer: 4 })).toBe(8);
  });

  it("beat=barsPerLayer-1 -> barsPerLayer (we're in the last beat)", () => {
    // The swap is still 1 beat away.
    expect(swapBeat({ beat: 3, barsPerLayer: 4 })).toBe(4);
  });

  it("beat=3*barsPerLayer-1 -> 3 * barsPerLayer", () => {
    expect(swapBeat({ beat: 11, barsPerLayer: 4 })).toBe(12);
  });

  it("beat=999 with barsPerLayer=4 -> 1000 (round-up, never round-down)", () => {
    // 999 / 4 = 249.75 -> dwell 249 -> next swap (249+1)*4 = 1000
    expect(swapBeat({ beat: 999, barsPerLayer: 4 })).toBe(1000);
  });
});

describe("layerAtBeat - defensive", () => {
  it("layerCount=0 returns safe defaults (alpha 1, layer 0)", () => {
    // Production entry point is defensive — callers are expected
    // to validate their config. A bare layerAtBeat with
    // layerCount=0 must not throw, must not return NaN alpha,
    // and must show SOMETHING (a blank screen is worse than a
    // wrong-but-visible layer).
    const r = layerAtBeat({ beat: 5, barsPerLayer: 4, layerCount: 0 });
    expect(r.activeLayer).toBe(0);
    expect(r.otherLayer).toBe(0);
    expect(r.alpha).toBe(1);
    expect(Number.isFinite(r.alpha)).toBe(true);
  });

  it("barsPerLayer<=0 returns safe defaults", () => {
    for (const bad of [0, -1, -4]) {
      const r = layerAtBeat({ beat: 5, barsPerLayer: bad, layerCount: 2 });
      expect(r.activeLayer).toBe(0);
      expect(r.otherLayer).toBe(0);
      expect(r.alpha).toBe(1);
    }
  });

  it("NaN inputs return safe defaults (no NaN ever reaches the DOM)", () => {
    const cases = [
      { beat: NaN, barsPerLayer: 4, layerCount: 2 },
      { beat: 5, barsPerLayer: NaN, layerCount: 2 },
      { beat: 5, barsPerLayer: 4, layerCount: NaN },
      { beat: NaN, barsPerLayer: NaN, layerCount: NaN },
    ];
    for (const c of cases) {
      const r = layerAtBeat(c);
      expect(r.activeLayer).toBe(0);
      expect(r.alpha).toBe(1);
      expect(Number.isFinite(r.alpha)).toBe(true);
    }
  });

  it("negative beat is clamped to 0 (no Math.floor(-1 / 4) = -1 surprise)", () => {
    const r = layerAtBeat({ beat: -3, barsPerLayer: 4, layerCount: 2 });
    // Same as beat=0: activeLayer 0, alpha 1
    expect(r.activeLayer).toBe(0);
    expect(r.alpha).toBeCloseTo(1, 10);
  });

  it("layerCount=1 is legal: pinned to layer 0, alpha always 1", () => {
    for (const b of [0, 1, 5, 100]) {
      const r = layerAtBeat({ beat: b, barsPerLayer: 4, layerCount: 1 });
      expect(r.activeLayer).toBe(0);
      expect(r.otherLayer).toBe(0);
      expect(r.alpha).toBe(1);
    }
  });

  it("barsPerLayer=1 short-circuits to alpha=1 (no divide-by-zero)", () => {
    // barsPerLayer=1 means every beat is a swap boundary; with a
    // 1-beat dwell there is no room for a breath. alpha must
    // always be 1, activeLayer must advance every beat.
    const r0 = layerAtBeat({ beat: 0, barsPerLayer: 1, layerCount: 2 });
    expect(r0.alpha).toBe(1);
    expect(r0.activeLayer).toBe(0);
    const r1 = layerAtBeat({ beat: 1, barsPerLayer: 1, layerCount: 2 });
    expect(r1.alpha).toBe(1);
    expect(r1.activeLayer).toBe(1);
  });
});

describe("swapBeat - defensive", () => {
  it("barsPerLayer<=0 returns 0", () => {
    expect(swapBeat({ beat: 5, barsPerLayer: 0 })).toBe(0);
    expect(swapBeat({ beat: 5, barsPerLayer: -3 })).toBe(0);
  });

  it("NaN inputs return 0", () => {
    expect(swapBeat({ beat: NaN, barsPerLayer: 4 })).toBe(0);
    expect(swapBeat({ beat: 5, barsPerLayer: NaN })).toBe(0);
  });

  it("negative beat is clamped to 0 before division (no surprise)", () => {
    expect(swapBeat({ beat: -3, barsPerLayer: 4 })).toBe(4);
  });
});

describe("SlideshowConfig shape (light smoke test)", () => {
  // The consumer (Slideshow.tsx) destructures this; the test only
  // pins that the type round-trips so a future refactor that
  // drops `barsPerLayer` from the shape trips here.

  it("holds layers + barsPerLayer", () => {
    const cfg: SlideshowConfig = {
      layers: [
        { id: "chart", title: "Chord chart" },
        { id: "voicing", title: "Voicing inspector" },
      ],
      barsPerLayer: 8,
    };
    expect(cfg.layers).toHaveLength(2);
    expect(cfg.barsPerLayer).toBe(8);
    expect(cfg.layers[0].id).toBe("chart");
  });
});