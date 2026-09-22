/**
 * engine/styles/profiles/classical.ts - REQ-STYLE-2 data
 * (PRD App. B/C/D). Vocabulary weights sum to 1.000. Calibrated at
 * difficulty 3. rootlessRate 0 is a STRUCTURAL zero (stays 0 at every
 * difficulty - see engine/styles/difficulty.ts).
 */

import type { StyleProfile } from "../types";

export const CLASSICAL_PROFILE = {
  version: 1,
  id: "classical",
  name: "Classical",
  description: "Common-practice diatonic harmony, stepwise melody, cadential motion.",
  tempoRange: [54, 144],
  defaultTempo: 96,
  instrument: "solo-piano",
  harmony: {
    vocabulary: [
      { numeral: "I", weight: 0.28 },
      { numeral: "V", weight: 0.2 },
      { numeral: "IV", weight: 0.14 },
      { numeral: "ii", weight: 0.12 },
      { numeral: "vi", weight: 0.1 },
      { numeral: "V7", weight: 0.1 },
      { numeral: "viio", weight: 0.06 },
    ],
    progressions: [
      ["I", "IV", "V", "I"],
      ["I", "vi", "ii", "V"],
      ["ii", "V", "I"],
      ["I", "vi", "IV", "V"],
    ],
    extensionBias: 0.02,
    alterationBias: 0.06,
    modalInterchangeRate: 0.06,
    secondaryDominantRate: 0.12,
    reharmonizationRate: 0.05,
  },
  melody: {
    contour: "stepwise",
    range: [60, 81],
    chromaticism: 0.1,
    syncopation: 0.06,
    chordToneStrongBeat: 0.92,
    maxLeapSemitones: 5,
    repeatNoteRate: 0.3,
  },
  rhythm: {
    defaultFeel: "straight",
    swingRatio: 0.5,
    gridDivisions: 2,
    bassPattern: "rootFifth",
    chordPattern: "alberti",
    meters: ["4/4", "3/4"],
    densityDefault: 2,
  },
  voicing: {
    style: "close",
    rootlessRate: 0,
    spreadBias: 0.35,
    registers: {
      bass: [28, 48],
      chords: [48, 72],
      pad: [60, 84],
      melody: [60, 86],
    },
    inversionAwareness: true,
  },
} satisfies StyleProfile;
