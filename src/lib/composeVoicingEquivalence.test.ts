/**
 * src/lib/composeVoicingEquivalence.test.ts - PRD-001 Phase 4 Slice 3
 * (D47 promise, D68 equivalence pin).
 *
 * WHAT THIS PINS: on the narrow surface where engine/compose/voicing.ts
 * and the FROZEN src/lib/theory.ts `applyVoiceLeading` share semantics -
 * close style, full tones, inversionAware, equal voice counts - the
 * sequential engine agrees with the theory voice-leader NOTE-FOR-NOTE
 * on a curated fixture (I->ii, vi->ii, V7->I: every transition where
 * the two algorithms' bass semantics coincide). theory.ts is NOT
 * edited and gains no production callers; this test is its only new
 * importer.
 *
 * WHAT THIS DELIBERATELY DOES NOT PIN (stated so nobody "fixes" the
 * divergence): drop2/quartal/spread/block are OUT of the equivalence
 * surface (theory has no such concept). And theory RE-ANCHORS the bass
 * to the target's given bottom while the engine voice-leads EVERY
 * voice including the bottom (D68 rule 3) - so e.g. ii->V diverges by
 * design. The divergence is the documented surface boundary, not a
 * bug.
 */

import { describe, it, expect } from "vitest";
import { applyVoiceLeading } from "./theory";
import { firstVoicing, voiceSequence } from "../../engine/compose/voicing";
import { createRng } from "../../engine/core/rng";
import { JAZZ_PROFILE } from "../../engine/styles/profiles/jazz";
import type { StyleProfile } from "../../engine/styles/types";
import { type ChordCell } from "../../engine/compose/types";

const REGISTER = [60, 72] as const;

/** The equivalence-surface profile: close, full tones, inversionAware,
 *  spreadBias 0 (anchor == regLo, so firstVoicing is the plain
 *  root-position builder), rootlessRate 0 (zero draws - theory has no
 *  rng surface to match). */
const SURFACE_PROFILE: StyleProfile = {
  ...JAZZ_PROFILE,
  voicing: {
    ...JAZZ_PROFILE.voicing,
    style: "close",
    rootlessRate: 0,
    spreadBias: 0,
    inversionAwareness: true,
    registers: { ...JAZZ_PROFILE.voicing.registers, chords: REGISTER },
  },
};

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: `${rootPc}:${qualitySymbol}`,
    bassPc: null,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

/** Engine's own root-position builder for a target chord (the SAME
 *  material theory receives as `targetNotes`). */
function builderStack(rootPc: number, qualitySymbol: string): number[] {
  const r = voiceSequence({
    cells: [[cell(rootPc, qualitySymbol)]],
    profile: SURFACE_PROFILE,
    rng: createRng(0),
    allowRootless: false,
    register: REGISTER,
  });
  return [...(r.voicings[0][0] as number[])];
}

function enginePair(from: ChordCell, to: ChordCell): { prev: number[]; next: number[] } {
  const r = voiceSequence({
    cells: [[from], [to]],
    profile: SURFACE_PROFILE,
    rng: createRng(0),
    allowRootless: false,
    register: REGISTER,
  });
  return {
    prev: [...(r.voicings[0][0] as number[])],
    next: [...(r.voicings[1][0] as number[])],
  };
}

describe("D47 equivalence pin: engine(close) vs theory.applyVoiceLeading", () => {
  it("first-chord placement matches the root-position builder (no rng surface)", () => {
    const direct = firstVoicing(2, [5, 9, 0], 10, SURFACE_PROFILE, REGISTER);
    expect([...direct].sort((a, b) => a - b)).toEqual(builderStack(2, "m7"));
  });

  const transitions: readonly { name: string; from: ChordCell; to: ChordCell }[] = [
    { name: "I -> ii (Cmaj7 -> Dm7)", from: cell(0, "maj7"), to: cell(2, "m7") },
    { name: "vi -> ii (Am7 -> Dm7)", from: cell(9, "m7"), to: cell(2, "m7") },
    { name: "V7 -> I (G7 -> Cmaj7)", from: cell(7, "dom7"), to: cell(0, "maj7") },
    { name: "IV -> V (Fmaj7 -> G7)", from: cell(5, "maj7"), to: cell(7, "dom7") },
    { name: "ii -> V (Dm7 -> G7, compact-register coincidence)", from: cell(2, "m7"), to: cell(7, "dom7") },
  ];

  for (const { name, from, to } of transitions) {
    it(`${name}: note-for-note agreement on the shared surface`, () => {
      const { prev, next } = enginePair(from, to);
      const target = builderStack(to.rootPc, to.qualitySymbol);
      expect(applyVoiceLeading(prev, target)).toEqual(next);
    });
  }

  it("documented divergence in a wide register (theory re-anchors the bass, the engine leads it)", () => {
    // [48, 84]: the root-position builder does NOT clamp, so theory
    // pins its bass to G (55) while the engine keeps the bottom voice
    // on D (50). Same pcs, different bass - the documented surface
    // boundary (D68 rule 3 vs theory's target-bass semantics).
    const wide: StyleProfile = {
      ...SURFACE_PROFILE,
      voicing: {
        ...SURFACE_PROFILE.voicing,
        registers: { ...SURFACE_PROFILE.voicing.registers, chords: [48, 84] },
      },
    };
    const r = voiceSequence({
      cells: [[cell(2, "m7")], [cell(7, "dom7")]],
      profile: wide,
      rng: createRng(0),
      allowRootless: false,
      register: [48, 84],
    });
    const prev = [...(r.voicings[0][0] as number[])];
    const next = [...(r.voicings[1][0] as number[])];
    const target = [...firstVoicing(7, [11, 2, 5], 10, wide, [48, 84])];
    const theoryOut = applyVoiceLeading(prev, target);
    // The engine keeps the bottom voice-LEAD (D68 rule 3); theory pins
    // it to the target's given bass. Assert the SHAPE of the
    // difference, not just inequality: same pcs, different bottom.
    expect([...theoryOut].map((p) => p % 12).sort()).toEqual(
      [...next].map((p) => p % 12).sort(),
    );
    expect(theoryOut[0]).toBe(target[0]); // theory bass = target bass (G)
    expect(next[0]).not.toBe(target[0]); // engine bass = led bass (D)
    expect(theoryOut).not.toEqual(next);
  });
});
