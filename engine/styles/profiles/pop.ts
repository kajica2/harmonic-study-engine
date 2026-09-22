/**
 * engine/styles/profiles/pop.ts - REQ-STYLE-2 data (PRD App. B/C/D).
 * Vocabulary weights sum to 1.000. Calibrated at difficulty 3.
 */

import type { StyleProfile } from "../types";

export const POP_PROFILE = {
  version: 1,
  id: "pop",
  name: "Pop",
  description: "Four-chord loops, triadic harmony, hook-first melody.",
  tempoRange: [76, 132],
  defaultTempo: 100,
  instrument: "piano-synth-pad",
  harmony: {
    vocabulary: [
      { numeral: "I", weight: 0.32 },
      { numeral: "V", weight: 0.22 },
      { numeral: "IV", weight: 0.2 },
      { numeral: "vi", weight: 0.18 },
      { numeral: "ii", weight: 0.04 },
      { numeral: "bVII", weight: 0.04 },
    ],
    progressions: [
      ["I", "V", "vi", "IV"],
      ["vi", "IV", "I", "V"],
      ["I", "IV", "vi", "V"],
      ["I", "vi", "IV", "V"],
    ],
    extensionBias: 0.1,
    alterationBias: 0.02,
    modalInterchangeRate: 0.06,
    secondaryDominantRate: 0.05,
    reharmonizationRate: 0.08,
  },
  melody: {
    contour: "mixed",
    range: [60, 79],
    chromaticism: 0.05,
    syncopation: 0.25,
    chordToneStrongBeat: 0.85,
    maxLeapSemitones: 7,
    repeatNoteRate: 0.55,
  },
  rhythm: {
    defaultFeel: "straight",
    swingRatio: 0.5,
    gridDivisions: 4,
    bassPattern: "rootFifth",
    chordPattern: "block",
    meters: ["4/4"],
    densityDefault: 2,
  },
  voicing: {
    style: "block",
    rootlessRate: 0.02,
    spreadBias: 0.4,
    registers: {
      bass: [28, 48],
      chords: [48, 72],
      pad: [60, 84],
      melody: [60, 86],
    },
    inversionAwareness: false,
  },
} satisfies StyleProfile;
