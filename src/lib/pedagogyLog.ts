/**
 * src/lib/pedagogyLog.ts - PRD-001 Phase 6 (REQ-PED-40/41/42, D107).
 *
 * Practice-log adapter over localStorage `pedagogy.log` (NOT zustand):
 * the performanceLog.ts precedent (append-only, capped, corrupt
 * fallback, ISO stamps at the adapter). Engine log.ts stays pure
 * (nowMs param); summary is a PURE derivation, never stored.
 */

import { K, storageGet, storageSet } from "./storage";
import {
  appendEntry,
  summarizeLog,
  type LogSummary,
  type PracticeEntry,
} from "../../engine/pedagogy/log";

export const PEDAGOGY_LOG_CAP = 500;

function isEntry(value: unknown): value is PracticeEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.atMs === "number" &&
    (v.mode === "etude" || v.mode === "compose" || v.mode === "explore" || v.mode === "ear") &&
    typeof v.refId === "string" &&
    (v.outcome === "correct" || v.outcome === "incorrect" || v.outcome === "partial") &&
    typeof v.durationSec === "number"
  );
}

/** Load the log. Never throws (corrupt -> []). */
export function loadLog(): readonly PracticeEntry[] {
  const raw = storageGet(K.pedagogyLog);
  if (raw === null || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isEntry);
  } catch {
    return [];
  }
}

function persist(log: readonly PracticeEntry[]): void {
  storageSet(K.pedagogyLog, JSON.stringify(log));
}

/**
 * Append one entry (adapter stamps atMs when omitted; ISO stamps live
 * at the adapter per ADR-005). Returns the stored copy; never throws.
 */
export function appendLog(
  entry: Omit<PracticeEntry, "version"> & { version?: number },
): PracticeEntry {
  const full: PracticeEntry = {
    version: 1,
    atMs: entry.atMs,
    mode: entry.mode,
    refId: entry.refId,
    outcome: entry.outcome,
    durationSec: entry.durationSec,
    conceptId: entry.conceptId ?? null,
  };
  const next = appendEntry(loadLog(), full, PEDAGOGY_LOG_CAP);
  persist(next);
  return next[next.length - 1];
}

/** Summarize at nowMs (default Date.now HERE, adapter only). */
export function summarize(nowMs: number = Date.now()): LogSummary {
  return summarizeLog(loadLog(), nowMs);
}

/** Wipe the log (panel Clear path). Never throws. */
export function clearLog(): void {
  try {
    localStorage.removeItem(K.pedagogyLog);
  } catch {
    // Storage unavailable - nothing to clear.
  }
}
