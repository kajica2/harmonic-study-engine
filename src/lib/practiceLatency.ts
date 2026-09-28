/**
 * src/lib/practiceLatency.ts - PRD-001 Phase 7 S3 (REQ-PRAC-40/41,
 * D134): the latency-record adapter over localStorage
 * `practice.latency` (NOT zustand - performanceLog precedent).
 *
 * THE SINGLE-SUM LAW (risk register): the engine matcher sees ONE
 * number, `latencyCompensationMs = input + output`. That sum is
 * formed in EXACTLY one place - compensationOf() below (delegating
 * to engine/practice/compensationMs math) - so no consumer can
 * double-subtract. Pinned in practiceLatency.test.ts.
 *
 * Honesty limits (D134, verbatim obligation in the panel copy):
 * browser-reported outputLatency EXCLUDES Bluetooth/USB/display
 * buffering; calibration is per audio path - recalibrate when
 * switching headphones/speakers. deviceName + calibratedAtMs are
 * stored and SHOWN next to the number so staleness is visible.
 *
 * S4 (D141): the record WIDENS IN PLACE (version stays 1, defaults-
 * at-read, no migration): inputLatencyMs -> number | null and the
 * fallback pair (fallbackInputLatencyMs / fallbackCalibratedAtMs)
 * ride the SAME K.practiceLatency key. Keyboard/touch taps arrive
 * via a different input path than hardware MIDI, so they carry
 * their OWN number - applying the MIDI number to a keyboard tap is
 * fake compensation. One compensation getter per source, each the
 * single-sum law for its path.
 */

import { K, storageGet, storageSet } from "./storage";
import { compensationMs } from "../../engine/practice/latency";

export interface LatencyRecord {
  version: 1;
  /** MIDI-path + player bias (the wizard's median minus output).
   *  S4 (D141): null = never calibrated via MIDI/manual-MIDI (a
   *  fallback-only record is legal). */
  inputLatencyMs: number | null;
  /** Browser-reported output latency AT LAST CALIBRATION (any
   *  source) - shared by all paths (same speakers, same ctx). */
  outputLatencyMs: number;
  /** Discriminator for the MIDI field; IGNORED when inputLatencyMs
   *  is null (a fallback-only save keeps source "manual" - harmless). */
  source: "midi" | "manual";
  /** When the MIDI/manual field (inputLatencyMs) was last
   *  calibrated - PER SOURCE, not "any": a fallback save preserves
   *  this stamp verbatim (the fallback leg carries its own
   *  fallbackCalibratedAtMs below). */
  calibratedAtMs: number;
  deviceName: string | null;
  /** S4 (D141): keyboard/touch tap path. null = uncalibrated
   *  (legacy records lack the keys -> normalize to null). */
  fallbackInputLatencyMs: number | null;
  /** S4 (D141): when the FALLBACK field was last calibrated. */
  fallbackCalibratedAtMs: number | null;
}

function isFinite0_500(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 500;
}

/** S4 (D141): the widened acceptance - finite 0..500 OR null. Garbage
 *  (string, NaN, wild number) resolves to null, NEVER a fake 0. */
function isFinite0_500OrNull(v: unknown): number | null {
  if (v === null) return null;
  return isFinite0_500(v) ? v : null;
}

function normalize(raw: unknown): LatencyRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  // S4 (D141): inputLatencyMs accepts finite 0..500 OR null (a
  // fallback-only record is legal); output stays a HARD requirement.
  if (r.inputLatencyMs !== null && !isFinite0_500(r.inputLatencyMs)) return null;
  if (!isFinite0_500(r.outputLatencyMs)) return null;
  if (r.source !== "midi" && r.source !== "manual") return null;
  if (typeof r.calibratedAtMs !== "number" || !Number.isFinite(r.calibratedAtMs)) return null;
  const deviceName =
    typeof r.deviceName === "string" && r.deviceName.length > 0 ? r.deviceName : null;
  // S4: the fallback fields accept finite 0..500 OR null OR ABSENT
  // (-> null). A legacy v1 record (no fallback keys) round-trips
  // UNCHANGED - the no-v5/migration-free law (defaults-at-read).
  const fallbackInputLatencyMs = isFinite0_500OrNull(r.fallbackInputLatencyMs);
  const fallbackCalibratedAtMs =
    typeof r.fallbackCalibratedAtMs === "number" &&
    Number.isFinite(r.fallbackCalibratedAtMs)
      ? r.fallbackCalibratedAtMs
      : null;
  return {
    version: 1,
    inputLatencyMs: r.inputLatencyMs === null ? null : (r.inputLatencyMs as number),
    outputLatencyMs: r.outputLatencyMs,
    source: r.source,
    calibratedAtMs: r.calibratedAtMs,
    deviceName,
    fallbackInputLatencyMs,
    fallbackCalibratedAtMs,
  };
}

/** Load the record. Corrupt -> null (NEVER a fake 0, honesty law). */
export function loadLatency(): LatencyRecord | null {
  const raw = storageGet(K.practiceLatency);
  if (raw === null || raw === "") return null;
  try {
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Persist (normalized at write too - garbage never reaches storage). */
export function saveLatency(r: LatencyRecord): void {
  const n = normalize(r);
  if (n === null) return;
  storageSet(K.practiceLatency, JSON.stringify(n));
}

/**
 * THE single-sum law (MIDI path): the ONE number the matcher
 * subtracts (compensated = tap - this). 0 when uncalibrated (no
 * record) OR when the MIDI field is null (S4: a fallback-only
 * record - behavior for existing records is IDENTICAL to shipped).
 */
export function compensationOf(r: LatencyRecord | null): number {
  if (r === null || r.inputLatencyMs === null) return 0;
  return compensationMs(r.inputLatencyMs, r.outputLatencyMs);
}

/**
 * S4 (D141): the SAME single-sum law for the keyboard/touch tap
 * path. Uncalibrated fallback = 0 - symmetric with MIDI-uncaibrated
 * ("uncalibrated runs uncompensated", the shipped panel law).
 */
export function compensationOfFallback(r: LatencyRecord | null): number {
  if (r === null || r.fallbackInputLatencyMs === null) return 0;
  return compensationMs(r.fallbackInputLatencyMs, r.outputLatencyMs);
}

/** Wipe (panel Clear path). Never throws. */
export function clearLatency(): void {
  try {
    localStorage.removeItem(K.practiceLatency);
  } catch {
    // Storage unavailable - nothing to clear.
  }
}
