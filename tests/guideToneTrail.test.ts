import { describe, it, expect } from "vitest";
import {
  emptyTrail,
  accumulateTrail,
  transitionsMissed,
  guideToneAccuracy,
  tallyGuideToneNotes,
  type GuideToneTrail,
} from "../src/lib/guideToneTrail";
import { classifyGuideTone } from "../src/lib/guideTones";

// Cm7 in root position: [C4, Eb4, G4, Bb4] — 3rd (Eb) and 7th (Bb)
// are the guide tones.
const CM7 = [60, 63, 67, 70];

describe("emptyTrail / accumulateTrail", () => {
  it("starts empty and idempotently re-empties", () => {
    const t = emptyTrail();
    expect(t).toEqual({ totalNotes: 0, guideHits: 0, chordToneHits: 0, offNotes: 0 });
    expect(emptyTrail()).toEqual(t);
  });

  it("counts a landed 3rd as a guide hit", () => {
    const trail = accumulateTrail(emptyTrail(), classifyGuideTone(63, CM7));
    expect(trail).toEqual({ totalNotes: 1, guideHits: 1, chordToneHits: 0, offNotes: 0 });
  });

  it("counts a landed 7th as a guide hit", () => {
    const trail = accumulateTrail(emptyTrail(), classifyGuideTone(70, CM7));
    expect(trail.guideHits).toBe(1);
    expect(trail.totalNotes).toBe(1);
  });

  it("counts a root/5th (chord tone, not a guide) as a chord-tone hit", () => {
    const onRoot = accumulateTrail(emptyTrail(), classifyGuideTone(60, CM7));
    const onFifth = accumulateTrail(onRoot, classifyGuideTone(67, CM7));
    expect(onFifth.guideHits).toBe(0);
    expect(onFifth.chordToneHits).toBe(2);
  });

  it("counts an outside note as an off / missed-guide-tone note", () => {
    const trail = accumulateTrail(emptyTrail(), classifyGuideTone(65, CM7)); // F — not in Cm7
    expect(trail.offNotes).toBe(1);
    expect(trail.chordToneHits).toBe(0);
  });

  it("folds multiple matches in order", () => {
    const notes = [
      classifyGuideTone(63, CM7), // 3rd → hit
      classifyGuideTone(62, CM7), // D — off
      classifyGuideTone(70, CM7), // 7th → hit
      classifyGuideTone(60, CM7), // root → chord tone
    ];
    const trail = notes.reduce(accumulateTrail, emptyTrail());
    expect(trail).toEqual({ totalNotes: 4, guideHits: 2, chordToneHits: 1, offNotes: 1 });
  });

  it("counts an octave-shifted 3rd as a guide hit (pitch-class matching)", () => {
    const trail = accumulateTrail(emptyTrail(), classifyGuideTone(75, CM7)); // Eb5
    expect(trail.guideHits).toBe(1);
  });
});

describe("transitionsMissed / guideToneAccuracy", () => {
  const trail: GuideToneTrail = { totalNotes: 4, guideHits: 2, chordToneHits: 1, offNotes: 1 };

  it("treats every non-guide note-on as a miss", () => {
    expect(transitionsMissed(trail)).toBe(2);
  });

  it("computes accuracy as hits / total, rounded", () => {
    expect(guideToneAccuracy(trail)).toBe(0.5);
  });

  it("returns null when no notes were played", () => {
    expect(guideToneAccuracy(emptyTrail())).toBeNull();
  });

  it("is a perfect 1.0 when every note lands on a guide tone", () => {
    const perfect = accumulateTrail(
      accumulateTrail(emptyTrail(), classifyGuideTone(63, CM7)),
      classifyGuideTone(70, CM7),
    );
    expect(guideToneAccuracy(perfect)).toBe(1);
  });
});

describe("tallyGuideToneNotes", () => {
  it("classifies a raw (midi, chordNotes) batch end to end", () => {
    const tally = tallyGuideToneNotes([
      { midi: 63, chordNotes: CM7 }, // 3rd → guide hit
      { midi: 60, chordNotes: CM7 }, // root → chord tone
      { midi: 64, chordNotes: CM7 }, // E — off (E natural vs Eb)
      { midi: 70, chordNotes: CM7 }, // 7th → guide hit
    ]);
    expect(tally).toEqual({ totalNotes: 4, guideHits: 2, chordToneHits: 1, offNotes: 1 });
  });
});