/**
 * engine/pedagogy/log.ts - PRD-001 Phase 6 (REQ-PED-40/41/42).
 *
 * Practice-log entries + summary math. Pure math: minutesPerDay sums
 * durationSec/60 per UTC day key (entries outside the 30d window
 * excluded); conceptCounts tallies non-null conceptIds over the WHOLE
 * log (not windowed); rollingAccuracy over the last 20 entries
 * (correct=1, partial=0.5, incorrect=0). Rounding to 2 decimals lives
 * at the ADAPTER display layer, never here (raw fractions).
 *
 * Purity: relative imports only, no clock, no Math.random, no console.
 */

import type { Versioned } from "../core/versioned";

export type PracticeOutcome = "correct" | "incorrect" | "partial";

export interface PracticeEntry extends Versioned {
  readonly atMs: number;
  readonly mode: "etude" | "compose" | "explore" | "ear";
  readonly refId: string;
  readonly outcome: PracticeOutcome;
  readonly durationSec: number;
  readonly conceptId: string | null;
}

export interface LogSummary {
  readonly minutesPerDay: Readonly<Record<string, number>>;
  readonly conceptCounts: Readonly<Record<string, number>>;
  readonly rollingAccuracy: number | null;
  readonly totalAttempts: number;
}

/** Append one entry, capping at `cap` (default 500, oldest dropped). */
export function appendEntry(
  log: readonly PracticeEntry[],
  entry: PracticeEntry,
  cap: number = 500,
): readonly PracticeEntry[] {
  const safe: PracticeEntry = {
    version: 1,
    atMs: entry.atMs,
    mode: entry.mode,
    refId: entry.refId,
    outcome: entry.outcome,
    durationSec: Math.max(0, Math.min(3600, entry.durationSec)),
    conceptId: entry.conceptId,
  };
  const next = [...log, safe];
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

/** UTC YYYY-MM-DD for one epoch-ms timestamp (pure civil math, no Date). */
function utcDayKey(atMs: number): string {
  // Days since Unix epoch (floor for negatives).
  const z0 = Math.floor(atMs / 86400e3);
  // Howard Hinnant civil_from_days: shift to civil 0000-03-01 base.
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Summarize the log at `nowMs` (injected; window:
 * nowMs-30d <= atMs <= nowMs for minutesPerDay only).
 */
export function summarizeLog(
  log: readonly PracticeEntry[],
  nowMs: number,
): LogSummary {
  const windowStart = nowMs - 30 * 86400e3;
  const minutesPerDay: Record<string, number> = {};
  const conceptCounts: Record<string, number> = {};
  for (const e of log) {
    if (e.conceptId !== null) {
      conceptCounts[e.conceptId] = (conceptCounts[e.conceptId] ?? 0) + 1;
    }
    if (e.atMs >= windowStart && e.atMs <= nowMs) {
      const key = utcDayKey(e.atMs);
      minutesPerDay[key] = (minutesPerDay[key] ?? 0) + e.durationSec / 60;
    }
  }
  const tail = log.slice(-20);
  let rollingAccuracy: number | null = null;
  if (tail.length > 0) {
    let sum = 0;
    for (const e of tail) {
      if (e.outcome === "correct") sum += 1;
      else if (e.outcome === "partial") sum += 0.5;
    }
    rollingAccuracy = sum / tail.length;
  }
  return {
    minutesPerDay,
    conceptCounts,
    rollingAccuracy,
    totalAttempts: log.length,
  };
}
