/**
 * engine/pedagogy/srs.ts - PRD-001 Phase 6 (REQ-PED-30/31/32, D114).
 *
 * Canonical SM-2 (SuperMemo-2, 1987) with the published constants.
 * Pure: review(state, grade, nowMs) returns new state (lastSeen =
 * nowMs; nextDue = nowMs + interval*86400e3); clock NEVER read here
 * (ADR-005). Grade mapping for binary prompts: 5 correct / 2
 * incorrect (no invented 3-4 band).
 *
 * Due-bias selector (REQ-PED-32): due = nextDueMs <= nowMs (or
 * unseen); due nonempty -> weighted pick by overdue-days (min weight
 * 1); else longest-unseen (smallest lastSeenMs). Never throws on
 * nonempty input (RangeError on empty).
 *
 * Purity: relative imports only, no clock, no Math.random, no console.
 */

import type { Versioned } from "../core/versioned";
import type { Rng } from "../core/rng";

export interface SrsState extends Versioned {
  readonly conceptId: string;
  readonly lastSeenMs: number;
  readonly intervalDays: number;
  readonly ease: number;
  readonly streak: number;
  readonly nextDueMs: number;
}

/** Binary grade mapping (D114): correct / incorrect. */
export type EarGradeBinary = 2 | 5;

const DAY_MS = 86400e3;
const EASE_START = 2.5;
const EASE_FLOOR = 1.3;

/** Fresh (unseen) SRS state for one concept. */
export function newSrsState(conceptId: string): SrsState {
  return {
    version: 1,
    conceptId,
    lastSeenMs: 0,
    intervalDays: 0,
    ease: EASE_START,
    streak: 0,
    nextDueMs: 0,
  };
}

/**
 * Canonical SM-2 review step.
 * Ease update ALWAYS (both arms):
 *   e + (0.1 - (5-g)*(0.08+(5-g)*0.02)), floor 1.3.
 * Interval: grade>=3 -> 1 (first) / 6 (second, prev==1) /
 * round(prev*ease) otherwise; grade<3 -> 1.
 * Ordering (canonical steps 5-before-7): Interval:=round(prev*EF)
 * uses the CURRENT (pre-update) EF; EF updates AFTER. Matches the
 * published spec + reference Delphi source; goldens pin this order.
 */
export function reviewSrs(
  state: SrsState,
  grade: EarGradeBinary,
  nowMs: number,
): SrsState {
  const easeRaw = state.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  const ease = Math.max(EASE_FLOOR, easeRaw);
  let intervalDays: number;
  let streak: number;
  if (grade >= 3) {
    if (state.intervalDays <= 0) intervalDays = 1;
    else if (state.intervalDays === 1) intervalDays = 6;
    else intervalDays = Math.round(state.intervalDays * state.ease);
    streak = state.streak + 1;
  } else {
    intervalDays = 1;
    streak = 0;
  }
  return {
    version: 1,
    conceptId: state.conceptId,
    lastSeenMs: nowMs,
    intervalDays,
    ease,
    streak,
    nextDueMs: nowMs + intervalDays * DAY_MS,
  };
}

/**
 * Due-bias prompt selector (REQ-PED-32).
 * Due = nextDueMs <= nowMs OR unseen (lastSeenMs 0 / interval 0).
 * Due nonempty -> weighted pick by overdue-days (min weight 1);
 * else longest-unseen (smallest lastSeenMs).
 */
export function pickNextConcept(
  conceptIds: readonly string[],
  srs: Readonly<Record<string, SrsState>>,
  nowMs: number,
  rng: Rng,
): string {
  if (conceptIds.length === 0) {
    throw new RangeError("pickNextConcept: empty conceptIds");
  }
  const due: { id: string; weight: number }[] = [];
  for (const id of conceptIds) {
    const st = srs[id];
    if (st === undefined || st.lastSeenMs === 0 || st.nextDueMs <= nowMs) {
      let weight = 1;
      if (st !== undefined && st.nextDueMs > 0 && st.nextDueMs <= nowMs) {
        const overdueDays = Math.max(0, Math.floor((nowMs - st.nextDueMs) / DAY_MS));
        weight = Math.max(1, overdueDays + 1);
      } else if (st === undefined || st.lastSeenMs === 0) {
        weight = 1;
      }
      due.push({ id, weight });
    }
  }
  if (due.length > 0) {
    return rng.weighted(due.map((d) => ({ item: d.id, weight: d.weight })));
  }
  // None due: longest-unseen (smallest lastSeenMs).
  let best = conceptIds[0];
  let bestSeen = srs[best]?.lastSeenMs ?? 0;
  for (const id of conceptIds) {
    const seen = srs[id]?.lastSeenMs ?? 0;
    if (seen < bestSeen) {
      best = id;
      bestSeen = seen;
    }
  }
  return best;
}
