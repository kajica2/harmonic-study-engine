/**
 * engine/etude/melody.test.ts - PRD-001 Phase 3 Slice 1 (test plan 2).
 *
 * Drives generateMelody over real generateProgression output with a
 * single shared Rng (the exact assemble.ts draw order), then asserts
 * the grid invariants: range, interval cap, forced chord tones,
 * straight-rhythm zero syncopation, no overlaps, cadential close.
 */

import { describe, it, expect } from "vitest";
import { generateMelody, SLOTS_PER_BAR } from "./melody";
import { generateProgression } from "./harmony";
import { createRng } from "../core/rng";
import { getStyleProfile } from "../styles/index";
import type { EtudeConstraints, EtudeMode } from "./types";

function constraints(over: Partial<EtudeConstraints> = {}): EtudeConstraints {
  return {
    version: 1,
    styleId: "jazz",
    key: 0,
    mode: "major",
    difficulty: 3,
    bars: 8,
    tempo: null,
    seed: 42,
    harmony: { allowedQualities: null, allowedNumerals: null, startOn: null, endOn: null, requireChromaticism: false },
    melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: null },
    rhythm: { straightRhythmsOnly: false },
    ...over,
  };
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

function run(c: EtudeConstraints) {
  const profile = getStyleProfile(c.styleId);
  const rng = createRng(c.seed);
  const chords = generateProgression({ profile, constraints: c, rng });
  const melody = generateMelody({ profile, constraints: c, chords, rng });
  return { chords, melody, profile };
}

function chordTonePcs(chords: { notes: readonly number[] }[], slot: number): number[] {
  const ch = chords[Math.floor(slot / SLOTS_PER_BAR)];
  const pcs: number[] = [];
  for (const n of ch.notes) if (!pcs.includes(mod12(n))) pcs.push(mod12(n));
  return pcs;
}

describe("generateMelody grid invariants", () => {
  it("respects the profile range when no constraint range is set", () => {
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      const { melody, profile } = run(constraints({ styleId }));
      const lo = Math.max(profile.melody.range[0], profile.voicing.registers.melody[0]);
      const hi = Math.min(profile.melody.range[1], profile.voicing.registers.melody[1]);
      for (const n of melody) {
        expect(n.midi).toBeGreaterThanOrEqual(lo);
        expect(n.midi).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("respects an explicit constraint range", () => {
    const { melody } = run(constraints({ melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: [64, 76] } }));
    for (const n of melody) {
      expect(n.midi).toBeGreaterThanOrEqual(64);
      expect(n.midi).toBeLessThanOrEqual(76);
    }
  });

  it("respects maxIntervalSemitones (chord-tone forcing off)", () => {
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      for (const cap of [3, 5, null] as const) {
        const { melody, profile } = run(
          constraints({ styleId, melody: { maxIntervalSemitones: cap, chordTonesOnStrongBeats: false, range: null } }),
        );
        const bound = Math.min(profile.melody.maxLeapSemitones, cap ?? 24);
        for (let i = 1; i < melody.length; i++) {
          expect(Math.abs(melody[i].midi - melody[i - 1].midi)).toBeLessThanOrEqual(bound);
        }
      }
    }
  });

  it("chordTonesOnStrongBeats forces 100% strong-beat chord tones", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { chords, melody } = run(
        constraints({ seed, melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: true, range: null } }),
      );
      const strong = melody.filter((n) => n.strongBeat);
      expect(strong.length).toBeGreaterThan(0);
      for (const n of strong) {
        expect(chordTonePcs(chords, n.slot).includes(mod12(n.midi)), `seed ${seed} slot ${n.slot}`).toBe(true);
      }
    }
  });

  it("straightRhythmsOnly forces zero syncopated onsets", () => {
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      const { melody } = run(
        constraints({ styleId, rhythm: { straightRhythmsOnly: true } }),
      );
      expect(melody.every((n) => n.syncopated === false)).toBe(true);
      expect(melody.every((n) => n.slot % 2 === 0)).toBe(true);
    }
  });

  it("notes are ascending by slot, non-overlapping, durationSlots >= 1", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { melody } = run(constraints({ seed }));
      expect(melody.length).toBeGreaterThan(0);
      for (let i = 0; i < melody.length; i++) {
        expect(melody[i].durationSlots).toBeGreaterThanOrEqual(1);
        if (i > 0) {
          expect(melody[i].slot).toBeGreaterThan(melody[i - 1].slot);
          expect(melody[i].slot).toBeGreaterThanOrEqual(melody[i - 1].slot + melody[i - 1].durationSlots);
        }
      }
    }
  });

  it("final note is a chord tone of the last chord (cadential)", () => {
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      for (const mode of ["major", "minor"] as EtudeMode[]) {
        for (let seed = 1; seed <= 8; seed++) {
          const { chords, melody } = run(constraints({ styleId, mode, seed }));
          const last = melody[melody.length - 1];
          expect(chordTonePcs(chords, last.slot).includes(mod12(last.midi))).toBe(true);
        }
      }
    }
  });

  it("velocity/strongBeat/syncopated fields derive from slot (no extra draws)", () => {
    const { melody } = run(constraints({}));
    for (const n of melody) {
      if (n.slot % 4 === 0) {
        expect(n.velocity).toBe(0.85);
        expect(n.strongBeat).toBe(true);
        expect(n.syncopated).toBe(false);
      } else if (n.slot % 2 === 0) {
        expect(n.velocity).toBe(0.65);
        expect(n.strongBeat).toBe(true);
        expect(n.syncopated).toBe(false);
      } else {
        expect(n.velocity).toBe(0.75);
        expect(n.strongBeat).toBe(false);
        expect(n.syncopated).toBe(true);
      }
    }
  });
});
