/**
 * Unit tests for src/lib/studies.ts.
 *
 * Phase 2 deliverable — covers the 17 NEW masterclass standards added
 * from Real Book chord progressions (Body and Soul, All the Things You
 * Are, Autumn Leaves, Blue Bossa, In a Sentimental Mood, Take the A
 * Train, Misty, 'Round Midnight, Satin Doll, Sophisticated Lady, Mood
 * Indigo, Donna Lee, Anthropology, Scrapple from the Apple, Au Privave,
 * Now's the Time, Tenor Madness).
 *
 * Coverage:
 *  - 17 new tunes exist (count == 36 total - 19 original)
 *  - Each new tune has id, title, non-empty steps
 *  - Every step has at least 1 note in 0..127
 *  - All new ids are unique within STUDIES_PATHS
 *  - New tunes don't collide with the original 19
 *  - For at least 3 tunes, the chord quality matches the title's chord
 *    symbol when classified by analyzeChord
 */
import { describe, it, expect } from "vitest";
import { STUDIES_PATHS } from "./studies";
import { analyzeChord } from "./theory";

// These are the 17 new standards added in Phase 2. Each id appears once
// in STUDIES_PATHS and nowhere else.
const NEW_IDS = [
  "study-body-and-soul",
  "study-all-the-things-you-are",
  "study-autumn-leaves",
  "study-blue-bossa",
  "study-in-a-sentimental-mood",
  "study-take-the-a-train",
  "study-misty",
  "study-round-midnight",
  "study-satin-doll",
  "study-sophisticated-lady",
  "study-mood-indigo",
  "study-donna-lee",
  "study-anthropology",
  "study-scrapple-from-the-apple",
  "study-au-privave",
  "study-nows-the-time",
  "study-tenor-madness",
];

// The 19 standards that existed before Phase 2 (kept for collision checks).
const ORIGINAL_IDS = [
  "study-star-eyes",
  "study-is-you-is-or-is-you-aint-my-baby",
  "study-yardbird-suite",
  "study-sometimes-im-happy",
  "study-solar",
  "study-what-is-this-thing-called-love",
  "study-lady-be-good",
  "study-cherokee",
  "study-i-got-rhythm",
  "study-stella-by-starlight",
  "study-bird-feathers",
  "study-there-will-never-be-another-you",
  "study-out-of-nowhere",
  "study-nostalgia-in-october",
  "study-ill-remember-april",
  "study-groovin-high",
  "study-hot-house",
  "study-confirmation",
  "study-confirmation-blues",
];

describe("STUDIES_PATHS — Phase 2 additions", () => {
  it("contains all 19 original standards", () => {
    const ids = new Set(STUDIES_PATHS.map((p) => p.id));
    for (const id of ORIGINAL_IDS) {
      expect(ids.has(id), `missing original ${id}`).toBe(true);
    }
  });

  it("contains all 17 new standards", () => {
    const ids = new Set(STUDIES_PATHS.map((p) => p.id));
    for (const id of NEW_IDS) {
      expect(ids.has(id), `missing new ${id}`).toBe(true);
    }
    expect(STUDIES_PATHS.length).toBe(ORIGINAL_IDS.length + NEW_IDS.length);
  });

  it("all new ids are unique within STUDIES_PATHS", () => {
    const allIds = STUDIES_PATHS.map((p) => p.id);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("new tunes do not collide with the original 19", () => {
    const originalSet = new Set(ORIGINAL_IDS);
    for (const id of NEW_IDS) {
      expect(originalSet.has(id), `${id} collides with original`).toBe(false);
    }
  });
});

describe("each new tune — shape", () => {
  for (const id of NEW_IDS) {
    const path = STUDIES_PATHS.find((p) => p.id === id);
    if (!path) continue; // skip — count test above will have caught this
    describe(path.title, () => {
      it("has id, title, description", () => {
        expect(typeof path.id).toBe("string");
        expect(path.id.length).toBeGreaterThan(0);
        expect(typeof path.title).toBe("string");
        expect(path.title.length).toBeGreaterThan(0);
        expect(typeof path.description).toBe("string");
        expect(path.description.length).toBeGreaterThan(0);
      });

      it("has a non-empty steps array", () => {
        expect(Array.isArray(path.steps)).toBe(true);
        expect(path.steps.length).toBeGreaterThan(0);
      });

      it("every step has name, at least 1 note in 0..127, descriptions", () => {
        for (const s of path.steps) {
          expect(typeof s.name).toBe("string");
          expect(s.name.length).toBeGreaterThan(0);
          expect(Array.isArray(s.notes)).toBe(true);
          expect(s.notes.length).toBeGreaterThan(0);
          for (const n of s.notes) {
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(127);
          }
          expect(typeof s.descriptions).toBe("string");
        }
      });
    });
  }
});

describe("chord-quality classification (analyzeChord integration)", () => {
  // Spot-check that the first chord of three representative new tunes is
  // classified correctly by theory.analyzeChord. These confirm the
  // emitted MIDI notes are recognized as the right family.

  it("Body and Soul opens on Dbmaj7 (major family)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-body-and-soul");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("major");
  });

  it("Blue Bossa opens on Cm7 (minor family)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-blue-bossa");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("minor");
  });

  it("Misty opens on Ebmaj7 (major family)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-misty");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("major");
  });

  it("Donna Lee opens on Abmaj7 (major family)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-donna-lee");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("major");
  });

  it("Donna Lee bar 2 (F7) is dominant", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-donna-lee");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[1].notes).family;
    expect(family).toBe("dominant");
  });

  it("Au Privave opens on Bb6 (major family — 6 implies major triad)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-au-privave");
    expect(path).toBeDefined();
    // Bb6 = [Bb, D, G] -> [58, 62, 67] which analyzeChord treats as a
    // major triad with added 6th. The family should be "major".
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("major");
  });

  it("Tenor Madness opens on Bb7 (dominant)", () => {
    const path = STUDIES_PATHS.find((p) => p.id === "study-tenor-madness");
    expect(path).toBeDefined();
    const family = analyzeChord(path!.steps[0].notes).family;
    expect(family).toBe("dominant");
  });
});