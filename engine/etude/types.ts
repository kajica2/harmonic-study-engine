/**
 * engine/etude/types.ts - PRD-001 Phase 3 Slice 1 (REQ-ETU-1/2/10..15).
 *
 * Etude data shapes + the hand-rolled constraint validator (precedent:
 * validateStyleProfile in engine/styles/index.ts). The types file is
 * data-shape + validator only; generateEtude and feasibilityOf live in
 * assemble.ts per the design (docs/PHASE-3-ETUDE.md section 5).
 *
 * Purity: relative imports only; the value import of parseNumeral from
 * ./harmony is safe because harmony.ts imports THIS file type-only
 * (erased at runtime), so no runtime cycle exists.
 */

import type { Versioned } from "../core/versioned";
import type { CanonicalId, InstanceId } from "../core/ids";
import type { Seed } from "../core/rng";
import type { StyleId } from "../styles/types";
import { shippedStyleIds } from "../styles/index";
import type { Difficulty } from "../styles/difficulty";
import { isDifficulty } from "../styles/difficulty";
import type { Annotation } from "../pedagogy/types";
import { parseNumeral } from "./harmony";

/** PRD 11.1 "mode" = tonal mode. Named to never collide with app Mode. */
export type EtudeMode = "major" | "minor";

/** Bars: integer 4..32. v1 meter is 4/4 only (documented simplification;
 * StyleProfile.meters stays unused for etudes until a later phase). */

export interface HarmonyConstraints {
  /** null = unrestricted. Tokens are chord quality symbols:
   * "maj7" | "7" | "m7" | "m7b5" | "maj9" | "9" | "sus4" | "6", plus the
   * triad tokens "maj" | "min" | "dim" | "dim7" | "alt" | "maj6" | "m9"
   * (superset documented in the Slice 1 report - pop/classical triads
   * need representation). */
  readonly allowedQualities: readonly string[] | null;
  /** null = unrestricted. Numeral tokens in the D21 grammar. */
  readonly allowedNumerals: readonly string[] | null;
  readonly startOn: string | null; // numeral token, bar 0 forced
  readonly endOn: string | null; // numeral token, last bar substituted (REQ-ETU-13)
  readonly requireChromaticism: boolean; // >= 1 non-diatonic chord guaranteed
}

export interface MelodyConstraints {
  readonly maxIntervalSemitones: number | null; // 1..24; null = profile value
  readonly chordTonesOnStrongBeats: boolean; // forces P = 1.0
  readonly range: readonly [number, number] | null; // MIDI; null = profile range
}

export interface RhythmConstraints {
  readonly straightRhythmsOnly: boolean; // syncopation forced to 0
}

/** REQ-ETU-1/2. The FULL generation input; also the REQ-ETU-3 URL payload. */
export interface EtudeConstraints extends Versioned {
  readonly styleId: StyleId;
  readonly key: number; // tonic pitch class 0..11
  readonly mode: EtudeMode;
  readonly difficulty: Difficulty; // 1..5
  readonly bars: number; // int 4..32
  readonly tempo: number | null; // null = profile.defaultTempo
  readonly seed: Seed; // uint32
  readonly harmony: HarmonyConstraints;
  readonly melody: MelodyConstraints;
  readonly rhythm: RhythmConstraints;
}

export interface EtudeChord {
  readonly bar: number; // 0-based
  readonly numeral: string; // grammar token, e.g. "ii7", "bII7", "V7alt"
  readonly rootPc: number; // 0..11
  readonly qualitySymbol: string; // "m7" | "dom7" | "maj7" | "halfdim" | "maj9" | "dom9" | "sus4" | "maj6" | ...
  readonly name: string; // display, spelled via engine/core/spelling: "Dm7"
  readonly notes: readonly number[]; // MIDI ascending; drop2-spread when profile says so
}

/** Melody grid: absolute eighth-note slots; 8 slots per 4/4 bar.
 * slot % 4 === 0 -> beat 1/3 (strong), slot % 2 === 0 -> beat (metric). */
export interface EtudeNote {
  readonly slot: number; // 0-based absolute slot
  readonly midi: number; // 0..127
  readonly durationSlots: number; // >= 1, no overlap (test-pinned)
  readonly velocity: number; // 0..1, derived: strong 0.85 / weak 0.65 / sync 0.75
  readonly strongBeat: boolean; // slot % 2 === 0
  readonly syncopated: boolean; // onset off the beat grid (slot % 2 !== 0)
}

/** REQ-ETU-10..15 artifact. PRD 11.1 Etude. */
export interface Etude extends Versioned {
  readonly canonicalId: CanonicalId; // deriveCanonicalId("etu", seed, constraints)
  readonly instanceId: InstanceId; // makeInstanceId(nowMs, seq) - injected
  readonly title: string; // deterministic from the rng stream (harmony -> melody -> title)
  readonly tempo: number;
  readonly styleId: StyleId;
  readonly key: number;
  readonly mode: EtudeMode;
  readonly bars: number;
  readonly difficulty: Difficulty;
  readonly seed: Seed;
  readonly chords: readonly EtudeChord[]; // length === bars
  readonly melody: readonly EtudeNote[]; // ascending by slot, no overlaps
  readonly annotations: readonly Annotation[];
  readonly constraints: EtudeConstraints;
}

/** REQ-PED-1 result envelope. `annotations` IS `etude.annotations` (same array). */
export interface EtudeResult {
  readonly etude: Etude;
  readonly annotations: readonly Annotation[];
}

/** Structurally compatible with src/lib/paths.ts HarmonicStep (one step =
 * one BAR for generated etudes - finding 4). The adapter casts; engine
 * never imports src/. */
export interface EtudeBarStep {
  readonly name: string;
  readonly notes: readonly number[];
  readonly descriptions: string;
}

export interface EtudeValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/** Quality tokens accepted in HarmonyConstraints.allowedQualities.
 * Superset of the design's jazz-era list so triad-based styles can be
 * filtered too (documented deviation). */
export const QUALITY_TOKENS: readonly string[] = [
  "maj",
  "min",
  "dim",
  "dim7",
  "m7b5",
  "maj7",
  "m7",
  "7",
  "7alt",
  "maj9",
  "9",
  "m9",
  "sus4",
  "6",
];

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isNumeralTokenArray(v: unknown): v is readonly string[] | null {
  return v === null || (Array.isArray(v) && v.every((t) => typeof t === "string"));
}

/**
 * Hand-rolled validator (precedent: validateStyleProfile). Checks every
 * bound in the type comments above; prefixes error paths ("c.bars",
 * "c.harmony.endOn"). Numeral tokens (allowedNumerals/startOn/endOn)
 * must parseNumeral cleanly against the candidate's mode (when the mode
 * itself is valid - no cascaded errors).
 */
export function validateEtudeConstraints(
  candidate: unknown,
): EtudeValidation {
  const errors: string[] = [];
  if (typeof candidate !== "object" || candidate === null) {
    return { ok: false, errors: ["c must be an object"] };
  }
  const c = candidate as Record<string, unknown>;

  if (!isInt(c.version) || c.version !== 1) {
    errors.push("c.version must be the integer 1");
  }
  const styleIds: readonly string[] = shippedStyleIds();
  if (typeof c.styleId !== "string" || !styleIds.includes(c.styleId)) {
    errors.push(
      `c.styleId must be one of the shipped styles: ${styleIds.join(", ")}`,
    );
  }
  if (!isInt(c.key) || c.key < 0 || c.key > 11) {
    errors.push(`c.key must be an integer pitch class 0-11, got ${String(c.key)}`);
  }
  if (c.mode !== "major" && c.mode !== "minor") {
    errors.push("c.mode must be 'major' or 'minor'");
  }
  if (!isDifficulty(c.difficulty)) {
    errors.push("c.difficulty must be an integer 1-5");
  }
  if (!isInt(c.bars) || c.bars < 4 || c.bars > 32) {
    errors.push(`c.bars must be an integer 4-32, got ${String(c.bars)}`);
  }
  // Tempo must be null or an INTEGER in (0, 400). Deliberately isInt,
  // not the global isFinite: isFinite("120") coerces and returns true,
  // which let string tempos (and non-integers) through the old check.
  if (
    c.tempo !== null &&
    (!isInt(c.tempo) || (c.tempo as number) <= 0 || (c.tempo as number) >= 400)
  ) {
    errors.push("c.tempo must be null or an integer in (0, 400)");
  }
  if (!isInt(c.seed) || (c.seed as number) < 0 || (c.seed as number) > 4294967295) {
    errors.push("c.seed must be an integer uint32 0-4294967295");
  }

  const mode: EtudeMode = c.mode === "minor" ? "minor" : "major";
  const modeValid = c.mode === "major" || c.mode === "minor";

  if (typeof c.harmony !== "object" || c.harmony === null) {
    errors.push("c.harmony must be an object");
  } else {
    const h = c.harmony as Record<string, unknown>;
    if (h.allowedQualities !== null) {
      if (!Array.isArray(h.allowedQualities)) {
        errors.push("c.harmony.allowedQualities must be an array or null");
      } else {
        h.allowedQualities.forEach((q, i) => {
          if (typeof q !== "string" || !QUALITY_TOKENS.includes(q)) {
            errors.push(
              `c.harmony.allowedQualities[${i}] must be one of: ${QUALITY_TOKENS.join(", ")}`,
            );
          }
        });
      }
    }
    if (!isNumeralTokenArray(h.allowedNumerals)) {
      errors.push("c.harmony.allowedNumerals must be an array of strings or null");
    } else if (h.allowedNumerals !== null && modeValid) {
      h.allowedNumerals.forEach((t, i) => {
        if (parseNumeral(t, mode) === null) {
          errors.push(`c.harmony.allowedNumerals[${i}] '${t}' does not parse in the D21 grammar`);
        }
      });
    }
    if (!isNullableString(h.startOn)) {
      errors.push("c.harmony.startOn must be a string or null");
    } else if (h.startOn !== null && modeValid && parseNumeral(h.startOn, mode) === null) {
      errors.push(`c.harmony.startOn '${h.startOn}' does not parse in the D21 grammar`);
    }
    if (!isNullableString(h.endOn)) {
      errors.push("c.harmony.endOn must be a string or null");
    } else if (h.endOn !== null && modeValid && parseNumeral(h.endOn, mode) === null) {
      errors.push(`c.harmony.endOn '${h.endOn}' does not parse in the D21 grammar`);
    }
    if (typeof h.requireChromaticism !== "boolean") {
      errors.push("c.harmony.requireChromaticism must be a boolean");
    }
  }

  if (typeof c.melody !== "object" || c.melody === null) {
    errors.push("c.melody must be an object");
  } else {
    const m = c.melody as Record<string, unknown>;
    if (
      m.maxIntervalSemitones !== null &&
      (!isInt(m.maxIntervalSemitones) ||
        (m.maxIntervalSemitones as number) < 1 ||
        (m.maxIntervalSemitones as number) > 24)
    ) {
      errors.push("c.melody.maxIntervalSemitones must be null or an integer 1-24");
    }
    if (typeof m.chordTonesOnStrongBeats !== "boolean") {
      errors.push("c.melody.chordTonesOnStrongBeats must be a boolean");
    }
    if (
      m.range !== null &&
      !(
        Array.isArray(m.range) &&
        m.range.length === 2 &&
        isInt(m.range[0]) &&
        isInt(m.range[1]) &&
        (m.range[0] as number) >= 0 &&
        (m.range[1] as number) <= 127 &&
        (m.range[0] as number) <= (m.range[1] as number)
      )
    ) {
      errors.push("c.melody.range must be null or [lo, hi] MIDI integers 0-127, lo <= hi");
    }
  }

  if (typeof c.rhythm !== "object" || c.rhythm === null) {
    errors.push("c.rhythm must be an object");
  } else {
    const r = c.rhythm as Record<string, unknown>;
    if (typeof r.straightRhythmsOnly !== "boolean") {
      errors.push("c.rhythm.straightRhythmsOnly must be a boolean");
    }
  }

  return { ok: errors.length === 0, errors };
}
