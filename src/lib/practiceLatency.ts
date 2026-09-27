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
 */

import { K, storageGet, storageSet } from "./storage";
import { compensationMs } from "../../engine/practice/latency";

export interface LatencyRecord {
  version: 1;
  /** MIDI-path + player bias (the wizard's median minus output). */
  inputLatencyMs: number;
  /** Browser-reported output latency AT CALIBRATION TIME. */
  outputLatencyMs: number;
  source: "midi" | "manual";
  calibratedAtMs: number;
  deviceName: string | null;
}

function isFinite0_500(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 500;
}

function normalize(raw: unknown): LatencyRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  if (!isFinite0_500(r.inputLatencyMs) || !isFinite0_500(r.outputLatencyMs)) return null;
  if (r.source !== "midi" && r.source !== "manual") return null;
  if (typeof r.calibratedAtMs !== "number" || !Number.isFinite(r.calibratedAtMs)) return null;
  const deviceName =
    typeof r.deviceName === "string" && r.deviceName.length > 0 ? r.deviceName : null;
  return {
    version: 1,
    inputLatencyMs: r.inputLatencyMs,
    outputLatencyMs: r.outputLatencyMs,
    source: r.source,
    calibratedAtMs: r.calibratedAtMs,
    deviceName,
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
 * THE single-sum law: the ONE number the matcher subtracts
 * (compensated = tap - this). 0 when uncalibrated (no record) -
 * uncalibrated detection still works, just uncompensated.
 */
export function compensationOf(r: LatencyRecord | null): number {
  if (r === null) return 0;
  return compensationMs(r.inputLatencyMs, r.outputLatencyMs);
}

/** Wipe (panel Clear path). Never throws. */
export function clearLatency(): void {
  try {
    localStorage.removeItem(K.practiceLatency);
  } catch {
    // Storage unavailable - nothing to clear.
  }
}
