/**
 * engine/pedagogy/srs.test.ts - PRD-001 Phase 6 (REQ-PED-30/31/32, D114).
 *
 * SM-2 GOLDEN VECTORS (canonical SuperMemo-2) + DUE-BIAS PROPERTY.
 * Ease formula pinned verbatim:
 *   ease' = ease + (0.1 - (5-g)*(0.08+(5-g)*0.02)); floor 1.3.
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { newSrsState, reviewSrs, pickNextConcept, type SrsState } from "./srs";

const DAY = 86400e3;
const NOW = 1_700_000_000_000;

function state(ease: number, interval: number, streak: number): SrsState {
  return {
    version: 1,
    conceptId: "ii-v-i",
    lastSeenMs: NOW - 10 * DAY,
    intervalDays: interval,
    ease,
    streak,
    nextDueMs: NOW - 10 * DAY + interval * DAY,
  };
}

describe("SM-2 GOLDEN VECTORS", () => {
  it("fresh (2.50, 0, 0) + grade 5 -> (2.60, 1, 1)", () => {
    const next = reviewSrs(state(2.5, 0, 0), 5, NOW);
    expect(next.ease).toBeCloseTo(2.6, 2);
    expect(next.intervalDays).toBe(1);
    expect(next.streak).toBe(1);
    expect(next.lastSeenMs).toBe(NOW);
    expect(next.nextDueMs).toBe(NOW + 1 * DAY);
  });

  it("(2.60, 1, 1) + grade 5 -> (2.70, 6, 2)", () => {
    const next = reviewSrs(state(2.6, 1, 1), 5, NOW);
    expect(next.ease).toBeCloseTo(2.7, 2);
    expect(next.intervalDays).toBe(6);
    expect(next.streak).toBe(2);
  });

  it("(2.70, 6, 2) + grade 5 -> (2.80, 16, 3)", () => {
    const next = reviewSrs(state(2.7, 6, 2), 5, NOW);
    expect(next.ease).toBeCloseTo(2.8, 2);
    expect(next.intervalDays).toBe(16);
    expect(next.streak).toBe(3);
  });

  it("(2.80, 16, 3) + grade 2 -> (2.48, 1, 0)", () => {
    const next = reviewSrs(state(2.8, 16, 3), 2, NOW);
    expect(next.ease).toBeCloseTo(2.48, 2);
    expect(next.intervalDays).toBe(1);
    expect(next.streak).toBe(0);
  });

  it("ease floor: (1.40, 6, 2) + grade 2 repeatedly -> never below 1.3", () => {
    let s = state(1.4, 6, 2);
    for (let i = 0; i < 10; i++) {
      s = reviewSrs(s, 2, NOW + i);
      expect(s.ease).toBeGreaterThanOrEqual(1.3);
    }
    expect(s.ease).toBeCloseTo(1.3, 2);
    expect(s.intervalDays).toBe(1);
    expect(s.streak).toBe(0);
  });

  it("(2.50, 0, 0) + grade 2 -> (2.18, 1, 0)", () => {
    const next = reviewSrs(state(2.5, 0, 0), 2, NOW);
    expect(next.ease).toBeCloseTo(2.18, 2);
    expect(next.intervalDays).toBe(1);
    expect(next.streak).toBe(0);
  });

  it("nextDueMs == lastSeenMs + intervalDays*86400e3 (exact arithmetic)", () => {
    const next = reviewSrs(state(2.6, 1, 1), 5, NOW);
    expect(next.nextDueMs).toBe(next.lastSeenMs + next.intervalDays * DAY);
  });

  it("newSrsState defaults (ease 2.5, interval 0, due now)", () => {
    const s = newSrsState("cadence");
    expect(s.ease).toBe(2.5);
    expect(s.intervalDays).toBe(0);
    expect(s.nextDueMs).toBe(0);
  });
});

describe("DUE-BIAS PROPERTY (REQ-PED-32)", () => {
  it("due items surface first; future never picked; most-overdue picked most", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const srs: Record<string, SrsState> = {
      a: { version: 1, conceptId: "a", lastSeenMs: NOW - 10 * DAY, intervalDays: 1, ease: 2.5, streak: 1, nextDueMs: NOW - 9 * DAY },
      b: { version: 1, conceptId: "b", lastSeenMs: NOW - 5 * DAY, intervalDays: 1, ease: 2.5, streak: 1, nextDueMs: NOW - 4 * DAY },
      c: { version: 1, conceptId: "c", lastSeenMs: NOW, intervalDays: 1, ease: 2.5, streak: 1, nextDueMs: NOW },
      d: { version: 1, conceptId: "d", lastSeenMs: NOW - 1 * DAY, intervalDays: 10, ease: 2.5, streak: 1, nextDueMs: NOW + 9 * DAY },
      e: { version: 1, conceptId: "e", lastSeenMs: NOW - 1 * DAY, intervalDays: 10, ease: 2.5, streak: 1, nextDueMs: NOW + 5 * DAY },
    };
    // f is unseen (absent from the map) -> due.
    const rng = createRng(7);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    for (let i = 0; i < 200; i++) {
      const pick = pickNextConcept(ids, srs, NOW, rng);
      counts[pick]++;
    }
    // Future items never picked.
    expect(counts.d).toBe(0);
    expect(counts.e).toBe(0);
    // Due + unseen cover all picks.
    expect(counts.a + counts.b + counts.c + counts.f).toBe(200);
    // Most-overdue picked most (chi-square-free count assertion).
    expect(counts.a).toBeGreaterThan(counts.b);
  });

  it("empty input throws RangeError (programmer error)", () => {
    expect(() => pickNextConcept([], {}, NOW, createRng(1))).toThrow(RangeError);
  });

  it("none-due falls back to longest-unseen", () => {
    const ids = ["x", "y"];
    const srs: Record<string, SrsState> = {
      x: { version: 1, conceptId: "x", lastSeenMs: NOW - 1 * DAY, intervalDays: 10, ease: 2.5, streak: 1, nextDueMs: NOW + 9 * DAY },
      y: { version: 1, conceptId: "y", lastSeenMs: NOW - 5 * DAY, intervalDays: 10, ease: 2.5, streak: 1, nextDueMs: NOW + 5 * DAY },
    };
    expect(pickNextConcept(ids, srs, NOW, createRng(1))).toBe("y");
  });
});
