/**
 * src/lib/bookGenerator.test.ts - PIN-001 for the book generator's
 * pure logic. Node env (no DOM): deriveBookExercises, buildMemoryCards,
 * cardGridLayout. The browser-side composition (bookPdf.ts) is not
 * unit-tested per policy; this file pins everything that can be
 * derived without jsPDF/abcjs.
 */
import { describe, it, expect } from "vitest";
import {
  deriveBookExercises,
  buildMemoryCards,
  cardGridLayout,
  deriveScaleSyllabus,
  modeForChord,
  romanNumeralForChord,
  guideTonesForChord,
  MAX_MEMORY_CARDS,
  type BookExercise,
} from "./bookGenerator";
import type { HarmonicPath } from "./paths";
import type { MasterclassEntry } from "../data/masterclass";

// Middle dot used by the auto-generated descriptions. Escaped so this
// test file stays free of the literal typographic character.
const DOT = "\u00B7";

const FIXTURE_PATHS: HarmonicPath[] = [
  {
    id: "study-star-eyes",
    title: "Star Eyes - Gene de Paul",
    description: `F ${DOT} 130 BPM ${DOT} Swing Medium ${DOT} 32 bars`,
    feel: "Swing Medium",
    composer: "Gene de Paul",
    key: "F",
    steps: [
      { name: "Fmaj7", notes: [65, 69, 72, 76], descriptions: "b1: Fmaj7" },
      { name: "Gm7 C7", notes: [67, 70, 74, 77], descriptions: "b2: Gm7 C7" },
      { name: "Fmaj7", notes: [65, 69, 72, 76], descriptions: "b3: Fmaj7" },
    ],
  },
  {
    id: "study-solar",
    title: "Solar",
    description: `C- ${DOT} 120 BPM ${DOT} Latin ${DOT} 17 bars`,
    feel: "Latin",
    composer: "Miles Davis",
    key: "C-",
    steps: [
      { name: "Cm7", notes: [60, 63, 67, 70], descriptions: "b1: Cm7" },
      { name: "F7", notes: [65, 69, 72, 76], descriptions: "b2: F7" },
    ],
  },
];

const FIXTURE_MAP = new Map<string, MasterclassEntry>([
  [
    "study-star-eyes",
    {
      id: "study-star-eyes",
      title: "Star Eyes",
      classes: ["MC 1"],
      mainExercise: "Up the chord, 3rd and 7th twice.",
      description: "Foundational diatonic exercise.",
      objective: "Sing the melody first, then hold guide tones.",
      tags: ["foundation", "voice-leading"],
      inApp: true,
    },
  ],
  [
    "study-solar",
    {
      id: "study-solar",
      title: "Solar",
      classes: ["MC 6"],
      mainExercise: "Diatonic Solar solo.",
      description: "The flagship harmonic-minor study.",
      tags: ["advanced", "transposition"],
      inApp: true,
    },
  ],
]);

describe("deriveBookExercises", () => {
  it("parses key, tempo, feel and bars from the description", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises).toHaveLength(2);
    expect(exercises[0].key).toBe("F");
    expect(exercises[0].tempo).toBe(130);
    expect(exercises[0].feel).toBe("Swing Medium");
    expect(exercises[0].bars).toBe(32);
    expect(exercises[1].key).toBe("C-");
    expect(exercises[1].tempo).toBe(120);
    expect(exercises[1].feel).toBe("Latin");
    expect(exercises[1].bars).toBe(17);
  });

  it("uses path.key and path.feel when present", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises[0].key).toBe("F");
    expect(exercises[0].feel).toBe("Swing Medium");
  });

  it("extracts unique chord names from steps in first-appearance order", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises[0].chordNames).toEqual(["Fmaj7", "Gm7", "C7"]);
    expect(exercises[1].chordNames).toEqual(["Cm7", "F7"]);
  });

  it("derives chord tones as flat-preferred note names", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    // Fmaj7 = [65, 69, 72, 76] -> F A C E
    expect(exercises[0].chordTones[0]).toEqual(["F", "A", "C", "E"]);
    // Gm7 = [67, 70, 74, 77] -> G Bb D F (flat-preferred, not A#)
    expect(exercises[0].chordTones[1]).toEqual(["G", "Bb", "D", "F"]);
    // Cm7 = [60, 63, 67, 70] -> C Eb G Bb
    expect(exercises[1].chordTones[0]).toEqual(["C", "Eb", "G", "Bb"]);
  });

  it("derives practice notes from masterclass objective then mainExercise", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises[0].practiceNotes).toEqual([
      "Sing the melody first, then hold guide tones.",
      "Up the chord, 3rd and 7th twice.",
    ]);
  });

  it("derives tags from the masterclass entry", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises[0].tags).toEqual(["foundation", "voice-leading"]);
    expect(exercises[1].tags).toEqual(["advanced", "transposition"]);
  });

  it("falls back to the description when no masterclass entry exists", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, new Map());
    expect(exercises[0].practiceNotes).toEqual([FIXTURE_PATHS[0].description]);
    expect(exercises[0].tags).toEqual([]);
  });

  it("derives composer from the path field, then from the title dash", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    expect(exercises[0].composer).toBe("Gene de Paul");
    // study-solar has composer "Miles Davis" set explicitly.
    expect(exercises[1].composer).toBe("Miles Davis");
  });

  it("handles an empty path list", () => {
    expect(deriveBookExercises([], FIXTURE_MAP)).toEqual([]);
  });
});

describe("buildMemoryCards", () => {
  it("creates an exercise card plus chord cards per exercise", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    const cards = buildMemoryCards(exercises);
    // Exercise 1 card + 3 chord cards + Exercise 2 card + 2 chord cards.
    expect(cards).toHaveLength(7);
    expect(cards[0].front).toBe("Exercise 1: Star Eyes - Gene de Paul");
    expect(cards[0].back).toContain("F");
    expect(cards[0].back).toContain("130 BPM");
    expect(cards[1].front).toBe("Fmaj7");
    expect(cards[1].back).toContain("F A C E");
    expect(cards[1].back).toContain("from Star Eyes - Gene de Paul");
    expect(cards[4].front).toBe("Exercise 2: Solar");
    expect(cards[5].front).toBe("Cm7");
    expect(cards[5].back).toContain("C Eb G Bb");
  });

  it("chord cards carry roman numeral, chord tones, and guide tones", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    const cards = buildMemoryCards(exercises);
    // Star Eyes is in F major: Fmaj7 -> I, Gm7 -> ii, C7 -> V.
    expect(cards[1].roman).toBe("I");
    expect(cards[1].chordTones).toEqual(["F", "A", "C", "E"]);
    expect(cards[1].guideTones).toEqual(["A", "E"]);
    expect(cards[2].roman).toBe("ii");
    expect(cards[2].guideTones).toEqual(["Bb", "F"]);
    expect(cards[3].roman).toBe("V");
    expect(cards[3].guideTones).toEqual(["E", "Bb"]);
    // Solar is in C minor: Cm7 -> i, F7 -> IV (dominant quality -> V).
    expect(cards[5].roman).toBe("i");
    expect(cards[5].guideTones).toEqual(["Eb", "Bb"]);
    expect(cards[6].roman).toBe("IV");
    expect(cards[6].guideTones).toEqual(["A", "Eb"]);
  });

  it("caps the card count at MAX_MEMORY_CARDS", () => {
    const many: BookExercise[] = Array.from({ length: 12 }, (_, i) => ({
      id: `ex-${i}`,
      title: `Exercise ${i + 1}`,
      composer: "",
      key: "C",
      tempo: 120,
      feel: "Swing",
      bars: 32,
      chordNames: ["Cmaj7", "Dm7", "G7", "Am7"],
      chordTones: [
        ["C", "E", "G", "B"],
        ["D", "F", "A", "C"],
        ["G", "B", "D", "F"],
        ["A", "C", "E", "G"],
      ],
      practiceNotes: ["Practice the changes."],
      tags: [],
    }));
    const cards = buildMemoryCards(many);
    expect(cards.length).toBe(MAX_MEMORY_CARDS);
    expect(cards.length).toBeLessThanOrEqual(MAX_MEMORY_CARDS);
  });

  it("handles empty exercises", () => {
    expect(buildMemoryCards([])).toEqual([]);
  });
});

describe("cardGridLayout", () => {
  it("computes 6 pages for 24 cards at 4 per page", () => {
    expect(cardGridLayout(24)).toEqual({ pages: 6, cardsPerPage: 4 });
  });

  it("rounds up partial pages", () => {
    expect(cardGridLayout(5)).toEqual({ pages: 2, cardsPerPage: 4 });
    expect(cardGridLayout(1)).toEqual({ pages: 1, cardsPerPage: 4 });
  });

  it("returns zero pages for zero cards", () => {
    expect(cardGridLayout(0)).toEqual({ pages: 0, cardsPerPage: 4 });
  });

  it("respects custom cols and rows", () => {
    expect(cardGridLayout(9, 3, 3)).toEqual({ pages: 1, cardsPerPage: 9 });
    expect(cardGridLayout(10, 3, 3)).toEqual({ pages: 2, cardsPerPage: 9 });
  });
});

describe("deriveScaleSyllabus", () => {
  it("derives the parent scale from a major key", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    const syllabus = deriveScaleSyllabus(exercises[0]);
    expect(syllabus.parentScale).toBe("F Major");
  });

  it("derives the parent scale from a minor key", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    const syllabus = deriveScaleSyllabus(exercises[1]);
    expect(syllabus.parentScale).toBe("C Minor");
  });

  it("maps ii-V-I chord types to Dorian/Mixolydian/Ionian", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    // Star Eyes: Fmaj7, Gm7, C7 -> Ionian, Dorian, Mixolydian.
    const syllabus = deriveScaleSyllabus(exercises[0]);
    expect(syllabus.modes).toEqual(["Ionian", "Dorian", "Mixolydian"]);
  });

  it("dedupes modes in first-appearance order", () => {
    const exercises = deriveBookExercises(FIXTURE_PATHS, FIXTURE_MAP);
    // Solar: Cm7, F7 -> Dorian, Mixolydian (no duplicates).
    const syllabus = deriveScaleSyllabus(exercises[1]);
    expect(syllabus.modes).toEqual(["Dorian", "Mixolydian"]);
  });

  it("falls back to C Major for an empty key", () => {
    const ex: BookExercise = {
      id: "x",
      title: "X",
      composer: "",
      key: "",
      tempo: 0,
      feel: "",
      bars: 0,
      chordNames: ["Cmaj7"],
      chordTones: [["C", "E", "G", "B"]],
      practiceNotes: [],
      tags: [],
    };
    expect(deriveScaleSyllabus(ex).parentScale).toBe("C Major");
  });
});

describe("modeForChord", () => {
  it("maps the ii-V-I families", () => {
    expect(modeForChord("Dm7")).toBe("Dorian");
    expect(modeForChord("G7")).toBe("Mixolydian");
    expect(modeForChord("Cmaj7")).toBe("Ionian");
  });

  it("maps extended and altered dominants to Mixolydian", () => {
    expect(modeForChord("G9")).toBe("Mixolydian");
    expect(modeForChord("G13")).toBe("Mixolydian");
    expect(modeForChord("G7b9")).toBe("Mixolydian");
    expect(modeForChord("G7#9")).toBe("Mixolydian");
  });

  it("maps half-diminished and diminished chords", () => {
    expect(modeForChord("F#m7b5")).toBe("Locrian");
    expect(modeForChord("Bdim7")).toBe("Diminished (whole-half)");
  });

  it("maps minor-major and augmented chords", () => {
    expect(modeForChord("CmM7")).toBe("Melodic Minor");
    expect(modeForChord("Caug")).toBe("Whole Tone");
  });

  it("falls back to Ionian for unrecognized symbols", () => {
    expect(modeForChord("N.C.")).toBe("Ionian");
  });
});

describe("romanNumeralForChord", () => {
  it("maps diatonic chords in a major key", () => {
    expect(romanNumeralForChord("Fmaj7", "F")).toBe("I");
    expect(romanNumeralForChord("Gm7", "F")).toBe("ii");
    expect(romanNumeralForChord("C7", "F")).toBe("V");
  });

  it("maps diatonic chords in a minor key", () => {
    expect(romanNumeralForChord("Cm7", "C-")).toBe("i");
    expect(romanNumeralForChord("F7", "C-")).toBe("IV");
    expect(romanNumeralForChord("G7", "C-")).toBe("V");
  });

  it("marks diminished chords with a degree symbol", () => {
    expect(romanNumeralForChord("Bm7b5", "C")).toBe("vii\u00B0");
  });

  it("returns empty for unparseable chords", () => {
    expect(romanNumeralForChord("N.C.", "C")).toBe("");
  });
});

describe("guideTonesForChord", () => {
  it("returns the 3rd and 7th for major 7th chords", () => {
    expect(guideTonesForChord("Fmaj7")).toEqual(["A", "E"]);
  });

  it("returns the 3rd and 7th for minor 7th chords", () => {
    expect(guideTonesForChord("Gm7")).toEqual(["Bb", "F"]);
  });

  it("returns the 3rd and 7th for dominant 7th chords", () => {
    expect(guideTonesForChord("C7")).toEqual(["E", "Bb"]);
  });

  it("returns the 3rd and 7th for half-diminished chords", () => {
    expect(guideTonesForChord("Bm7b5")).toEqual(["D", "A"]);
  });

  it("returns empty for unparseable chords", () => {
    expect(guideTonesForChord("N.C.")).toEqual([]);
  });
});