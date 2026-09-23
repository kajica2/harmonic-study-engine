/**
 * metronomePatterns.test.ts - PRD-001 Phase 3 Slice 3 (T1 + T2).
 *
 * T1 is THE safety pin: an exhaustive per-meter oracle proving the
 * DEFAULT metronome config reproduces the legacy rhythm.ts playStep
 * click pattern BIT-IDENTICALLY (the mirror of the FROZEN
 * tests/rhythm.test.ts spy: playStep(0) -> playMetronomeClick(true),
 * EXACTLY one argument). Written GREEN before playStep was rewired -
 * that ordering is load-bearing (checklist step 1).
 *
 * Node project (src/lib pure logic; the rhythm/audio imports are the
 * same module pair the frozen tests/rhythm.test.ts uses under node).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_METRONOME_CONFIG,
  beatsPerMeasureFor,
  clickActionFor,
  legacyClickEquivalent,
  normalizeMetronomeConfig,
  stepsPerBeatFor,
  stepsPerMeasureFor,
} from "./metronomePatterns";
import type { TimeSignature } from "./rhythm";
import { RhythmEngine } from "./rhythm";

const ALL_TS: readonly TimeSignature[] = [
  "4/4",
  "6/8",
  "7/8",
  "11/4",
  "tintal",
];

// ---------- T1: legacy equivalence (F1 mirror) --------------------------

describe("T1 legacy-equivalence oracle", () => {
  for (const ts of ALL_TS) {
    it(`default config (s=1, [0]) reproduces the legacy click table exactly for ${ts}`, () => {
      const spm = stepsPerMeasureFor(ts);
      for (let step = 0; step < spm; step += 1) {
        const action = clickActionFor(step, ts, 1, [0], 0.5);
        if (legacyClickEquivalent(step, ts)) {
          // Legacy: step 0 high, every other fired click weak.
          expect(action, `step ${step} in ${ts}`).toEqual({
            kind: "click",
            high: step === 0,
          });
        } else {
          expect(action, `step ${step} in ${ts}`).toEqual({ kind: "none" });
        }
      }
    });
  }

  it("stepsPerMeasureFor mirrors the IMMUTABLE rhythm.ts table", () => {
    const e = new RhythmEngine();
    const expected: Record<TimeSignature, number> = {
      "4/4": 16,
      "6/8": 12,
      "7/8": 14,
      "11/4": 44,
      tintal: 64,
    };
    for (const ts of ALL_TS) {
      e.setTimeSignature(ts);
      expect(e.getStepsPerMeasure(), `engine ${ts}`).toBe(expected[ts]);
      expect(stepsPerMeasureFor(ts), `mirror ${ts}`).toBe(expected[ts]);
    }
  });

  it("RhythmEngine defaults mirror DEFAULT_METRONOME_CONFIG (private-field pin, frozen-test precedent)", () => {
    const e = new RhythmEngine();
    const internals = e as unknown as {
      metronomeEnabled: boolean;
      subdivision: number;
      accentBeats: readonly number[];
    };
    expect(internals.metronomeEnabled).toBe(true);
    expect(internals.subdivision).toBe(DEFAULT_METRONOME_CONFIG.subdivision);
    expect(internals.accentBeats).toEqual(DEFAULT_METRONOME_CONFIG.accentBeats);
  });
});

// ---------- T2: subdivision / accents / normalization --------------------

describe("T2 subdivision periods", () => {
  it("s=2 in 4/4 clicks every 2nd step (half-beat period)", () => {
    for (let step = 0; step < 16; step += 1) {
      const a = clickActionFor(step, "4/4", 2, [0], 0.5);
      expect(a.kind, `step ${step}`).toBe(step % 2 === 0 ? "click" : "none");
    }
  });

  it("s=4 in 4/4 clicks every step (quarter-beat period)", () => {
    for (let step = 0; step < 16; step += 1) {
      expect(clickActionFor(step, "4/4", 4, [0], 0.5).kind).toBe("click");
    }
  });

  it("compound clamp: in 6/8, s=2 AND s=4 both yield every step (16th grid)", () => {
    for (let step = 0; step < 12; step += 1) {
      expect(clickActionFor(step, "6/8", 2, [0], 0.25).kind).toBe("click");
      expect(clickActionFor(step, "6/8", 4, [0], 0.25).kind).toBe("click");
    }
  });

  it("s=3 emits triplet IFF the step is a beat boundary, none elsewhere; secPerBeat passthrough", () => {
    for (let step = 0; step < 16; step += 1) {
      const a = clickActionFor(step, "4/4", 3, [0], 0.75);
      if (step % 4 === 0) {
        expect(a, `step ${step}`).toEqual({
          kind: "triplet",
          high: step === 0,
          secPerBeat: 0.75,
        });
      } else {
        expect(a, `step ${step}`).toEqual({ kind: "none" });
      }
    }
  });
});

describe("T2 accents", () => {
  it("[0,2] in 4/4 -> steps 0 and 8 high; 4 and 12 weak", () => {
    expect(clickActionFor(0, "4/4", 1, [0, 2], 0.5)).toEqual({
      kind: "click",
      high: true,
    });
    expect(clickActionFor(4, "4/4", 1, [0, 2], 0.5)).toEqual({
      kind: "click",
      high: false,
    });
    expect(clickActionFor(8, "4/4", 1, [0, 2], 0.5)).toEqual({
      kind: "click",
      high: true,
    });
    expect(clickActionFor(12, "4/4", 1, [0, 2], 0.5)).toEqual({
      kind: "click",
      high: false,
    });
  });

  it("empty accentBeats = all-weak (valid user choice, incl. the downbeat)", () => {
    expect(clickActionFor(0, "4/4", 1, [], 0.5)).toEqual({
      kind: "click",
      high: false,
    });
  });

  it("accent beats beyond the meter are ignored, never corrupt clicks", () => {
    // 6/8 has 6 beats; beat 9 can never match.
    expect(clickActionFor(0, "6/8", 1, [9], 0.25)).toEqual({
      kind: "click",
      high: false,
    });
  });
});

describe("T2 beatsPerMeasureFor table pin", () => {
  it("4/4 -> 4, 6/8 -> 6, 7/8 -> 7, 11/4 -> 11, tintal -> 16", () => {
    expect(beatsPerMeasureFor("4/4")).toBe(4);
    expect(beatsPerMeasureFor("6/8")).toBe(6);
    expect(beatsPerMeasureFor("7/8")).toBe(7);
    expect(beatsPerMeasureFor("11/4")).toBe(11);
    expect(beatsPerMeasureFor("tintal")).toBe(16);
  });

  it("stepsPerBeatFor: 2 in compound meters, 4 elsewhere", () => {
    expect(stepsPerBeatFor("6/8")).toBe(2);
    expect(stepsPerBeatFor("7/8")).toBe(2);
    expect(stepsPerBeatFor("4/4")).toBe(4);
    expect(stepsPerBeatFor("11/4")).toBe(4);
    expect(stepsPerBeatFor("tintal")).toBe(4);
  });
});

describe("T2 normalizeMetronomeConfig (corruption-safe, D32)", () => {
  it("null input -> defaults", () => {
    expect(normalizeMetronomeConfig(null)).toEqual(DEFAULT_METRONOME_CONFIG);
  });

  it("non-object input -> defaults", () => {
    expect(normalizeMetronomeConfig("kazoo")).toEqual(
      DEFAULT_METRONOME_CONFIG,
    );
    expect(normalizeMetronomeConfig(42)).toEqual(DEFAULT_METRONOME_CONFIG);
  });

  it("garbage blob -> clamped/filtered defaults", () => {
    const garbage = {
      volume: Number.NaN,
      preset: "kazoo",
      subdivision: 7,
      accentBeats: [-1, 99, "x"],
      countInBars: 5,
    };
    expect(normalizeMetronomeConfig(garbage)).toEqual({
      volume: 80,
      preset: "beep",
      subdivision: 1,
      accentBeats: [99], // non-negative ints survive; junk dropped
      countInBars: 0,
    });
  });

  it("volume clamps both ends; non-numbers fall back to the default", () => {
    expect(normalizeMetronomeConfig({ volume: 150 }).volume).toBe(100);
    expect(normalizeMetronomeConfig({ volume: -20 }).volume).toBe(0);
    // Strings never coerce: fallback is the DEFAULT (which is 80).
    expect(normalizeMetronomeConfig({ volume: "80" }).volume).toBe(80);
    expect(normalizeMetronomeConfig({ volume: Infinity }).volume).toBe(80);
  });

  it("valid config round-trips unchanged", () => {
    const valid = {
      volume: 55,
      preset: "shaker",
      subdivision: 3,
      accentBeats: [0, 2, 4],
      countInBars: 2,
    };
    expect(normalizeMetronomeConfig(valid)).toEqual(valid);
  });

  it("explicit empty accentBeats survives (all-weak is a choice)", () => {
    expect(normalizeMetronomeConfig({ accentBeats: [] }).accentBeats).toEqual(
      [],
    );
  });
});
