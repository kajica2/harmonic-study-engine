/**
 * engine/styles/profiles/jazz.ts - REQ-STYLE-2 data (PRD App. B/C/D).
 * Vocabulary weights sum to 1.000. Calibrated at difficulty 3.
 */

import type { StyleProfile } from "../types";

export const JAZZ_PROFILE = {
  version: 1,
  id: "jazz",
  name: "Jazz",
  description: "Swing feel, extended harmony, ii-V-I motion, guide-tone voice leading.",
  tempoRange: [90, 280],
  defaultTempo: 140,
  instrument: "acoustic-piano-trio",
  harmony: {
    vocabulary: [
      { numeral: "Imaj7", weight: 0.18 },
      { numeral: "ii7", weight: 0.16 },
      { numeral: "V7", weight: 0.16 },
      { numeral: "IVmaj7", weight: 0.1 },
      { numeral: "vi7", weight: 0.08 },
      { numeral: "V7alt", weight: 0.06 },
      { numeral: "iii7", weight: 0.05 },
      { numeral: "I7", weight: 0.04 },
      { numeral: "ii7(b5)", weight: 0.04 },
      { numeral: "bVII7", weight: 0.04 },
      { numeral: "III7", weight: 0.03 },
      { numeral: "VI7", weight: 0.03 },
      { numeral: "iv7", weight: 0.03 },
    ],
    progressions: [
      ["ii7", "V7", "Imaj7"],
      ["Imaj7", "vi7", "ii7", "V7"],
      ["iii7", "VI7", "ii7", "V7"],
      ["ii7", "V7", "Imaj7", "bVII7"],
      ["Imaj7", "III7", "vi7", "VI7"],
      ["ii7", "V7", "ii7", "V7"],
    ],
    extensionBias: 0.85,
    alterationBias: 0.35,
    modalInterchangeRate: 0.15,
    secondaryDominantRate: 0.3,
    reharmonizationRate: 0.25,
  },
  melody: {
    contour: "mixed",
    range: [58, 84],
    chromaticism: 0.35,
    syncopation: 0.55,
    chordToneStrongBeat: 0.55,
    maxLeapSemitones: 10,
    repeatNoteRate: 0.25,
  },
  rhythm: {
    defaultFeel: "mediumSwing",
    swingRatio: 0.64,
    gridDivisions: 2,
    bassPattern: "walking",
    chordPattern: "freddieGreen",
    meters: ["4/4", "3/4"],
    densityDefault: 3,
  },
  voicing: {
    style: "drop2",
    rootlessRate: 0.55,
    spreadBias: 0.6,
    registers: {
      bass: [28, 48],
      chords: [48, 72],
      pad: [60, 84],
      melody: [60, 86],
    },
    inversionAwareness: true,
  },
} satisfies StyleProfile;
