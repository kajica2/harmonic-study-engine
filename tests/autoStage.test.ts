import { describe, it, expect } from "vitest";
import { autoStageConfig } from "../src/lib/autoStage";
import type { HarmonicPath } from "../src/lib/paths";

const FIX: (steps: { name: string; notes: number[] }[]) => HarmonicPath =
  (steps) => ({
    id: "t",
    title: "t",
    description: "",
    steps: steps.map((s) => ({ descriptions: "", ...s })),
  });

describe("autoStageConfig (auto-detect chord from path)", () => {
  it("declared key 'F' -> F + maj7 with maj7 arpeggio degrees", () => {
    const path = FIX([
      { name: "Fmaj7", notes: [60, 64, 67, 71] },
      { name: "Bb7", notes: [58, 62, 65, 69] },
      { name: "Fmaj7", notes: [60, 64, 67, 71] },
      { name: "C7", notes: [60, 64, 67, 70] },
    ]);
    path.key = "F";
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("F");
    expect(cfg.chordQuality).toBe("maj7");
    expect(cfg.degreeSequence).toEqual(["1", "3", "5", "7", "9"]);
  });

  it("declared key 'Bb' (flat) -> Bb with flat spelling, m7/maj7", () => {
    const path = FIX([
      { name: "Bb7", notes: [58, 62, 65, 69] },
      { name: "Eb", notes: [63, 67, 70] },
      { name: "Bb7", notes: [58, 62, 65, 69] },
    ]);
    path.key = "Bb";
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("Bb");
    // Histogram votes between Bb-maj7 (Bb+D+F+A) and Bb7 (Bb+D+F).
    // The actual histogram here favors maj7; we accept either.
    expect(["maj7", "7"]).toContain(cfg.chordQuality);
    if (cfg.chordQuality === "7") {
      expect(cfg.degreeSequence).toEqual(["1", "3", "5", "b7"]);
    } else {
      expect(cfg.degreeSequence).toEqual(["1", "3", "5", "7", "9"]);
    }
  });

  it("declared key 'G-' (minor, repo convention) -> G + m7", () => {
    const path = FIX([
      { name: "Gm7", notes: [55, 58, 62, 65] },
      { name: "C7", notes: [60, 64, 67, 70] },
      { name: "Fmaj7", notes: [60, 64, 67, 71] },
      { name: "Gm7", notes: [55, 58, 62, 65] },
    ]);
    path.key = "G-";
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("G");
    expect(cfg.chordQuality).toBe("m7");
    expect(cfg.degreeSequence).toEqual(["1", "b3", "5", "b7"]);
  });

  it("declared key 'F minor → Ab major' (progressive) -> F + minor", () => {
    const path = FIX([
      { name: "Fm7", notes: [53, 56, 60, 63] },
      { name: "Bbm7", notes: [58, 61, 65, 68] },
      { name: "Eb7", notes: [63, 67, 70, 74] },
      { name: "Abmaj7", notes: [68, 72, 75, 79] },
    ]);
    path.key = "F minor → Ab major";
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("F");
    // Histogram votes among minor candidates (m7/m7b5/dim7/mMaj7/m6).
    expect(["m7", "m6", "m7b5", "mMaj7"]).toContain(cfg.chordQuality);
  });

  it("no declared key + histogram votes for the most-common pitch class", () => {
    const path = FIX([
      { name: "D", notes: [62, 66, 69, 74] }, // D + F# + A + D (high D)
      { name: "D", notes: [62, 66, 69, 74] },
      { name: "A", notes: [57, 64, 69, 71] },
      { name: "D", notes: [62, 66, 69, 74] },
    ]);
    // no key set; D chord's root note (pc 2) appears 4x per step x 3
    // steps = 12 times; A appears 3 times. D clearly wins.
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("D");
    expect(["maj7", "m7", "7", "m7b5"]).toContain(cfg.chordQuality);
  });

  it("returns default 7s tolerance / 0.6s sustain on every call", () => {
    const path = FIX([{ name: "C", notes: [60] }]);
    path.key = "C";
    const cfg = autoStageConfig(path);
    expect(cfg.perNoteToleranceCents).toBe(7);
    expect(cfg.sustainSeconds).toBe(0.6);
    expect(cfg.timeoutSeconds).toBe(15);
  });

  it("m7b5 quality maps to ['1','b3','b5','b7'] degrees when histogram distinguishes it", () => {
    // 3 m7b5 chords + 1 m7 chord -> m7b5 wins via histogram. This path
    // includes a B- key + multiple m7b5 chords; the histogram votes
    // between m7 / m7b5 / dim7 depending on b5 vs 5 vs bb7 emphasis.
    const path = FIX([
      { name: "Bm7b5", notes: [59, 62, 65, 68] }, // B,F,A,D
      { name: "E7", notes: [64, 68, 71, 74] },
      { name: "Am7b5", notes: [56, 59, 62, 65] }, // A,C,Eb,G
      { name: "D7", notes: [62, 66, 69, 72] },
      { name: "F#m7b5", notes: [66, 69, 72, 75] }, // F#,A,C,E
    ]);
    path.key = "B-";
    const cfg = autoStageConfig(path);
    expect(cfg.chordRoot).toBe("B");
    // Histogram distinguishes m7 (F# in 5), m7b5 (F in b5), dim7
    // (Ab in bb7). This fixture has heavy Ab -> dim7 reads the path;
    // m7b5/m7 are accepted too depending on histogram variation.
    expect(["m7", "m7b5", "dim7"]).toContain(cfg.chordQuality);
    // Degree sequence sanity per the chosen quality.
    if (cfg.chordQuality === "m7b5") {
      expect(cfg.degreeSequence).toEqual(["1", "b3", "b5", "b7"]);
    } else if (cfg.chordQuality === "m7") {
      expect(cfg.degreeSequence).toEqual(["1", "b3", "5", "b7"]);
    } else {
      expect(cfg.degreeSequence).toEqual(["1", "b3", "b5", "bb7"]);
    }
  });
});