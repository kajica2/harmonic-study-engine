/**
 * src/lib/srsStore.ts - PRD-001 Phase 6 (REQ-PED-30/31/32, D107).
 *
 * SRS adapter over localStorage `pedagogy.srs` (NOT zustand): the
 * idea-library pattern (hse.ideas precedent). Engine srs.ts stays
 * pure (nowMs param, ADR-005); this adapter stamps Date.now and
 * guards storage (corrupt -> fallback, quota -> void, cap 10).
 */

import { K, storageGet, storageSet } from "./storage";
import { newSrsState, reviewSrs, type EarGradeBinary, type SrsState } from "../../engine/pedagogy/srs";

export const SRS_CAP = 10;

function isSrsState(value: unknown): value is SrsState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.conceptId === "string" &&
    typeof v.lastSeenMs === "number" &&
    typeof v.intervalDays === "number" &&
    typeof v.ease === "number" &&
    typeof v.streak === "number" &&
    typeof v.nextDueMs === "number"
  );
}

/** Load the SRS map. Never throws (corrupt -> {}). */
export function loadSrs(): Record<string, SrsState> {
  const raw = storageGet(K.pedagogySrs);
  if (raw === null || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, SrsState> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isSrsState(value) && value.conceptId === key) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the map (capped at 10 concepts). Void on quota failure. */
export function saveSrs(map: Record<string, SrsState>): void {
  const keys = Object.keys(map);
  const trimmed: Record<string, SrsState> = {};
  const keep = keys.slice(-SRS_CAP);
  for (const key of keep) trimmed[key] = map[key];
  storageSet(K.pedagogySrs, JSON.stringify(trimmed));
}

/** Missing -> fresh state (never throws). */
export function getSrs(conceptId: string): SrsState {
  const map = loadSrs();
  return map[conceptId] ?? newSrsState(conceptId);
}

/**
 * Record one review (adapter stamps nowMs; engine stays pure).
 * Returns the new state; persists (capped); never throws on I/O.
 */
export function recordReview(
  conceptId: string,
  grade: EarGradeBinary,
  nowMs: number = Date.now(),
): SrsState {
  const map = loadSrs();
  const current = map[conceptId] ?? newSrsState(conceptId);
  const next = reviewSrs(current, grade, nowMs);
  map[conceptId] = next;
  saveSrs(map);
  return next;
}

/** Test helper: storage key constant (drift-guard visible). */
export function srsStorageKey(): string {
  return K.pedagogySrs;
}
