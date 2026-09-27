/**
 * engine/practice/session.ts - PRD-001 Phase 7 S3 (D133): the pure
 * practice-session record. SessionRecordV1 (REQ-PRAC-60) is the
 * PRACTICE SESSION concept: one continuous drill block bundling the
 * config snapshot + attempts. It is NOT the set-runner
 * `PracticeSession` (paths.ts / practiceStore.ts /
 * PracticeSessionPlayer.tsx - the legacy trio stays UNTOUCHED, D119)
 * and NOT a recorded-audio TAKE (performanceLog). Three concepts,
 * three keys, no foreign keys (docs/TERMINOLOGY.md law, D133).
 *
 * ZERO imports (purity): timestamps are INPUTS (the adapter stamps
 * Date.now()); copy-on-fold everywhere (no input mutation - the
 * deep-freeze philosophy).
 *
 * Laws (pinned in session.test.ts):
 *   1 FOLD keeps raw attempts <= ATTEMPT_RAW_CAP (50, oldest dropped)
 *     while aggregates keep counting - summarize-then-drop-raw, the
 *     QUOTA law (a heavy session cannot blow localStorage).
 *   2 notesHit accumulates ONLY from the count the ADAPTER passes
 *     (detection notes-hit for that attempt; 0 for manual) - engine
 *     math stays total, no fraction guessing.
 *   3 closeSession stamps endedAtMs + totalPlaySec; closing twice is
 *     idempotent (first close wins); ended < started clamps to 0.
 *   4 isSessionWorthSaving: closed AND elapsed >= MIN_SESSION_SEC
 *     (20s) - the noise filter is honest (19.9s NO, 20s YES).
 *   5 summarizeSession is a PURE derivation, never stored.
 *   6 rampCompleted LATCHES once true (fold/close preserve it).
 *   7 NO input mutation (frozen-object fixture pin).
 */

export interface AttemptV1 {
  atMs: number;
  bpm: number;
  phaseKind: "play" | "rest" | "a" | "b" | "full";
  source: "detect" | "manual";
  success: boolean;
  /** null = manual / no grid (D133). */
  matchedFraction: number | null;
  avgOffsetMs: number | null;
}

export interface SessionWindows {
  loop?: { fromBar: number; toBar: number };
  pause?: { playBars: number; restBars: number };
  ab?: {
    a: { fromBar: number; toBar: number };
    b: { fromBar: number; toBar: number };
    swapBars: number;
  };
  ramp?: {
    startBpm: number;
    targetBpm: number;
    stepBpm: number;
    repsPerStep: number;
    failThreshold: number;
  };
}

export interface SessionRecordV1 {
  version: 1;
  startedAtMs: number;
  endedAtMs: number | null; // null = open (in-memory only)
  rampCompleted: boolean; // REQ-PRAC-33 mark
  refId: string; // path/etude id (an etude IS a path - no new entity)
  meter: string;
  tempoStartBpm: number;
  maxTempoBpm: number;
  /** K.metronomeConfig snapshot (opaque here, stored verbatim). */
  metronome: unknown;
  windows: SessionWindows;
  attempts: AttemptV1[]; // last 50 raw (fold law 1)
  aggregates: {
    attemptsTotal: number;
    successes: number;
    notesHit: number; // detection only; 0 without
    totalPlaySec: number;
  };
}

export interface SessionSeed {
  startedAtMs: number;
  refId: string;
  meter: string;
  tempoStartBpm: number;
  metronome: unknown;
  windows: SessionWindows;
}

/** A session shorter than this is noise, not practice (D133). */
export const MIN_SESSION_SEC = 20;
/** Raw attempts kept per stored session (quota law 1). */
export const ATTEMPT_RAW_CAP = 50;

function safeInt(n: number, fallback = 0): number {
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** Open a fresh session from a config snapshot (play edge). */
export function openSession(seed: SessionSeed): SessionRecordV1 {
  const tempo = safeInt(seed.tempoStartBpm, 0);
  return {
    version: 1,
    startedAtMs: seed.startedAtMs,
    endedAtMs: null,
    rampCompleted: false,
    refId: seed.refId,
    meter: seed.meter,
    tempoStartBpm: tempo,
    maxTempoBpm: tempo,
    metronome: seed.metronome,
    windows: seed.windows,
    attempts: [],
    aggregates: {
      attemptsTotal: 0,
      successes: 0,
      notesHit: 0,
      totalPlaySec: 0,
    },
  };
}

/**
 * Fold one attempt (copy-on-fold, law 7). Raw list stays <= 50
 * (oldest dropped, law 1) while aggregates keep counting;
 * notesHitCount is the adapter-passed detection count for THIS
 * attempt (law 2 - manual passes 0).
 */
export function foldAttempt(
  s: SessionRecordV1,
  a: AttemptV1,
  notesHitCount = 0,
): SessionRecordV1 {
  const attempts = [...s.attempts, a];
  const trimmed =
    attempts.length > ATTEMPT_RAW_CAP
      ? attempts.slice(attempts.length - ATTEMPT_RAW_CAP)
      : attempts;
  const hit = Math.max(0, safeInt(notesHitCount, 0));
  return {
    ...s,
    attempts: trimmed,
    maxTempoBpm: Math.max(s.maxTempoBpm, safeInt(a.bpm, s.maxTempoBpm)),
    aggregates: {
      attemptsTotal: s.aggregates.attemptsTotal + 1,
      successes: s.aggregates.successes + (a.success ? 1 : 0),
      notesHit: s.aggregates.notesHit + hit,
      totalPlaySec: s.aggregates.totalPlaySec,
    },
  };
}

/** Close the block: stamp end + play seconds. Idempotent (law 3). */
export function closeSession(s: SessionRecordV1, endedAtMs: number): SessionRecordV1 {
  if (s.endedAtMs !== null) return s;
  const end = Number.isFinite(endedAtMs) ? endedAtMs : s.startedAtMs;
  const elapsedMs = Math.max(0, end - s.startedAtMs);
  return {
    ...s,
    endedAtMs: s.startedAtMs + elapsedMs,
    aggregates: {
      ...s.aggregates,
      totalPlaySec: elapsedMs / 1000,
    },
  };
}

/** The noise filter (law 4): closed AND >= MIN_SESSION_SEC. */
export function isSessionWorthSaving(s: SessionRecordV1): boolean {
  if (s.endedAtMs === null) return false;
  return s.aggregates.totalPlaySec >= MIN_SESSION_SEC;
}

/**
 * The REQ-PRAC-62 summary (pure derivation, law 5): max tempo, total
 * time, attempts, successes, accuracy % (null = no attempts yet),
 * notes hit, ramp-completed flag.
 */
export function summarizeSession(s: SessionRecordV1): {
  maxTempoBpm: number;
  totalSec: number;
  attemptsMade: number;
  successes: number;
  accuracyPct: number | null;
  notesHit: number;
  rampCompleted: boolean;
} {
  const total = s.aggregates.attemptsTotal;
  return {
    maxTempoBpm: s.maxTempoBpm,
    totalSec: s.aggregates.totalPlaySec,
    attemptsMade: total,
    successes: s.aggregates.successes,
    accuracyPct: total > 0 ? (s.aggregates.successes / total) * 100 : null,
    notesHit: s.aggregates.notesHit,
    rampCompleted: s.rampCompleted,
  };
}
