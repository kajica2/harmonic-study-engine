/**
 * engine/explore/truthfulness.test.ts - PRD-001 Phase 5 (D99, checklist 2).
 *
 * THE honesty suite (PHASE-3-01 + ADR-013 + ADR-017 lineage). Each
 * negative names its fixture + the forbidden token, and each is
 * MUTATION-PROVEN: removing the cited guard flips the test red (the
 * guard is named in the test body so the reviewer can verify by
 * deletion). Written RED-FIRST: this file landed before substitute.ts
 * (every import below failed until the predicates existed).
 *
 * Interpretation notes (read before "fixing" a negative):
 * - N2 uses a TRIADIC V-I (G -> C). A dominant V7 -> I legitimately
 *   ADMITS a Db7 tritone candidate (shared guide tones) - that true
 *   positive is pinned in substitute.test.ts, not here.
 * - N4's iv7/III7 exclusion follows the ported annotate rule-4
 *   arithmetic (root-diatonic chords never fire modal-interchange),
 *   NOT the etude pass-4b prose pool (see substitute.ts header).
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import type { ChordCell, KeyCandidate } from "../compose/types";
import {
  substituteChord,
  isTritoneSub,
  isSecondaryDominant,
  isModalInterchange,
} from "./substitute";
import { isExtension } from "./expand";
import { voiceLeadingGate, drop2Gate } from "./voicelead";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

function techniquesOf(
  out: readonly { technique: string }[],
): readonly string[] {
  return out.map((c) => c.technique);
}

describe("N1: flat-12pc -> no tritone-sub (guard: tonic-family resolution)", () => {
  it("chromatic dom7 run: zero tritone-sub at every step", () => {
    for (let p = 0; p < 12; p++) {
      const orig = cell(p, "dom7");
      const next = cell((p + 1) % 12, "dom7");
      const cand = cell((p + 6) % 12, "dom7");
      // A dom7 next is never tonic-family, so the descent check can
      // never complete - structural zero across the whole octave.
      expect(isTritoneSub(orig, cand, next, C_MAJOR)).toBe(false);
    }
  });

  it("trap pair G7 -> C7: semitone descent holds, tonic-family fails", () => {
    // MUTATION: deleting the isTonicFamily conjunct in isTritoneSub
    // flips this to true (Db7 over G7 stepping to C7).
    const orig = cell(7, "dom7");
    const cand = cell(1, "dom7");
    const next = cell(0, "dom7");
    expect(isTritoneSub(orig, cand, next, C_MAJOR)).toBe(false);
    const out = substituteChord(orig, { next, key: C_MAJOR });
    expect(techniquesOf(out)).not.toContain("tritone-sub");
  });
});

describe("N2: triadic V-I, no bII7 -> no tritone-sub (guard: orig must be dominant)", () => {
  it("G -> C triads admit no tritone candidate", () => {
    // MUTATION: deleting the orig-dominant requirement in
    // substituteChord/isTritoneSub flips this (Db7 would be emitted
    // with a guide-tone rationale naming a tritone G triad lacks).
    const orig = cell(7, "maj");
    const next = cell(0, "maj");
    expect(isTritoneSub(orig, cell(1, "dom7"), next, C_MAJOR)).toBe(false);
    const outG = substituteChord(orig, { next, key: C_MAJOR });
    expect(techniquesOf(outG)).not.toContain("tritone-sub");
    const outC = substituteChord(next, { next: null, key: C_MAJOR });
    expect(techniquesOf(outC)).not.toContain("tritone-sub");
  });
});

describe("N3: non-fifth dominant -> no secondary-dominant (guard: root+5 == next)", () => {
  it("C7 -> Dm7: a fifth above C is F, not D", () => {
    // MUTATION: deleting the mod12(cand.root+5) == next.root
    // conjunct flips the predicate to true.
    expect(isSecondaryDominant(cell(0, "dom7"), cell(2, "m7"), C_MAJOR)).toBe(
      false,
    );
  });

  it("G7 -> Cmaj7 emits no secdom (guard: candidate degree != V port)", () => {
    // V-of-tonic is functional V-I, not secondary. MUTATION: deleting
    // the key-dominant-root exclusion flips this (G7 as "V of C").
    const out = substituteChord(cell(7, "dom7"), {
      next: cell(0, "maj7"),
      key: C_MAJOR,
    });
    expect(techniquesOf(out)).not.toContain("secondary-dominant");
  });
});

describe("N4: diatonic candidate -> no modal-interchange (guard: residual non-diatonic root)", () => {
  it("Fm7 in C major is diatonic-rooted: never modal", () => {
    // MUTATION: deleting the diatonic-membership check in
    // isModalInterchange flips this to true.
    expect(isModalInterchange(cell(5, "m7"), false, C_MAJOR)).toBe(false);
  });

  it("claimed-by-above suppresses the residual (tritone/secdom precedence)", () => {
    // MUTATION: deleting the claimedByAbove early-out flips this.
    expect(isModalInterchange(cell(1, "dom7"), true, C_MAJOR)).toBe(false);
  });

  it("emitted modal candidates are all non-diatonic-rooted; neighbors never modal", () => {
    const out = substituteChord(cell(2, "m7"), {
      next: cell(7, "dom7"),
      key: C_MAJOR,
    });
    const diatonic = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const c of out) {
      if (c.technique === "modal-interchange") {
        expect(diatonic.has(c.cell.rootPc)).toBe(false);
      }
      if (c.technique === "diatonic-neighbor") {
        expect(diatonic.has(c.cell.rootPc)).toBe(true);
      }
    }
    // The pool really fired (else this would pin nothing).
    expect(techniquesOf(out)).toContain("modal-interchange");
  });
});

describe("N5: triad->triad -> no extension (guard: strict mod12 superset, same root)", () => {
  it("same-root non-superset is not an extension (Cmin vs Cmaj)", () => {
    // MUTATION: deleting the superset conjunct flips this to true.
    expect(isExtension(cell(0, "min"), cell(0, "maj"))).toBe(false);
  });

  it("shrinking is not an extension (Cmaj9 -> Cmaj triad)", () => {
    expect(isExtension(cell(0, "maj9"), cell(0, "maj"))).toBe(false);
  });

  it("identity is not an extension (strictness guard)", () => {
    // MUTATION: relaxing strict superset to subset-or-equal flips this.
    expect(isExtension(cell(0, "maj"), cell(0, "maj"))).toBe(false);
  });

  it("different roots never extend (Cmaj -> Dmaj)", () => {
    expect(isExtension(cell(0, "maj"), cell(2, "maj"))).toBe(false);
  });
});

describe("N6: style names without realized data -> no voice-leading/drop-2", () => {
  it("leapy voicings fail the voice-leading gate (mean motion 5 > 4)", () => {
    // MUTATION: raising the <= 4 threshold (or dropping the mean)
    // flips this to true.
    expect(
      voiceLeadingGate([
        [40, 52, 64, 76],
        [45, 57, 69, 81],
      ]),
    ).toBe(false);
  });

  it("close tetrads fail the drop-2 gate (gap 4 < 7)", () => {
    // MUTATION: lowering the >= 7 gap flips this to true.
    expect(drop2Gate([60, 64, 67, 71])).toBe(false);
  });

  it("positive controls: smooth motion + true drop-2 shape pass", () => {
    expect(
      voiceLeadingGate([
        [48, 52, 55, 59],
        [48, 52, 55, 60],
      ]),
    ).toBe(true);
    expect(drop2Gate([43, 48, 52, 59])).toBe(true);
  });
});
