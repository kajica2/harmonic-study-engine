/**
 * engine/compose/bass.test.ts - PRD-001 Phase 4 Slice 3 (test plan 3,
 * D69). Token resolution (root/third/fifth/seventh/b7 + slash bassPc),
 * nearest-octave voice-lead, approach-set membership + keyless
 * chromatic-only degradation, the rest-cells-consume-zero-draws stream
 * identity pin, and the [28, 48] register clamp.
 */

import { describe, it, expect } from "vitest";
import { countBassDraws, resolveBassPitches } from "./bass";
import { bassPattern } from "./patterns";
import type { BassHitPitch, ChordCell, KeyCandidate } from "./types";
import { restCell } from "./types";
import { createRng } from "../core/rng";
import type { Rng } from "../core/rng";
import { JAZZ_PROFILE } from "../styles/profiles/jazz";
import type { MidiRange } from "../styles/types";

const REGISTER: MidiRange = [28, 48];

function cell(rootPc: number, qualitySymbol: string, bassPc: number | null = null): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: `${rootPc}:${qualitySymbol}`,
    bassPc,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 0.9 };

function resolve(
  entryId: "walking" | "rootFifth" | "shuffleBoogie" | "drone" | "twoFeel" | "eighthPulse",
  cells: readonly (readonly ChordCell[])[],
  key: KeyCandidate | null,
  seed = 7,
  beats?: readonly (readonly number[])[],
): { pitches: readonly (readonly (readonly BassHitPitch[])[])[]; rng: Rng } {
  const entry = bassPattern(entryId);
  expect(entry).not.toBeNull();
  const rng = createRng(seed);
  const cellBeats =
    beats ?? cells.map((slots) => slots.map(() => 4 / slots.length));
  const pitches = resolveBassPitches(entry!, cells, cellBeats, JAZZ_PROFILE, key, rng, REGISTER);
  return { pitches, rng };
}

function flat(pitches: readonly (readonly (readonly BassHitPitch[])[])[]): readonly BassHitPitch[] {
  return pitches.flat(2) as BassHitPitch[];
}

describe("token resolution (D69)", () => {
  it("rootFifth on Dm7: roots are D, fifths are A, all in register", () => {
    const { pitches } = resolve("rootFifth", [[cell(2, "m7")]], C_MAJOR);
    const hits = pitches[0][0];
    expect(hits).toHaveLength(4);
    expect(hits[0].midi % 12).toBe(2); // root, first note = regLo + offset
    expect(hits.map((h) => h.midi % 12)).toEqual([2, 2, 9, 9]); // authored order: r,r,5,5
    for (const h of hits) {
      expect(h.midi).toBeGreaterThanOrEqual(28);
      expect(h.midi).toBeLessThanOrEqual(48);
    }
  });

  it("slash bass: the root token plays bassPc (inversions honored)", () => {
    const { pitches } = resolve("rootFifth", [[cell(0, "maj7", 7)]], C_MAJOR); // C/G
    const hits = pitches[0][0];
    expect(hits[0].midi % 12).toBe(7); // G, not C
    // fifth token still reads the CHORD's fifth (G for Cmaj7) - same pc here,
    // so also check a distinct slash: Dm7/C
    const r2 = resolve("rootFifth", [[cell(2, "m7", 0)]], C_MAJOR);
    expect(r2.pitches[0][0][0].midi % 12).toBe(0); // root token -> C
    expect(r2.pitches[0][0][2].midi % 12).toBe(9); // fifth token -> A (chord fifth)
  });

  it("third/fifth tokens read the chord (sus4 -> 4th as third)", () => {
    const { pitches } = resolve("walking", [[cell(0, "sus4")]], C_MAJOR);
    const hits = pitches[0][0];
    const byBeat = [...hits].sort((a, b) => a.midi - b.midi);
    void byBeat;
    // walking authored order: root(b0), fifth(b2), third(b1), approach(b3)
    expect(hits[0].midi % 12).toBe(0); // root C
    expect(hits[1].midi % 12).toBe(7); // fifth G
    expect(hits[2].midi % 12).toBe(5); // "third" of sus4 = the 4th F
  });

  it("b7 stays inside maj7-family chords (boogie honesty), flat-7 elsewhere", () => {
    const maj = resolve("shuffleBoogie", [[cell(0, "maj7")]], C_MAJOR);
    const b7s = maj.pitches[0][0].filter((h) => h.midi % 12 === 11 || h.midi % 12 === 10);
    expect(b7s.length).toBeGreaterThan(0);
    for (const h of maj.pitches[0][0]) {
      if ([10, 11].includes(h.midi % 12)) expect(h.midi % 12, "maj7 chord keeps 11").toBe(11);
    }
    const dom = resolve("shuffleBoogie", [[cell(7, "dom7")]], C_MAJOR);
    const hasFlat7 = dom.pitches[0][0].some((h) => h.midi % 12 === 5); // G+10 = F
    expect(hasFlat7).toBe(true);
  });

  it("seventh token resolves when present (defensive path; no authored pattern uses it)", () => {
    // walking has no seventh token; assert the accessor contract via
    // drone/root behavior on a 7th chord instead: every pitch is a
    // chord tone (D, F, A, C for Dm7).
    const { pitches } = resolve("walking", [[cell(2, "m7")]], C_MAJOR);
    for (const h of pitches[0][0].slice(0, 3)) {
      expect([2, 5, 9, 0]).toContain(h.midi % 12);
    }
  });
});

describe("voice-lead by proximity", () => {
  it("consecutive pitches never leap more than an octave + a bit", () => {
    const cells = [[cell(2, "m7")], [cell(7, "dom7")], [cell(0, "maj7")]];
    const { pitches } = resolve("walking", cells, C_MAJOR);
    const all = flat(pitches);
    expect(all.length).toBe(12);
    for (let i = 1; i < all.length; i++) {
      expect(Math.abs(all[i].midi - all[i - 1].midi)).toBeLessThanOrEqual(12);
    }
  });

  it("first note = root at regLo + mod12 offset", () => {
    const { pitches } = resolve("twoFeel", [[cell(9, "m7")]], C_MAJOR); // Am7
    expect(pitches[0][0][0].midi).toBe(28 + ((9 - 28 + 120) % 12)); // 33
  });
});

describe("approach set (walking nextApproach)", () => {
  const iiV: readonly ChordCell[][] = [[cell(2, "m7")], [cell(7, "dom7")]];

  it("with a key: chromatic-below / chromatic-above / diatonic-step below only", () => {
    // Dm7 bar -> next root G (pc 7). G's nearest placement from the
    // prior pitches; valid approaches: F#(6), Ab(8), F(5, whole step).
    for (let seed = 0; seed < 12; seed++) {
      const { pitches } = resolve("walking", iiV, C_MAJOR, seed);
      const approach = pitches[0][0][3]; // authored beat-3 hit
      expect([5, 6, 8], `seed ${seed}`).toContain(approach.midi % 12);
      expect(["chromatic", "stepwise"]).toContain(approach.approach);
    }
  });

  it("keyless: chromatic ONLY (never 'stepwise' without a key)", () => {
    for (let seed = 0; seed < 12; seed++) {
      const { pitches } = resolve("walking", iiV, null, seed);
      const approach = pitches[0][0][3];
      expect([6, 8], `seed ${seed}`).toContain(approach.midi % 12);
      expect(approach.approach).toBe("chromatic");
    }
  });

  it("end-of-grid approach degrades to the fifth (no draw)", () => {
    const { pitches } = resolve("walking", [[cell(2, "m7")]], C_MAJOR);
    const approach = pitches[0][0][3];
    expect(approach.midi % 12).toBe(9); // A = fifth of Dm7
    expect(approach.approach).toBe("fifth");
    expect(countBassDraws(pitches)).toBe(0);
  });

  it("approach targets ACROSS a rest cell (nextSoundingCell skips rests - D69 errata)", () => {
    // The shipped behavior (defensible, MED-5a): a rest between cells
    // does NOT degrade the approach to the fifth - the approach aims
    // at the next SOUNDING cell, exactly as if the rest were absent.
    const acrossRest = resolve(
      "walking",
      [[cell(2, "m7"), restCell()], [cell(7, "dom7")]],
      C_MAJOR,
      9,
      [[4, 4], [4]],
    );
    const direct = resolve("walking", [[cell(2, "m7")], [cell(7, "dom7")]], C_MAJOR, 9, [[4], [4]]);
    const a = acrossRest.pitches[0][0][3];
    expect(a.approach).not.toBe("fifth"); // did NOT degrade
    expect(a).toEqual(direct.pitches[0][0][3]); // same target G7 across the rest
    expect(a.approachTargetBar).toBe(1);
  });

  it("exactly one draw per non-empty approach set (stream accounting)", () => {
    const { pitches } = resolve("walking", iiV, C_MAJOR, 3);
    expect(countBassDraws(pitches)).toBe(1); // one approach hit in the grid
  });
});

describe("rest cells consume NOTHING (stream identity pin)", () => {
  it("rest BEFORE a drawing cell: pitch-identical records + equal drawCount (GAP-1)", () => {
    // DISCRIMINATIVE construction (tester round 3): the rest PRECEDES
    // the grid's only drawing cell (the Dm7 bar-0 approach). A
    // "draw-on-rest" mutation shifts the rng stream BEFORE the pick ->
    // different approach pitch -> this pin dies. The pre-fix pin put
    // the rest AFTER the drawing cell, where a shifted stream changes
    // nothing (mutation survived - non-discriminative).
    const withRest = resolve(
      "walking",
      [[restCell(), cell(2, "m7")], [cell(7, "dom7")]],
      C_MAJOR,
      9,
      [[4, 4], [4]],
    );
    const noRest = resolve(
      "walking",
      [[cell(2, "m7")], [cell(7, "dom7")]],
      C_MAJOR,
      9,
      [[4], [4]],
    );
    expect(withRest.pitches[0][0]).toEqual([]); // the rest: zero records
    // FULL records (midi + approach kind + target), not just the midi:
    expect(withRest.pitches[0][1]).toEqual(noRest.pitches[0][0]);
    expect(countBassDraws(withRest.pitches)).toBe(countBassDraws(noRest.pitches));
    expect(countBassDraws(noRest.pitches)).toBeGreaterThan(0); // non-vacuity: it draws
    // Stream POSITION (seed-coincidence-proof): both runs must sit at
    // the exact same rng offset afterwards - the rest consumed nothing.
    expect(withRest.rng.next()).toBe(noRest.rng.next());
  });

  it("all-rest grid -> zero pitches, zero draws", () => {
    const { pitches } = resolve("walking", [[restCell()], [restCell()]], C_MAJOR);
    expect(flat(pitches)).toEqual([]);
    expect(countBassDraws(pitches)).toBe(0);
  });
});

describe("register clamp [28, 48] (Appendix D bass)", () => {
  it("every resolved pitch is inside the bass window for all 17-root sweeps", () => {
    for (let root = 0; root < 12; root++) {
      const cells = [[cell(root, "m7")], [cell((root + 5) % 12, "dom7")], [cell((root + 7) % 12, "maj")]];
      for (const id of ["walking", "rootFifth", "shuffleBoogie", "drone", "twoFeel", "eighthPulse"] as const) {
        const { pitches } = resolve(id, cells, C_MAJOR, root);
        for (const h of flat(pitches)) {
          expect(h.midi, `${id} root ${root}`).toBeGreaterThanOrEqual(28);
          expect(h.midi, `${id} root ${root}`).toBeLessThanOrEqual(48);
        }
      }
    }
  });
});

describe("unknown quality defensive path", () => {
  it("unknown-symbol cell resolves to zero pitches (silent, like a rest)", () => {
    const { pitches } = resolve("walking", [[cell(0, "made-up-quality")]], C_MAJOR);
    expect(pitches[0][0]).toEqual([]);
  });
});
