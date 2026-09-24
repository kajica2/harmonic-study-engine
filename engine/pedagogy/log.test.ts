/**
 * engine/pedagogy/log.test.ts - PRD-001 Phase 6 (REQ-PED-40/41/42).
 *
 * LOG SUMMARY MATH (nowMs-injected, fixed clock): 30d window,
 * UTC day keys, whole-log conceptCounts, last-20 rollingAccuracy,
 * cap 500, duration clamp, corrupt-safe append.
 */

import { describe, it, expect } from "vitest";
import { appendEntry, summarizeLog, type PracticeEntry } from "./log";

const DAY = 86400e3;
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

function entry(partial: Partial<PracticeEntry> & { atMs: number }): PracticeEntry {
  return {
    version: 1,
    mode: "ear",
    refId: "ear-test",
    outcome: "correct",
    durationSec: 60,
    conceptId: null,
    ...partial,
  };
}

describe("summarizeLog math", () => {
  it("30d window excludes older entries from minutesPerDay but not conceptCounts", () => {
    const old = entry({ atMs: NOW - 31 * DAY, durationSec: 120, conceptId: "ii-v-i" });
    const fresh = entry({ atMs: NOW - 1 * DAY, durationSec: 60, conceptId: "ii-v-i" });
    const summary = summarizeLog([old, fresh], NOW);
    const totalMinutes = Object.values(summary.minutesPerDay).reduce((a, b) => a + b, 0);
    expect(totalMinutes).toBeCloseTo(1, 5);
    expect(summary.conceptCounts["ii-v-i"]).toBe(2);
  });

  it("minutesPerDay keys are UTC YYYY-MM-DD; same-day entries sum", () => {
    const a = entry({ atMs: Date.UTC(2026, 8, 24, 1, 0, 0), durationSec: 60 });
    const b = entry({ atMs: Date.UTC(2026, 8, 24, 10, 0, 0), durationSec: 120 });
    const summary = summarizeLog([a, b], NOW);
    expect(summary.minutesPerDay["2026-09-24"]).toBeCloseTo(3, 5);
  });

  it("midnight-boundary fixture: entries on either side land on different keys", () => {
    const before = entry({ atMs: Date.UTC(2026, 8, 23, 23, 59, 0), durationSec: 60 });
    const after = entry({ atMs: Date.UTC(2026, 8, 24, 0, 1, 0), durationSec: 60 });
    const summary = summarizeLog([before, after], NOW);
    expect(summary.minutesPerDay["2026-09-23"]).toBeCloseTo(1, 5);
    expect(summary.minutesPerDay["2026-09-24"]).toBeCloseTo(1, 5);
  });

  it("Feb-29 leap-day pin: Date.UTC(2024,1,29) -> 2024-02-29", () => {
    const leap = entry({ atMs: Date.UTC(2024, 1, 29, 12, 0, 0), durationSec: 60 });
    const summary = summarizeLog([leap], Date.UTC(2024, 1, 29, 13, 0, 0));
    expect(summary.minutesPerDay["2024-02-29"]).toBeCloseTo(1, 5);
  });

  it("conceptCounts tallies whole-log non-null ids", () => {
    const log = [
      entry({ atMs: NOW - 40 * DAY, conceptId: "cadence" }),
      entry({ atMs: NOW - 1 * DAY, conceptId: "cadence" }),
      entry({ atMs: NOW - 1 * DAY, conceptId: null }),
    ];
    const summary = summarizeLog(log, NOW);
    expect(summary.conceptCounts["cadence"]).toBe(2);
    expect(summary.totalAttempts).toBe(3);
  });

  it("rollingAccuracy over last 20 (correct=1, partial=0.5, incorrect=0); null when empty", () => {
    expect(summarizeLog([], NOW).rollingAccuracy).toBeNull();
    const log: PracticeEntry[] = [];
    for (let i = 0; i < 20; i++) {
      log.push(entry({ atMs: NOW - (20 - i), outcome: i < 10 ? "correct" : "incorrect" }));
    }
    expect(summarizeLog(log, NOW).rollingAccuracy).toBeCloseTo(0.5, 5);
    const mixed: PracticeEntry[] = [
      entry({ atMs: NOW - 3, outcome: "correct" }),
      entry({ atMs: NOW - 2, outcome: "partial" }),
      entry({ atMs: NOW - 1, outcome: "incorrect" }),
    ];
    expect(summarizeLog(mixed, NOW).rollingAccuracy).toBeCloseTo(0.5, 5);
  });

  it("20-entry window slides (oldest beyond 20 excluded)", () => {
    const log: PracticeEntry[] = [];
    for (let i = 0; i < 25; i++) {
      log.push(entry({ atMs: NOW - (25 - i), outcome: i < 5 ? "incorrect" : "correct" }));
    }
    // Last 20 are all correct -> 1.0 (first 5 incorrect slide out).
    expect(summarizeLog(log, NOW).rollingAccuracy).toBeCloseTo(1, 5);
  });
});

describe("appendEntry caps + clamps", () => {
  it("caps at 500 (501st drops oldest)", () => {
    let log: readonly PracticeEntry[] = [];
    for (let i = 0; i < 501; i++) {
      log = appendEntry(log, entry({ atMs: NOW - (501 - i), refId: `r${i}` }));
    }
    expect(log).toHaveLength(500);
    expect(log[0].refId).toBe("r1");
    expect(log[499].refId).toBe("r500");
  });

  it("durationSec negative clamped to 0 and >3600 capped", () => {
    const neg = appendEntry([], entry({ atMs: NOW, durationSec: -5 }));
    expect(neg[0].durationSec).toBe(0);
    const big = appendEntry([], entry({ atMs: NOW, durationSec: 9999 }));
    expect(big[0].durationSec).toBe(3600);
  });
});
