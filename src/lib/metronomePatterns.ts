/**
 * src/lib/metronomePatterns.ts - PRD-001 Phase 3 Slice 3 (D32/D34).
 *
 * Pure metronome config + click math. THE safety contract (F1): with
 * the DEFAULT config (subdivision 1, accentBeats [0]) this module
 * reproduces the legacy rhythm.ts playStep click pattern EXACTLY -
 * T1 in metronomePatterns.test.ts is the exhaustive per-meter oracle
 * mirroring the FROZEN tests/rhythm.test.ts spy (single-arg
 * playMetronomeClick(true) on step 0). If T1 goes red, the audible
 * click pattern changed - stop and fix before shipping.
 *
 * The 16th-note grid, the stepsPerMeasure table, and the
 * onMeasureStart timing live in rhythm.ts and are IMMUTABLE here;
 * `stepsPerMeasureFor` is a MIRROR of that table (pinned against the
 * engine in T1) used only to derive beats-per-measure for the accent
 * chips and the count-in.
 *
 * Node-tested (src/lib pure logic). Imports ONLY the TimeSignature
 * TYPE from ./rhythm (type-only: no runtime cycle with audio.ts).
 */

import type { TimeSignature } from "./rhythm";

// ---------- config (D32) ------------------------------------------------

export type MetronomePreset = "beep" | "click" | "shaker";
export type MetronomeSubdivision = 1 | 2 | 3 | 4;

export interface MetronomeConfig {
  /** 0..100. Independent click bus (D33) - NOT the master volume. */
  volume: number;
  /** Click synthesis preset (D33). "beep" = the current sound. */
  preset: MetronomePreset;
  /** Clicks per BEAT (the meter's beat - see SUBDIVISION_TITLES). */
  subdivision: MetronomeSubdivision;
  /** 0-based BEAT indices sounded high. [0] = downbeat (legacy). */
  accentBeats: readonly number[];
  /** Pre-roll bars before playback (REQ-PRAC-10). 0 = off (legacy). */
  countInBars: 0 | 1 | 2;
}

export const DEFAULT_METRONOME_CONFIG: MetronomeConfig = {
  volume: 80,
  preset: "beep",
  subdivision: 1,
  accentBeats: [0],
  countInBars: 0,
};

const PRESETS: readonly MetronomePreset[] = ["beep", "click", "shaker"];
const SUBDIVISIONS: readonly MetronomeSubdivision[] = [1, 2, 3, 4];
const COUNT_IN_OPTIONS: readonly number[] = [0, 1, 2];

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Corruption-safe hydrate (D32): ANY stored JSON shape maps to a
 * valid config. Out-of-range accent beats are KEPT (a meter change
 * must never rewrite user data - UI + clickActionFor ignore beats
 * beyond the current meter's count) but non-integers/negatives are
 * dropped. An explicit empty accentBeats array is a VALID user
 * choice (all-weak clicks) and survives normalization.
 */
export function normalizeMetronomeConfig(raw: unknown): MetronomeConfig {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_METRONOME_CONFIG };
  }
  const r = raw as Record<string, unknown>;

  const volume =
    typeof r.volume === "number" && Number.isFinite(r.volume)
      ? Math.min(100, Math.max(0, r.volume))
      : DEFAULT_METRONOME_CONFIG.volume;

  const preset =
    typeof r.preset === "string" &&
    (PRESETS as readonly string[]).includes(r.preset)
      ? (r.preset as MetronomePreset)
      : DEFAULT_METRONOME_CONFIG.preset;

  const subdivision =
    isInt(r.subdivision) &&
    (SUBDIVISIONS as readonly number[]).includes(r.subdivision)
      ? (r.subdivision as MetronomeSubdivision)
      : DEFAULT_METRONOME_CONFIG.subdivision;

  let accentBeats: readonly number[] = DEFAULT_METRONOME_CONFIG.accentBeats;
  if (Array.isArray(r.accentBeats)) {
    const cleaned = Array.from(
      new Set(
        r.accentBeats.filter((b): b is number => isInt(b) && b >= 0),
      ),
    ).sort((a, b) => a - b);
    // Capped at the widest shipped meter (tintal = 16 beats).
    accentBeats = cleaned.slice(0, 16);
  }

  const countInBars =
    isInt(r.countInBars) && COUNT_IN_OPTIONS.includes(r.countInBars)
      ? (r.countInBars as 0 | 1 | 2)
      : DEFAULT_METRONOME_CONFIG.countInBars;

  return { volume, preset, subdivision, accentBeats, countInBars };
}

// ---------- meter math (mirrors the IMMUTABLE rhythm.ts table) ---------

/** 16th steps per measure - mirror of the rhythm.ts setTimeSignature
 *  table (16/12/14/44/64). Pinned against the live engine in T1 so
 *  the two can never drift apart silently. */
export function stepsPerMeasureFor(ts: TimeSignature): number {
  switch (ts) {
    case "6/8":
      return 12;
    case "7/8":
      return 14;
    case "11/4":
      return 44;
    case "tintal":
      return 64;
    case "4/4":
    default:
      return 16;
  }
}

/** Steps per BEAT: eighth-note beats in compound meters, quarter
 *  beats elsewhere - the legacy playStep step%2 vs step%4 split,
 *  now derived instead of hardcoded. */
export function stepsPerBeatFor(ts: TimeSignature): number {
  return ts === "6/8" || ts === "7/8" ? 2 : 4;
}

/** Beats per measure: 4/4 -> 4, 6/8 -> 6, 7/8 -> 7, 11/4 -> 11,
 *  tintal -> 16. Drives the accent-chip count (D36). */
export function beatsPerMeasureFor(ts: TimeSignature): number {
  return stepsPerMeasureFor(ts) / stepsPerBeatFor(ts);
}

// ---------- the click decision (D34) ------------------------------------

export type ClickAction =
  | { kind: "none" }
  | { kind: "click"; high: boolean }
  | { kind: "triplet"; high: boolean; secPerBeat: number };

/** Grid period (16th steps) per subdivision in this meter; null for
 *  the triplet path, which rides WebAudio scheduling BESIDE the grid
 *  (the setInterval rate NEVER changes - D34). s=2/s=4 clamp to a
 *  floor of 1 step: in compound meters s=2 and s=4 both yield the
 *  16th grid (documented in the UI beat tooltip). */
function periodFor(
  subdivision: MetronomeSubdivision,
  stepsPerBeat: number,
): number | null {
  switch (subdivision) {
    case 1:
      return stepsPerBeat;
    case 2:
      return Math.max(1, Math.floor(stepsPerBeat / 2));
    case 4:
      return Math.max(1, Math.floor(stepsPerBeat / 4));
    case 3:
      return null;
    default:
      // Defensive: an out-of-union value degrades to the LEGACY
      // one-click-per-beat pattern, never to the triplet path.
      return stepsPerBeat;
  }
}

/**
 * THE per-step click decision consumed by rhythm.ts playStep (D34).
 * Accents: high = accentBeats.includes(beatIndex) with
 * beatIndex = floor(step / stepsPerBeat); empty accentBeats = all
 * weak (user choice). Default (1, [0]) reproduces the legacy pattern
 * bit-identically (T1).
 */
export function clickActionFor(
  step: number,
  ts: TimeSignature,
  subdivision: MetronomeSubdivision,
  accentBeats: readonly number[],
  secPerBeat: number,
): ClickAction {
  if (!Number.isInteger(step) || step < 0) return { kind: "none" };
  const stepsPerBeat = stepsPerBeatFor(ts);
  const beatIndex = Math.floor(step / stepsPerBeat);
  const high = accentBeats.indexOf(beatIndex) >= 0;
  const period = periodFor(subdivision, stepsPerBeat);
  if (period === null) {
    // Triplet: the on-grid beat-boundary click rides the normal path
    // (kind "triplet" carries the flag); the two off-grid partners
    // are scheduled INSIDE the beat by the caller via
    // audioEngine.scheduleMetronomeClick (WebAudio time, D34).
    if (step % stepsPerBeat !== 0) return { kind: "none" };
    return { kind: "triplet", high, secPerBeat };
  }
  if (step % period !== 0) return { kind: "none" };
  return { kind: "click", high };
}

/**
 * Test oracle (T1): did the LEGACY rhythm.ts playStep fire a click at
 * `step`? Verbatim transcription of the pre-slice predicate:
 * step 0 -> high; 6/8 + 7/8 -> step % 2 === 0; else step % 4 === 0.
 */
export function legacyClickEquivalent(
  step: number,
  ts: TimeSignature,
): boolean {
  if (step === 0) return true;
  if (ts === "6/8" || ts === "7/8") return step % 2 === 0;
  return step % 4 === 0;
}
