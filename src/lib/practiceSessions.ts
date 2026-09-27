/**
 * src/lib/practiceSessions.ts - PRD-001 Phase 7 S3 (REQ-PRAC-60/61/62,
 * D133/D136): the completed-sessions adapter over localStorage
 * `practice.sessions` (NOT zustand), cap 50 (performanceLog
 * precedent), AND the ONE appendAttempt dual-write seam (D120
 * landing): every attempt lands in the open session draft AND in
 * pedagogy.log with mode "practice". Ramp/pause/AB/detection code
 * NEVER imports pedagogyLog directly - this seam is the only writer.
 *
 * DISJOINTNESS LAW (D133): sessions are NOT takes (performanceLog,
 * recorded-audio artifacts) and NOT the legacy set-runner
 * `PracticeSession` rows under synesthesia_practice_sessions. Three
 * concepts, three keys, no foreign keys. The shape guard below
 * REJECTS legacy set-runner rows on purpose (D119 pin, tested).
 *
 * QUOTA law: sessions keep the LAST 50 raw attempts + running
 * aggregates (engine foldAttempt) - summarize-then-drop-raw so a
 * heavy session cannot blow localStorage.
 */

import { K, storageGet, storageSet } from "./storage";
import { appendLog } from "./pedagogyLog";
import type { PracticeOutcome } from "../../engine/pedagogy/log";
import {
  foldAttempt,
  type AttemptV1,
  type SessionRecordV1,
} from "../../engine/practice/session";

/** Cap on STORED sessions (REQ-PRAC-61). */
export const SESSION_CAP = 50;

function isAttempt(v: unknown): v is AttemptV1 {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.atMs === "number" &&
    Number.isFinite(a.atMs) &&
    typeof a.bpm === "number" &&
    Number.isFinite(a.bpm) &&
    (a.phaseKind === "play" || a.phaseKind === "rest" || a.phaseKind === "a" || a.phaseKind === "b" || a.phaseKind === "full") &&
    (a.source === "detect" || a.source === "manual") &&
    typeof a.success === "boolean" &&
    (a.matchedFraction === null || (typeof a.matchedFraction === "number" && Number.isFinite(a.matchedFraction))) &&
    (a.avgOffsetMs === null || typeof a.avgOffsetMs === "number")
  );
}

/**
 * The SessionRecordV1 shape guard. Deliberately STRICT: a legacy
 * set-runner row (PracticeSession: {id, pathId, startedAt, ...} -
 * no version:1, no aggregates object) must NEVER load here.
 */
function isSession(v: unknown): v is SessionRecordV1 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  if (s.version !== 1) return false;
  if (typeof s.startedAtMs !== "number" || !Number.isFinite(s.startedAtMs)) return false;
  if (s.endedAtMs !== null && typeof s.endedAtMs !== "number") return false;
  if (typeof s.rampCompleted !== "boolean") return false;
  if (typeof s.refId !== "string") return false;
  if (typeof s.meter !== "string") return false;
  if (typeof s.tempoStartBpm !== "number" || typeof s.maxTempoBpm !== "number") return false;
  if (typeof s.windows !== "object" || s.windows === null) return false;
  if (!Array.isArray(s.attempts) || !s.attempts.every(isAttempt)) return false;
  const ag = s.aggregates as Record<string, unknown> | undefined;
  return (
    typeof ag === "object" &&
    ag !== null &&
    typeof ag.attemptsTotal === "number" &&
    typeof ag.successes === "number" &&
    typeof ag.notesHit === "number" &&
    typeof ag.totalPlaySec === "number"
  );
}

/** Load completed sessions. Corrupt -> []; legacy rows are REJECTED. */
export function loadSessions(): SessionRecordV1[] {
  const raw = storageGet(K.completedSessions);
  if (raw === null || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isSession);
  } catch {
    return [];
  }
}

/**
 * Upsert one session keyed by startedAtMs (D133 rule 3: single
 * record, TWO writes - the ramp-complete mark persists immediately,
 * the close re-persists the same record), then prune to cap 50.
 */
export function appendSession(s: SessionRecordV1): void {
  const all = loadSessions();
  const idx = all.findIndex((x) => x.startedAtMs === s.startedAtMs);
  if (idx >= 0) all[idx] = s;
  else all.push(s);
  const pruned = all.length > SESSION_CAP ? all.slice(all.length - SESSION_CAP) : all;
  storageSet(K.completedSessions, JSON.stringify(pruned));
}

/**
 * THE coherence law (D136): detection verdict -> PracticeOutcome.
 * correct = success with a near-perfect fraction; partial = a
 * passing-but-imperfect rep; incorrect = failure. Manual ratings
 * have no fraction: success -> correct, failure -> incorrect.
 * (Rolling-accuracy math already weighs partial 0.5.)
 */
export function outcomeOf(a: AttemptV1): PracticeOutcome {
  if (a.source === "manual") return a.success ? "correct" : "incorrect";
  if (!a.success) return "incorrect";
  if (a.matchedFraction !== null && a.matchedFraction >= 0.99) return "correct";
  return "partial";
}

/**
 * THE dual-write seam (D120 landing): fold the attempt into the
 * open draft (returns the folded draft - the caller owns the ref)
 * AND append the pedagogy.log entry (mode "practice", durationSec =
 * the pass length). Never throws on the log side (appendLog is
 * quota-safe).
 */
export function appendAttempt(
  draft: SessionRecordV1,
  a: AttemptV1,
  passLengthSec: number,
  notesHitCount = 0,
): SessionRecordV1 {
  const folded = foldAttempt(draft, a, notesHitCount);
  appendLog({
    version: 1,
    atMs: a.atMs,
    mode: "practice",
    refId: draft.refId,
    outcome: outcomeOf(a),
    durationSec: Math.max(0, Math.floor(passLengthSec)),
    conceptId: null,
  });
  return folded;
}

/**
 * REQ-PRAC-33: latch rampCompleted on the open draft, persist the
 * interim record immediately (upsert - the close re-writes the same
 * key), and log the milestone (outcome correct, 0 extra minutes -
 * attempts already carry the time). Idempotent once latched.
 */
export function markRampCompleted(draft: SessionRecordV1): SessionRecordV1 {
  if (draft.rampCompleted) return draft;
  const latched: SessionRecordV1 = { ...draft, rampCompleted: true };
  appendSession(latched);
  appendLog({
    version: 1,
    atMs: Date.now(),
    mode: "practice",
    refId: draft.refId,
    outcome: "correct",
    durationSec: 0,
    conceptId: null,
  });
  return latched;
}

/** Last `limit` sessions, newest last (recentSessions precedent). */
export function getRecentSessions(limit = 5): SessionRecordV1[] {
  return loadSessions().slice(-limit);
}

/** Wipe (panel Clear path). Never throws. */
export function clearSessions(): void {
  try {
    localStorage.removeItem(K.completedSessions);
  } catch {
    // Storage unavailable - nothing to clear.
  }
}
