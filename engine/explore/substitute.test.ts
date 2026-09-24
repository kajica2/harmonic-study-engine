/**
 * engine/explore/substitute.test.ts - PRD-001 Phase 5 (checklist 2/3).
 *
 * Per-technique positives over Dm7-G7-Cmaj7 in C, the identical-skip
 * + rest/unknown arms, and the D47-pattern equivalence: annotate.ts
 * golden fixtures translated EtudeChord -> ChordCell pin IDENTICAL
 * claim/no-claim outcomes (same arithmetic, not new intervals).
 *
 * The dominant V7 -> I true positive (G7 admits Db7) is pinned HERE
 * so N2's triadic negative cannot be misread as "V-I never subtritones".
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { restCell } from "../compose/types";
import { substituteChord } from "./substitute";
import {
  isModalInterchange,
  isSecondaryDominant,
  isTritoneSub,
} from "./substitute";
import { drop2Gate, voiceLeadingGate } from "./voicelead";
import { annotateEtude } from "../pedagogy/annotate";
import { getStyleProfile } from "../styles/index";
import type { EtudeChord, EtudeConstraints } from "../etude/types";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

function namesOf(
  out: readonly { cell: ChordCell; technique: string }[],
  technique: string,
): string[] {
  return out.filter((c) => c.technique === technique).map((c) => c.cell.name);
}

describe("positives on Dm7-G7-Cmaj7 in C", () => {
  const Dm7 = cell(2, "m7");
  const G7 = cell(7, "dom7");
  const Cmaj7 = cell(0, "maj7");

  it("G7 -> Cmaj7 yields a Db7 tritone candidate (the dominant true positive)", () => {
    const out = substituteChord(G7, { next: Cmaj7, key: C_MAJOR });
    expect(namesOf(out, "tritone-sub")).toContain("Db7");
    const tri = out.find((c) => c.technique === "tritone-sub") as { conceptId: string | null; rationale: string };
    expect(tri.conceptId).toBe("tritone-sub");
    expect(tri.rationale).toContain("Db7");
    expect(tri.rationale).toContain("C");
  });

  it("Cmaj7 -> Dm7 yields an A7 secondary dominant (V of Dm)", () => {
    const out = substituteChord(Cmaj7, { next: Dm7, key: C_MAJOR });
    expect(namesOf(out, "secondary-dominant")).toContain("A7");
  });

  it("Dm7 -> G7 yields a Bb7 modal-interchange candidate", () => {
    const out = substituteChord(Dm7, { next: G7, key: C_MAJOR });
    expect(namesOf(out, "modal-interchange")).toContain("Bb7");
  });

  it("C -> D (whole step) yields a Db diminished passing chord", () => {
    const out = substituteChord(cell(0, "maj"), {
      next: cell(2, "maj"),
      key: C_MAJOR,
    });
    const passing = namesOf(out, "passing-diminished");
    expect(passing).toHaveLength(1);
    expect(passing[0]).toContain("dim7");
  });

  it("Dm7 yields diatonic-third neighbors (Fm7 above, Bm7 below), conceptId null", () => {
    const out = substituteChord(Dm7, { next: G7, key: C_MAJOR });
    const neighbors = out.filter((c) => c.technique === "diatonic-neighbor");
    expect(neighbors.map((c) => c.cell.name)).toEqual(
      expect.arrayContaining(["Fm7", "Bm7"]),
    );
    for (const n of neighbors) expect(n.conceptId).toBeNull();
  });
});

describe("honest arms", () => {
  it("the ORIGINAL cell is never in the output (A7 already V-of-Dm: no A7 candidate)", () => {
    const A7 = cell(9, "dom7");
    const out = substituteChord(A7, { next: cell(2, "m7"), key: C_MAJOR });
    for (const c of out) {
      expect(
        c.cell.rootPc === A7.rootPc && c.cell.qualitySymbol === A7.qualitySymbol,
      ).toBe(false);
    }
  });

  it("rests and unknown qualities yield []", () => {
    expect(
      substituteChord(restCell(), { next: cell(0, "maj7"), key: C_MAJOR }),
    ).toEqual([]);
    const unknown: ChordCell = {
      rootPc: 0,
      qualitySymbol: "nope",
      name: "Cnope",
      bassPc: null,
      confidence: 1,
      alternatives: [],
      isRest: false,
    };
    expect(
      substituteChord(unknown, { next: cell(0, "maj7"), key: C_MAJOR }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D47-pattern equivalence: annotate.ts goldens translated to ChordCells.
// Correct numerals are assigned per the triple's function in C major
// (the test constructs both sides from the same harmonic facts).
// ---------------------------------------------------------------------------

function echord(
  bar: number,
  numeral: string,
  rootPc: number,
  qualitySymbol: string,
  notes: number[],
): EtudeChord {
  return { bar, numeral, rootPc, qualitySymbol, name: `pc${rootPc}`, notes };
}

function etudeConstraints(bars: number): EtudeConstraints {
  return {
    version: 1,
    styleId: "jazz",
    key: 0,
    mode: "major",
    difficulty: 3,
    bars,
    tempo: null,
    seed: 1,
    harmony: { allowedQualities: null, allowedNumerals: null, startOn: null, endOn: null, requireChromaticism: false },
    melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: null },
    rhythm: { straightRhythmsOnly: false },
  };
}

function conceptsOf(chords: EtudeChord[]): string[] {
  const anns = annotateEtude(
    chords,
    [],
    getStyleProfile("jazz"),
    etudeConstraints(chords.length),
  );
  return anns.map((a) => a.conceptId).filter((c): c is string => c !== null);
}

describe("D47 equivalence with annotate.ts goldens", () => {
  it("tritone claim: (G7, Db7, Cmaj7) fires on both sides", () => {
    expect(isTritoneSub(cell(7, "dom7"), cell(1, "dom7"), cell(0, "maj7"), C_MAJOR)).toBe(true);
    expect(
      conceptsOf([echord(0, "bII7", 1, "dom7", [49, 53, 56, 60]), echord(1, "Imaj7", 0, "maj7", [48, 52, 55, 59])]),
    ).toContain("tritone-sub");
  });

  it("tritone no-claim: (G7, Db7, Am7) silent on both sides", () => {
    expect(isTritoneSub(cell(7, "dom7"), cell(1, "dom7"), cell(9, "m7"), C_MAJOR)).toBe(false);
    expect(
      conceptsOf([echord(0, "bII7", 1, "dom7", [49, 53, 56, 60]), echord(1, "vi7", 9, "m7", [57, 60, 64, 67])]),
    ).not.toContain("tritone-sub");
  });

  it("alt quality ports identically (G7alt-context Db7alt -> C)", () => {
    expect(isTritoneSub(cell(7, "alt"), cell(1, "alt"), cell(0, "maj7"), C_MAJOR)).toBe(true);
    expect(
      conceptsOf([echord(0, "bII7alt", 1, "alt", [49, 53, 56, 60]), echord(1, "Imaj7", 0, "maj7", [48, 52, 55, 59])]),
    ).toContain("tritone-sub");
  });

  it("secdom claim/no-claim agree (A7->Dm fires; C7->Dm silent)", () => {
    expect(isSecondaryDominant(cell(9, "dom7"), cell(2, "m7"), C_MAJOR)).toBe(true);
    expect(
      conceptsOf([echord(0, "VI7", 9, "dom7", [57, 61, 64, 67]), echord(1, "ii7", 2, "m7", [50, 53, 57, 60])]),
    ).toContain("secondary-dominant");
    expect(isSecondaryDominant(cell(0, "dom7"), cell(2, "m7"), C_MAJOR)).toBe(false);
    expect(
      conceptsOf([echord(0, "I7", 0, "dom7", [48, 52, 55, 58]), echord(1, "ii7", 2, "m7", [50, 53, 57, 60])]),
    ).not.toContain("secondary-dominant");
  });

  it("modal claim/no-claim agree (Bb7 fires; Fm7 silent)", () => {
    expect(isModalInterchange(cell(10, "dom7"), false, C_MAJOR)).toBe(true);
    expect(
      conceptsOf([echord(0, "bVII7", 10, "dom7", [58, 62, 65, 68]), echord(1, "Imaj7", 0, "maj7", [48, 52, 55, 59])]),
    ).toContain("modal-interchange");
    expect(isModalInterchange(cell(5, "m7"), false, C_MAJOR)).toBe(false);
    expect(
      conceptsOf([echord(0, "iv7", 5, "m7", [53, 57, 60, 64]), echord(1, "Imaj7", 0, "maj7", [48, 52, 55, 59])]),
    ).not.toContain("modal-interchange");
  });

  it("voice-leading + drop-2 thresholds agree on realized pitches", () => {
    const smooth: EtudeChord[] = [
      echord(0, "Imaj7", 0, "maj7", [48, 52, 55, 59]),
      echord(1, "Imaj7", 0, "maj7", [48, 52, 55, 60]),
    ];
    expect(voiceLeadingGate([[48, 52, 55, 59], [48, 52, 55, 60]])).toBe(true);
    expect(conceptsOf(smooth)).toContain("voice-leading");
    expect(drop2Gate([43, 48, 52, 59])).toBe(true);
    expect(
      conceptsOf([echord(0, "I", 0, "maj", [43, 48, 52, 59])]),
    ).toContain("drop-2");
    expect(drop2Gate([60, 64, 67, 71])).toBe(false);
    expect(
      conceptsOf([echord(0, "I", 0, "maj", [60, 64, 67, 71])]),
    ).not.toContain("drop-2");
  });
});
