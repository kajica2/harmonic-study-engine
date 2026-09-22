/**
 * engine/styles/index.ts - registry + hand-rolled validator
 * (precedent: validateStylePack in src/lib/stylePack.ts; Zod is
 * deferred per PRD 10.3 note - see design doc section 11).
 */

import type { StyleId, StyleProfile } from "./types";
import { JAZZ_PROFILE } from "./profiles/jazz";
import { POP_PROFILE } from "./profiles/pop";
import { CLASSICAL_PROFILE } from "./profiles/classical";

const PROFILES: ReadonlyMap<StyleId, StyleProfile> = new Map<StyleId, StyleProfile>([
  [JAZZ_PROFILE.id, JAZZ_PROFILE],
  [POP_PROFILE.id, POP_PROFILE],
  [CLASSICAL_PROFILE.id, CLASSICAL_PROFILE],
]);

/** Phase 0 ships three; picker uses this (REQ-STYLE-3, Phase 1). */
export function shippedStyleIds(): StyleId[] {
  return [...PROFILES.keys()];
}

/** Throws on unknown/unshipped id: programmer error, not user input.
 *  UI code must gate on shippedStyleIds() first. */
export function getStyleProfile(id: StyleId): StyleProfile {
  const p = PROFILES.get(id);
  if (!p) throw new Error(`Style profile '${id}' is not shipped yet.`);
  return p;
}

export function allStyleProfiles(): StyleProfile[] {
  return [...PROFILES.values()];
}

export interface StyleProfileValidation {
  ok: boolean;
  errors: string[];
}

const CONTOUR_VALUES: readonly string[] = ["stepwise", "mixed", "leapy"];
const FEEL_VALUES: readonly string[] = [
  "straight",
  "lightSwing",
  "mediumSwing",
  "hardSwing",
  "shuffle",
];
const BASS_PATTERN_VALUES: readonly string[] = [
  "walking",
  "twoFeel",
  "rootFifth",
  "eighthPulse",
  "shuffleBoogie",
  "drone",
];
const CHORD_PATTERN_VALUES: readonly string[] = [
  "freddieGreen",
  "charleston",
  "block",
  "pulse",
  "offbeat",
  "lazy",
  "sustain",
  "alberti",
];
const METER_VALUES: readonly string[] = ["4/4", "3/4", "5/4", "6/8", "7/8"];
const VOICING_STYLE_VALUES: readonly string[] = [
  "close",
  "drop2",
  "quartal",
  "spread",
  "block",
];

const HARMONY_PROB_KEYS = [
  "extensionBias",
  "alterationBias",
  "modalInterchangeRate",
  "secondaryDominantRate",
  "reharmonizationRate",
] as const;

const MELODY_PROB_KEYS = [
  "chromaticism",
  "syncopation",
  "chordToneStrongBeat",
  "repeatNoteRate",
] as const;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isInt(n: unknown): n is number {
  return isFiniteNumber(n) && Number.isInteger(n);
}

function isProb(n: unknown): n is number {
  return isFiniteNumber(n) && n >= 0 && n <= 1;
}

function isIntRange0To127(pair: unknown): pair is readonly [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    isInt(pair[0]) &&
    isInt(pair[1]) &&
    pair[0] >= 0 &&
    pair[0] <= pair[1] &&
    pair[1] <= 127
  );
}

/**
 * validateStyleProfile(candidate): checks (paths prefixed "p."):
 *  - object, id/name/description/instrument strings
 *  - version === 1 (integer)
 *  - tempoRange [lo,hi] ints, 0 < lo <= hi < 400; defaultTempo in range
 *  - harmony.vocabulary: non-empty; unique numerals; each weight a
 *    finite number >= 0; sum within 0.001 of 1.0 (NaN totals fail)
 *  - harmony.progressions: non-empty; non-empty token arrays; EVERY
 *    token present in vocabulary (catches data typos)
 *  - all probability fields finite numbers in [0,1]
 *  - melody.range: ints 0-127, lo <= hi
 *  - melody.maxLeapSemitones int 1-24; melody.contour enum
 *  - rhythm.swingRatio in [0.5,0.75]; gridDivisions in {2,4};
 *    densityDefault int 0-5; enums for defaultFeel/bassPattern/
 *    chordPattern; meters non-empty enum array
 *  - voicing.style enum; voicing.inversionAwareness boolean
 *  - voicing.registers: four [lo,hi] int pairs, 0 <= lo <= hi <= 127
 */
export function validateStyleProfile(
  candidate: unknown,
): StyleProfileValidation {
  const errors: string[] = [];
  if (typeof candidate !== "object" || candidate === null) {
    return { ok: false, errors: ["p must be an object"] };
  }
  const p = candidate as Record<string, unknown>;

  if (typeof p.id !== "string") errors.push("p.id must be a string");
  if (typeof p.name !== "string") errors.push("p.name must be a string");
  if (typeof p.description !== "string") {
    errors.push("p.description must be a string");
  }
  if (typeof p.instrument !== "string") {
    errors.push("p.instrument must be a string");
  }
  if (!isInt(p.version) || p.version !== 1) {
    errors.push("p.version must be the integer 1");
  }

  if (
    !Array.isArray(p.tempoRange) ||
    p.tempoRange.length !== 2 ||
    !isInt(p.tempoRange[0]) ||
    !isInt(p.tempoRange[1])
  ) {
    errors.push("p.tempoRange must be a [lo, hi] pair of integers");
  } else {
    const [lo, hi] = p.tempoRange as [number, number];
    if (!(lo > 0 && lo <= hi && hi < 400)) {
      errors.push(`p.tempoRange must satisfy 0 < lo <= hi < 400, got [${lo}, ${hi}]`);
    }
    if (!isInt(p.defaultTempo) || p.defaultTempo < lo || p.defaultTempo > hi) {
      errors.push("p.defaultTempo must be an integer inside p.tempoRange");
    }
  }

  if (typeof p.harmony !== "object" || p.harmony === null) {
    errors.push("p.harmony must be an object");
  } else {
    const h = p.harmony as Record<string, unknown>;
    const numerals = new Set<string>();
    if (!Array.isArray(h.vocabulary) || h.vocabulary.length === 0) {
      errors.push("p.harmony.vocabulary must be a non-empty array");
    } else {
      let total = 0;
      for (let i = 0; i < h.vocabulary.length; i++) {
        const e = h.vocabulary[i] as Record<string, unknown>;
        if (
          typeof e !== "object" ||
          e === null ||
          typeof e.numeral !== "string" ||
          typeof e.weight !== "number"
        ) {
          errors.push(`p.harmony.vocabulary[${i}] must be { numeral, weight }`);
          continue;
        }
        if (numerals.has(e.numeral)) {
          errors.push(`p.harmony.vocabulary has duplicate numeral '${e.numeral}'`);
        }
        numerals.add(e.numeral);
        if (!isFiniteNumber(e.weight) || e.weight < 0) {
          errors.push(`p.harmony.vocabulary[${i}].weight must be a finite number >= 0`);
        }
        total += e.weight;
      }
      if (!(Math.abs(total - 1) <= 0.001)) {
        // Inverted guard: a NaN total (Math.abs(NaN-1) <= 0.001 is
        // false) must fail, not silently pass.
        errors.push(
          `p.harmony.vocabulary weights sum to ${total}, expected 1.000 (+/- 0.001)`,
        );
      }
    }
    if (!Array.isArray(h.progressions) || h.progressions.length === 0) {
      errors.push("p.harmony.progressions must be a non-empty array");
    } else {
      h.progressions.forEach((prog, i) => {
        if (!Array.isArray(prog) || prog.length === 0) {
          errors.push(`p.harmony.progressions[${i}] must be a non-empty token array`);
          return;
        }
        for (const token of prog) {
          if (typeof token !== "string" || !numerals.has(token)) {
            errors.push(
              `p.harmony.progressions[${i}] token '${String(token)}' is not in vocabulary`,
            );
          }
        }
      });
    }
    for (const key of HARMONY_PROB_KEYS) {
      if (!isProb(h[key])) {
        errors.push(`p.harmony.${key} must be a number in [0, 1]`);
      }
    }
  }

  if (typeof p.melody !== "object" || p.melody === null) {
    errors.push("p.melody must be an object");
  } else {
    const m = p.melody as Record<string, unknown>;
    if (!isIntRange0To127(m.range)) {
      errors.push("p.melody.range must be [lo, hi] integers within 0-127, lo <= hi");
    }
    for (const key of MELODY_PROB_KEYS) {
      if (!isProb(m[key])) {
        errors.push(`p.melody.${key} must be a number in [0, 1]`);
      }
    }
    if (!isInt(m.maxLeapSemitones) || m.maxLeapSemitones < 1 || m.maxLeapSemitones > 24) {
      errors.push("p.melody.maxLeapSemitones must be an integer in 1-24");
    }
    if (typeof m.contour !== "string" || !CONTOUR_VALUES.includes(m.contour)) {
      errors.push(`p.melody.contour must be one of: ${CONTOUR_VALUES.join(", ")}`);
    }
  }

  if (typeof p.rhythm !== "object" || p.rhythm === null) {
    errors.push("p.rhythm must be an object");
  } else {
    const r = p.rhythm as Record<string, unknown>;
    if (
      !isFiniteNumber(r.swingRatio) ||
      r.swingRatio < 0.5 ||
      r.swingRatio > 0.75
    ) {
      errors.push("p.rhythm.swingRatio must be a finite number in [0.5, 0.75]");
    }
    if (
      !isFiniteNumber(r.gridDivisions) ||
      (r.gridDivisions !== 2 && r.gridDivisions !== 4)
    ) {
      errors.push("p.rhythm.gridDivisions must be 2 or 4");
    }
    if (!isInt(r.densityDefault) || r.densityDefault < 0 || r.densityDefault > 5) {
      errors.push("p.rhythm.densityDefault must be an integer in 0-5");
    }
    if (typeof r.defaultFeel !== "string" || !FEEL_VALUES.includes(r.defaultFeel)) {
      errors.push(`p.rhythm.defaultFeel must be one of: ${FEEL_VALUES.join(", ")}`);
    }
    if (
      typeof r.bassPattern !== "string" ||
      !BASS_PATTERN_VALUES.includes(r.bassPattern)
    ) {
      errors.push(`p.rhythm.bassPattern must be one of: ${BASS_PATTERN_VALUES.join(", ")}`);
    }
    if (
      typeof r.chordPattern !== "string" ||
      !CHORD_PATTERN_VALUES.includes(r.chordPattern)
    ) {
      errors.push(`p.rhythm.chordPattern must be one of: ${CHORD_PATTERN_VALUES.join(", ")}`);
    }
    if (
      !Array.isArray(r.meters) ||
      r.meters.length === 0 ||
      !r.meters.every((mt) => typeof mt === "string" && METER_VALUES.includes(mt))
    ) {
      errors.push(`p.rhythm.meters must be a non-empty array of: ${METER_VALUES.join(", ")}`);
    }
  }

  if (typeof p.voicing !== "object" || p.voicing === null) {
    errors.push("p.voicing must be an object");
  } else {
    const v = p.voicing as Record<string, unknown>;
    if (typeof v.style !== "string" || !VOICING_STYLE_VALUES.includes(v.style)) {
      errors.push(`p.voicing.style must be one of: ${VOICING_STYLE_VALUES.join(", ")}`);
    }
    if (!isProb(v.rootlessRate)) {
      errors.push("p.voicing.rootlessRate must be a number in [0, 1]");
    }
    if (!isProb(v.spreadBias)) {
      errors.push("p.voicing.spreadBias must be a number in [0, 1]");
    }
    if (typeof v.inversionAwareness !== "boolean") {
      errors.push("p.voicing.inversionAwareness must be a boolean");
    }
    if (typeof v.registers !== "object" || v.registers === null) {
      errors.push("p.voicing.registers must be an object");
    } else {
      const reg = v.registers as Record<string, unknown>;
      for (const key of ["bass", "chords", "pad", "melody"] as const) {
        if (!isIntRange0To127(reg[key])) {
          errors.push(
            `p.voicing.registers.${key} must be [lo, hi] integers within 0-127, lo <= hi`,
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
