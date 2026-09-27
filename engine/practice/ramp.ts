/**
 * engine/practice/ramp.ts - PRD-001 Phase 7 S2 (D121): the pure tempo
 * ladder. Source-agnostic by construction: the machine consumes
 * RampEvents and NEVER knows who produced them. S2 wires the source to
 * manual "Made it / Missed it" clicks (each click IS one rep outcome);
 * S3 wires detection on passCompleted - the machine, its pins, and its
 * UI chip do not change (zero ramp-machine changes at the seam).
 *
 * Laws (pinned in ramp.test.ts, section 2 of PHASE-7-S2-MECHANICS.md):
 *   1 CLIMB    success -> repsAtBpm++, successStreak++, failStreak=0;
 *              at repsPerStep -> bpm = min(bpm + stepBpm, targetBpm),
 *              repsAtBpm = 0.
 *   2 DROP     failure -> failStreak++, successStreak=0; at
 *              failThreshold -> bpm = max(bpm - stepBpm, startBpm),
 *              failStreak = 0, repsAtBpm = 0. CONSECUTIVE is literal:
 *              one success resets failStreak.
 *   3 COMPLETE phase "complete" iff a CLIMB step lands bpm ===
 *              targetBpm (REQ-PRAC-33; the min-clamp makes a
 *              non-dividing gap land EXACTLY). A reseed to target does
 *              NOT complete - ladder-only.
 *   4 CLAMPS   bpm never below startBpm, never above targetBpm.
 *   5 RESEED   bpm = clamp(e.bpm, startBpm, targetBpm); counters reset;
 *              phase ALWAYS back to "climb" (a manual takeover
 *              invalidates completion - pinned).
 *   6 VALID    normalizeRampConfig rejects startBpm >= targetBpm
 *              (returns null = ramp disabled), clamps bpm into
 *              [30,240] (the slider bounds), floors stepBpm /
 *              repsPerStep / failThreshold at 1.
 *   7 MATRIX   deterministic corners (repsPerStep=1, failThreshold=1,
 *              stepBpm > gap, start=target-1) - no rng anywhere.
 *
 * D124: applying a bpm change is the CALLER's job - the ramp NEVER
 * touches rhythmEngine; App writes the store tempo and the existing
 * [tempo] effects do the rest (slider-equivalent path).
 *
 * Pure (ADR-003): params in, state out. No clock, no rng, no Date.
 */

export interface RampConfig {
  startBpm: number;
  targetBpm: number;
  stepBpm: number;
  repsPerStep: number;
  failThreshold: number;
}

export interface RampState {
  bpm: number;
  repsAtBpm: number;
  successStreak: number;
  failStreak: number;
  phase: "climb" | "complete";
}

export type RampEvent =
  /** S2: a manual button click; S3: detection (D121). One rep. */
  | { kind: "rep"; success: boolean }
  /** Manual tempo takeover (D124.5): the ladder continues from the
   *  user's tempo, reps reset, completion invalidated. */
  | { kind: "reseed"; bpm: number }
  /** Engage/disengage (and the panel Reset button). */
  | { kind: "reset" };

/** Slider bounds (the app-wide tempo clamp). */
const BPM_MIN = 30;
const BPM_MAX = 240;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function safeInt(n: number): number {
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/**
 * Hydrate guard (law 6): a VALID config or null (= ramp disabled).
 * startBpm >= targetBpm is not a ladder - rejected, never coerced.
 */
export function normalizeRampConfig(raw: unknown): RampConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const startRaw = num(r.startBpm);
  const targetRaw = num(r.targetBpm);
  if (startRaw === null || targetRaw === null) return null;

  const startBpm = clamp(safeInt(startRaw), BPM_MIN, BPM_MAX);
  const targetBpm = clamp(safeInt(targetRaw), BPM_MIN, BPM_MAX);
  if (startBpm >= targetBpm) return null;

  return {
    startBpm,
    targetBpm,
    stepBpm: Math.max(1, safeInt(num(r.stepBpm) ?? 1)),
    repsPerStep: Math.max(1, safeInt(num(r.repsPerStep) ?? 1)),
    failThreshold: Math.max(1, safeInt(num(r.failThreshold) ?? 1)),
  };
}

/** The ladder starts at the floor of the range, climbing. */
export function initialRampState(c: RampConfig): RampState {
  return {
    bpm: clamp(safeInt(c.startBpm), c.startBpm, c.targetBpm),
    repsAtBpm: 0,
    successStreak: 0,
    failStreak: 0,
    phase: "climb",
  };
}

/**
 * The one transition function (D121): state + config + event -> state.
 * Every event kind is total - unknown shapes cannot reach here (the
 * type forbids it), degenerate numbers are integer-guarded.
 */
export function rampNext(s: RampState, c: RampConfig, e: RampEvent): RampState {
  switch (e.kind) {
    case "reset":
      return initialRampState(c);

    case "reseed": {
      // Manual takeover: always "climb" (law 5) - even when the user
      // lands exactly on target (only the LADDER completes a ramp).
      return {
        bpm: clamp(safeInt(e.bpm), c.startBpm, c.targetBpm),
        repsAtBpm: 0,
        successStreak: 0,
        failStreak: 0,
        phase: "climb",
      };
    }

    case "rep": {
      if (e.success) {
        // Law 1: climb.
        const successStreak = s.successStreak + 1;
        const reps = s.repsAtBpm + 1;
        if (reps >= Math.max(1, safeInt(c.repsPerStep))) {
          const bpm = Math.min(s.bpm + Math.max(1, safeInt(c.stepBpm)), c.targetBpm);
          const landed = bpm === c.targetBpm;
          return {
            bpm,
            repsAtBpm: 0,
            successStreak,
            failStreak: 0,
            // Law 3: complete iff a CLIMB step lands on target; a
            // already-complete ladder re-lands on target via the
            // min-clamp and stays complete.
            phase: landed ? "complete" : "climb",
          };
        }
        return { ...s, repsAtBpm: reps, successStreak, failStreak: 0 };
      }
      // Law 2: drop. CONSECUTIVE is literal - successStreak resets.
      const failStreak = s.failStreak + 1;
      const successStreak = 0;
      if (failStreak >= Math.max(1, safeInt(c.failThreshold))) {
        const bpm = Math.max(s.bpm - Math.max(1, safeInt(c.stepBpm)), c.startBpm);
        return {
          bpm,
          repsAtBpm: 0,
          successStreak,
          failStreak: 0,
          // A drop below target invalidates completion (law 3 converse).
          phase: bpm === c.targetBpm ? s.phase : "climb",
        };
      }
      return { ...s, successStreak, failStreak };
    }

    default:
      return s;
  }
}
