/**
 * engine/pedagogy/annotate.test.ts - PRD-001 Phase 3 Slice 1 (test
 * plan 6, REQ-PED-2/3 truthfulness).
 *
 * Both directions: hand-built chord sequences that DO contain each
 * pattern -> the annotation is emitted with the correct conceptId;
 * sequences that DON'T -> zero false positives. Plus: every emitted
 * conceptId resolves in the registry, ids are deterministic ordinals,
 * labels fit the <= 40 char chip budget.
 */

import { describe, it, expect } from "vitest";
import { annotateEtude } from "./annotate";
import { getConcept } from "./concepts";
import { generateEtude } from "../etude/assemble";
import { getStyleProfile } from "../styles/index";
import type { EtudeChord, EtudeConstraints, EtudeNote } from "../etude/types";
import type { Annotation } from "./types";

const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function chord(
  bar: number,
  numeral: string,
  rootPc: number,
  qualitySymbol: string,
  notes: number[],
): EtudeChord {
  return { bar, numeral, rootPc, qualitySymbol, name: `${PC_NAMES[rootPc]}${qualitySymbol}`, notes };
}

function note(slot: number, midi: number): EtudeNote {
  return {
    slot,
    midi,
    durationSlots: 2,
    velocity: 0.85,
    strongBeat: slot % 2 === 0,
    syncopated: slot % 2 !== 0,
  };
}

function cMajorConstraints(bars: number): EtudeConstraints {
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

function run(chords: EtudeChord[], melody: EtudeNote[] = []): readonly Annotation[] {
  return annotateEtude(chords, melody, getStyleProfile("jazz"), cMajorConstraints(chords.length));
}

const conceptsOf = (anns: readonly Annotation[]): string[] =>
  anns.map((a) => a.conceptId).filter((c): c is string => c !== null);

// Reusable chord fixtures (C major).
const Cmaj7 = (bar: number, notes = [48, 52, 55, 59]) => chord(bar, "Imaj7", 0, "maj7", notes);
const G7 = (bar: number) => chord(bar, "V7", 7, "dom7", [55, 59, 62, 65]);
const Dm7 = (bar: number) => chord(bar, "ii7", 2, "m7", [50, 53, 57, 60]);

describe("truthful positives: each pattern fires when present", () => {
  it("ii-V-I", () => {
    const anns = run([Dm7(0), G7(1), Cmaj7(2)]);
    expect(conceptsOf(anns)).toContain("ii-v-i");
    const a = anns.find((x) => x.conceptId === "ii-v-i") as Annotation;
    expect(a.id).toBe("ann-iiv1-0");
    expect(a.target).toEqual({ kind: "progression", fromBar: 0, toBar: 2 });
    expect(a.confidence).toBe(1);
  });

  it("ii-V-I truthfulness: tonic resolution REQUIRED (ii7-V7-Imaj7 control vs ii-V-iii / ii-V-IV negatives)", () => {
    // Positive control: the exact ii7 - V7 - Imaj7 chain fires.
    expect(conceptsOf(run([Dm7(0), G7(1), Cmaj7(2)]))).toContain("ii-v-i");
    // Negatives: identical ii7 - V7 prefix, NON-tonic third chord. The
    // detector must not fire on adjacency alone - a V7 that never
    // resolves to the tonic family is not a ii-V-I. (Mutation guard:
    // dropping the isTonicFamily resolution check fails these.)
    const iii = run([Dm7(0), G7(1), chord(2, "iii7", 4, "m7", [52, 55, 59, 62])]);
    expect(conceptsOf(iii)).not.toContain("ii-v-i");
    const iv = run([Dm7(0), G7(1), chord(2, "IV", 5, "maj", [53, 57, 60])]);
    expect(conceptsOf(iv)).not.toContain("ii-v-i");
    // A major-quality chord on the tonic ROOT but wrong degree label is
    // still not enough without the ii/V prefix resolving - and the
    // reverse: right prefix, tonic-quality chord a whole step off.
    const biiTarget = run([Dm7(0), G7(1), chord(2, "II7", 2, "dom7", [50, 54, 57, 60])]);
    expect(conceptsOf(biiTarget)).not.toContain("ii-v-i");
  });

  it("tritone sub (bII7 -> I)", () => {
    const anns = run([chord(0, "bII7", 1, "dom7", [49, 53, 56, 60]), Cmaj7(1)]);
    expect(conceptsOf(anns)).toContain("tritone-sub");
    expect(conceptsOf(anns)).not.toContain("modal-interchange"); // claimed by the tritone rule
  });

  it("secondary dominant (VI7 -> ii7)", () => {
    const anns = run([chord(0, "VI7", 9, "dom7", [57, 61, 64, 67]), Dm7(1), Cmaj7(2)]);
    expect(conceptsOf(anns)).toContain("secondary-dominant");
    expect(conceptsOf(anns)).not.toContain("modal-interchange"); // A is diatonic (vi root)
  });

  it("modal interchange (bVII7, unexplained non-diatonic root)", () => {
    const anns = run([chord(0, "bVII7", 10, "dom7", [58, 62, 65, 68]), Cmaj7(1)]);
    expect(conceptsOf(anns)).toContain("modal-interchange");
    expect(conceptsOf(anns)).not.toContain("tritone-sub");
    expect(conceptsOf(anns)).not.toContain("secondary-dominant");
  });

  it("unresolved bII7 falls through to modal interchange", () => {
    const anns = run([chord(0, "bII7", 1, "dom7", [49, 53, 56, 60]), chord(1, "vi7", 9, "m7", [57, 60, 64, 67])]);
    expect(conceptsOf(anns)).not.toContain("tritone-sub");
    expect(conceptsOf(anns)).toContain("modal-interchange");
  });

  it("cadence: authentic (V -> I) and plagal (iv -> I)", () => {
    const auth = run([Cmaj7(0), Dm7(1), G7(2), Cmaj7(3)]);
    expect(conceptsOf(auth)).toContain("cadence");
    const plag = run([Cmaj7(0), chord(1, "iv7", 5, "m7", [53, 56, 60, 63]), Cmaj7(2)]);
    expect(conceptsOf(plag)).toContain("cadence");
    expect(conceptsOf(plag)).not.toContain("modal-interchange"); // iv7 root is diatonic
  });

  it("voice leading: fires on identical chords, not on a 3-octave leap", () => {
    const smooth = run([Cmaj7(0), Cmaj7(1)]);
    expect(conceptsOf(smooth)).toContain("voice-leading");
    // Wording pin: the text must claim what it computes - a PER-VOICE
    // AVERAGE of nearest-tone motion, never a promise that EACH voice
    // individually moves that little (one voice may leap while the
    // mean stays low), and no "move by step" overclaim.
    const vl = smooth.find((x) => x.conceptId === "voice-leading") as Annotation;
    expect(vl.text).toContain("the average voice moves");
    expect(vl.text).toContain("nearest pitch");
    expect(vl.text).not.toContain("each voice moves");
    expect(vl.text).not.toContain("move by step");
    const jumpy = run([Cmaj7(0), Cmaj7(1, [84, 88, 91, 95])]);
    expect(conceptsOf(jumpy)).not.toContain("voice-leading");
  });

  it("drop 2: fires on the spread shape, not the close shape", () => {
    const spread = run([Cmaj7(0, [55, 60, 64, 71]), Dm7(1)]);
    expect(conceptsOf(spread)).toContain("drop-2");
    const close = run([Cmaj7(0), Dm7(1)]);
    expect(conceptsOf(close)).not.toContain("drop-2");
  });

  it("axis: major-third cycle and exact tritone pair", () => {
    const thirds = run([Cmaj7(0), chord(1, "III7", 4, "dom7", [52, 56, 59, 62]), chord(2, "bVI", 8, "maj", [56, 60, 63])]);
    expect(conceptsOf(thirds)).toContain("axis-progression");
    const pairs = run([Cmaj7(0), chord(1, "bV7", 6, "dom7", [54, 58, 61, 64]), Cmaj7(2)]);
    expect(conceptsOf(pairs)).toContain("axis-progression");
  });

  it("melody editorial: chromatic approach notes, conceptId null", () => {
    const anns = run([Cmaj7(0), Cmaj7(1)], [note(0, 60), note(2, 61)]);
    const a = anns.find((x) => x.id === "ann-melody-chromatic-0");
    expect(a).toBeDefined();
    expect(a!.conceptId).toBeNull();
    expect(a!.confidence).toBeNull();
    expect(a!.target).toEqual({ kind: "melody" });
    const none = run([Cmaj7(0), Cmaj7(1)], [note(0, 60), note(2, 62)]);
    expect(none.find((x) => x.id === "ann-melody-chromatic-0")).toBeUndefined();
  });
});

describe("zero false positives on plain diatonic material", () => {
  it("I - ii - iii: no pattern concept except the genuinely-smooth voice leading", () => {
    const anns = run([Cmaj7(0), Dm7(1), chord(2, "iii7", 4, "m7", [52, 55, 59, 62])]);
    // These three close voicings really are smooth (mean per-voice
    // motion ~1.5 semitones), so voice-leading firing is TRUTHFUL; the
    // seven other patterns are all absent.
    expect(conceptsOf(anns)).toEqual(["voice-leading"]);
    for (const c of ["ii-v-i", "tritone-sub", "secondary-dominant", "modal-interchange", "cadence", "drop-2", "axis-progression"]) {
      expect(conceptsOf(anns)).not.toContain(c);
    }
  });

  it("I - V - vi - IV (pop loop): only the cadence-free truth holds", () => {
    const anns = run([
      Cmaj7(0),
      G7(1),
      chord(2, "vi7", 9, "m7", [57, 60, 64, 67]),
      chord(3, "IV", 5, "maj", [53, 57, 60]),
    ]);
    expect(conceptsOf(anns)).not.toContain("ii-v-i");
    expect(conceptsOf(anns)).not.toContain("tritone-sub");
    expect(conceptsOf(anns)).not.toContain("secondary-dominant");
    expect(conceptsOf(anns)).not.toContain("modal-interchange");
    expect(conceptsOf(anns)).not.toContain("drop-2");
    expect(conceptsOf(anns)).not.toContain("axis-progression");
    expect(conceptsOf(anns)).not.toContain("cadence"); // ends on IV, no V->I/iv->I close
  });
});

describe("registry + determinism contracts over GENERATED etudes", () => {
  it("every emitted conceptId resolves; labels <= 40 chars; ids unique + pattern-shaped", () => {
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      for (const difficulty of [1, 3, 5] as const) {
        for (const seed of [1, 2, 3, 42]) {
          const { etude } = generateEtude(
            { ...cMajorConstraints(8), styleId, difficulty, seed },
            { nowMs: 1, seq: 1 },
          );
          const ids = new Set<string>();
          for (const a of etude.annotations) {
            if (a.conceptId !== null) expect(getConcept(a.conceptId)).not.toBeNull();
            expect(a.label.length).toBeLessThanOrEqual(40);
            expect(a.id).toMatch(/^ann-[a-z][a-z0-9-]*-\d+$/);
            expect(ids.has(a.id)).toBe(false);
            ids.add(a.id);
            expect(a.version).toBe(1);
            expect(a.confidence === null || (a.confidence >= 0 && a.confidence <= 1)).toBe(true);
          }
        }
      }
    }
  });

  it("annotation ids are deterministic ordinals (same data -> same ids)", () => {
    const chords = [Dm7(0), G7(1), Cmaj7(2), chord(3, "bII7", 1, "dom7", [49, 53, 56, 60])];
    const a = run(chords);
    const b = run(chords);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
