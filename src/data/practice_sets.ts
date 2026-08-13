import type { PracticeSet } from "../lib/paths";

export const FOCUS_TAGS = [
  "ii-V-I",
  "tritone sub",
  "modal interchange",
  "Dorian",
  "Standards",
  "Voice Leading",
  "Rhythm",
  "Bebop",
  "Neo-Soul",
  "Chromatic",
  "Minor",
  "Major",
] as const;

export const PRACTICE_SETS: PracticeSet[] = [
  {
    id: "set-warmup-essentials",
    title: "Warmup Essentials",
    description:
      "The two most essential jazz progressions. ii-V-I for tonal grounding, Chromatic Descent for voice-leading fluency. Short enough to run daily.",
    focusTags: ["ii-V-I", "Voice Leading", "Chromatic"],
    items: [
      { pathId: "path-1", startBar: 1, endBar: 8 },
      { pathId: "path-3", startBar: 1, endBar: 8 },
    ],
    defaultTempo: 100,
    defaultReps: 2,
    defaultTransposeSemitones: 0,
    suggestedFrequency: "daily",
    seed: true,
  },
  {
    id: "set-tritone-substitution",
    title: "Tritone Substitution",
    description:
      "ii-V-I with the dominant replaced by its tritone sub. Path III bars 1–8 cycle through the entire chromatic descent, which contains embedded SubV7 motion.",
    focusTags: ["ii-V-I", "tritone sub", "Voice Leading"],
    items: [
      { pathId: "path-1", startBar: 1, endBar: 8 },
      { pathId: "path-3", startBar: 1, endBar: 8 },
    ],
    defaultTempo: 90,
    defaultReps: 2,
    defaultTransposeSemitones: 0,
    suggestedFrequency: "daily",
    seed: true,
  },
  {
    id: "set-modal-interchange",
    title: "Modal Interchange",
    description:
      "Path IV (sus chords, bVII–bVI–bV) plus Path II (Neo-Soul borrowing). Teaches the player to hear outside the diatonic palette.",
    focusTags: ["modal interchange", "Neo-Soul", "Voice Leading"],
    items: [
      { pathId: "path-4", startBar: 1, endBar: 8 },
      { pathId: "path-2", startBar: 1, endBar: 8 },
    ],
    defaultTempo: 80,
    defaultReps: 2,
    defaultTransposeSemitones: 0,
    suggestedFrequency: "weekly",
    seed: true,
  },
  {
    id: "set-standards-shapes",
    title: "Standards Shapes",
    description:
      "Two short-heads from the MasterClass: Yardbird Suite (turnback ii-Vs) and Star Eyes. Real chord changes, real vocabulary.",
    focusTags: ["Standards", "ii-V-I", "Bebop"],
    items: [
      { pathId: "study-yardbird-suite", startBar: 1, endBar: 16 },
      { pathId: "study-star-eyes", startBar: 1, endBar: 16 },
    ],
    defaultTempo: 130,
    defaultReps: 1,
    defaultTransposeSemitones: 0,
    suggestedFrequency: "weekly",
    seed: true,
  },
  {
    id: "set-jazz-toolkit",
    title: "Jazz Toolkit",
    description:
      "All 13 PATHS, bars 1–8 each. A rapid survey of every harmonic vocabulary the engine teaches. Reps=1 to keep it moving.",
    focusTags: [
      "ii-V-I",
      "tritone sub",
      "modal interchange",
      "Dorian",
      "Voice Leading",
      "Chromatic",
      "Minor",
      "Major",
    ],
    items: Array.from({ length: 13 }, (_, i) => ({
      pathId: `path-${i + 1}`,
      startBar: 1,
      endBar: 8,
    })),
    defaultTempo: 100,
    defaultReps: 1,
    defaultTransposeSemitones: 0,
    suggestedFrequency: "weekly",
    seed: true,
  },
];
