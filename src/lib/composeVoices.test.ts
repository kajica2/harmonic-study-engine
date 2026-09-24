/**
 * src/lib/composeVoices.test.ts - PRD-001 Phase 4 Slice 4 (D90, test
 * plan 6). NODE-PURE: the envelope-ordering helper (TD-045a CLOSED)
 * and the lead-recipe table. The helper lives in composeVoices (NOT
 * composePreview - the render file is the wrong home for param math).
 *
 * Discriminative: every monotonicity pin FAILS if the D90 clamp
 * (`endT = max(rawEnd, sustainT)`) is removed - the fast-tempo stab
 * case (pad: attack 0.3 + decay 0.4 = 0.8s vs a 0.001s note) is
 * exactly the ordering violation TD-045a recorded.
 */

import { describe, it, expect } from "vitest";
import {
  VOICE_RECIPES,
  voiceEnvelopeTimes,
  midiToFreq,
  type MixVoice,
  type VoiceRecipe,
} from "./composeVoices";

const VOICES: readonly MixVoice[] = ["lead", "bass", "chords", "pad"];
const DURS: readonly number[] = [0.001, 0.05, 4];

function checkMonotone(r: VoiceRecipe, start: number, dur: number): void {
  const t = voiceEnvelopeTimes(r, start, dur);
  expect(t.peakT).toBeGreaterThanOrEqual(start);
  expect(t.sustainT).toBeGreaterThanOrEqual(t.peakT);
  expect(t.holdT).toBeGreaterThanOrEqual(t.sustainT);
  expect(t.endT).toBeGreaterThanOrEqual(t.holdT);
  expect(t.stopT).toBeGreaterThanOrEqual(t.endT);
}

describe("voiceEnvelopeTimes monotonicity (D90 / TD-045a CLOSED)", () => {
  it("all five event times are non-decreasing for every voice x dur (incl. the 0.001s stab)", () => {
    for (const voice of VOICES) {
      for (const dur of DURS) {
        checkMonotone(VOICE_RECIPES[voice], 0, dur);
        checkMonotone(VOICE_RECIPES[voice], 3.5, dur);
      }
    }
  });

  it("the clamp fires exactly when durSec + release < attack + decay (pad stab)", () => {
    const pad = VOICE_RECIPES.pad; // attack .3 + decay .4 = .7 vs 0.001s note
    const t = voiceEnvelopeTimes(pad, 0, 0.001);
    expect(t.sustainT).toBeCloseTo(0.7, 9);
    expect(t.holdT).toBe(t.sustainT); // clamped UP to the sustain point
    expect(t.endT).toBe(t.holdT);
    expect(t.stopT).toBeCloseTo(0.7 + pad.releaseSec, 9);
    // Pre-fix the release target was rawEnd + release (0.501s) - an
    // ordering violation. The clamped stopT must exceed it:
    expect(t.stopT).toBeGreaterThan(0.001 + pad.releaseSec);
  });

  it("long notes are untouched by the clamp (endT = start + max(0.02, dur))", () => {
    const bass = VOICE_RECIPES.bass;
    const t = voiceEnvelopeTimes(bass, 1, 2);
    expect(t.endT).toBeCloseTo(3, 9);
    expect(t.stopT).toBeCloseTo(3 + bass.releaseSec, 9);
  });

  it("negative start clamps to 0; sub-0.02 dur floors at 0.02", () => {
    const t = voiceEnvelopeTimes(VOICE_RECIPES.chords, -5, 1);
    expect(t.peakT).toBeGreaterThanOrEqual(0);
    expect(t.endT).toBeGreaterThanOrEqual(0.02);
    const floored = voiceEnvelopeTimes(VOICE_RECIPES.chords, 0, 0);
    expect(floored.endT).toBeGreaterThanOrEqual(0.02);
  });
});

describe("VOICE_RECIPES table (D90 widen)", () => {
  it("covers exactly the 4 MixVoices", () => {
    expect(Object.keys(VOICE_RECIPES).sort()).toEqual(["bass", "chords", "lead", "pad"]);
  });

  it("lead recipe bounds per D90: sine x2 detune 3c, peak 0.35, no filter", () => {
    const lead = VOICE_RECIPES.lead;
    expect(lead.oscType).toBe("sine");
    expect(lead.voices).toBe(2);
    expect(lead.detuneCents).toBe(3);
    expect(lead.attackSec).toBe(0.01);
    expect(lead.decaySec).toBe(0.15);
    expect(lead.sustainLevel).toBeCloseTo(0.6, 9);
    expect(lead.releaseSec).toBe(0.1);
    expect(lead.filterHz).toBeNull();
    expect(lead.peak).toBeCloseTo(0.35, 9);
    // Distinct from chords (5c detune / 0.3 peak) - the D90 voice id.
    expect(lead.detuneCents).not.toBe(VOICE_RECIPES.chords.detuneCents);
    expect(lead.peak).not.toBe(VOICE_RECIPES.chords.peak);
  });

  it("the three AccompRole recipes are byte-unchanged (S3 seam survives)", () => {
    expect(VOICE_RECIPES.bass.oscType).toBe("triangle");
    expect(VOICE_RECIPES.chords.detuneCents).toBe(5);
    expect(VOICE_RECIPES.pad.filterHz).toBe(1100);
    expect(VOICE_RECIPES.pad.attackSec).toBe(0.3);
  });

  it("every voice keeps sane synthesis bounds (peak <= 0.5 so 4-bus sums stay conservative)", () => {
    for (const voice of VOICES) {
      const r = VOICE_RECIPES[voice];
      expect(r.peak).toBeGreaterThan(0);
      expect(r.peak).toBeLessThanOrEqual(0.5);
      expect(r.sustainLevel).toBeGreaterThan(0);
      expect(r.sustainLevel).toBeLessThanOrEqual(1);
      expect(midiToFreq(69)).toBeCloseTo(440, 6);
    }
  });
});
