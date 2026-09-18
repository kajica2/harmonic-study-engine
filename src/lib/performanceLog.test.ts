/**
 * src/lib/performanceLog.test.ts — pure-function tests for the
 * performance log (option G). Covers recordTake, rep auto-stamping,
 * and the rep-diff helpers (FUTURE_PLANNING near-term #2: first-try
 * vs rep #3 snapshots).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearTakes,
  formatRelativeTime,
  getPreviousTakeWithTally,
  guideToneAccuracy,
  loadTakes,
  MAX_TAKES,
  recordGuideToneResult,
  recordTake,
  type PerformanceTake,
} from "./performanceLog";

const baseInput = {
  pathId: "test-path",
  pathTitle: "Test Path",
  tempo: 120,
  meter: "4/4",
  instrument: "Trumpet",
  personaId: "test-persona",
  durationSec: 32,
};

beforeEach(() => {
  // localStorage is shared across tests in the same file.
  clearTakes();
});

describe("recordTake", () => {
  it("returns a stored take with id, recordedAt, and rep=1", () => {
    const take = recordTake(baseInput);
    expect(typeof take.id).toBe("string");
    expect(take.id.length).toBeGreaterThan(0);
    expect(take.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(take.rep).toBe(1);
  });

  it("auto-stamps rep as 1, 2, 3, ... across successive takes on the same path", () => {
    const t1 = recordTake(baseInput);
    const t2 = recordTake(baseInput);
    const t3 = recordTake(baseInput);
    expect(t1.rep).toBe(1);
    expect(t2.rep).toBe(2);
    expect(t3.rep).toBe(3);
  });

  it("counts rep separately per pathId", () => {
    recordTake({ ...baseInput, pathId: "a" });
    recordTake({ ...baseInput, pathId: "a" });
    recordTake({ ...baseInput, pathId: "b" });
    recordTake({ ...baseInput, pathId: "a" });
    const all = loadTakes();
    const a = all.filter((t) => t.pathId === "a");
    const b = all.filter((t) => t.pathId === "b");
    expect(a.map((t) => t.rep)).toEqual([1, 2, 3]);
    expect(b.map((t) => t.rep)).toEqual([1]);
  });

  it("prunes to MAX_TAKES (50) — oldest entries drop off", () => {
    // MAX_TAKES + 5 records on different paths so rep doesn't collide.
    for (let i = 0; i < MAX_TAKES + 5; i++) {
      recordTake({ ...baseInput, pathId: `p-${i}` });
    }
    const all = loadTakes();
    expect(all.length).toBe(MAX_TAKES);
    // The first 5 (oldest) are gone — the first surviving pathId is p-5.
    expect(all[0]?.pathId).toBe("p-5");
    expect(all[all.length - 1]?.pathId).toBe(`p-${MAX_TAKES + 4}`);
  });

  it("persists across reads", () => {
    recordTake(baseInput);
    expect(loadTakes()).toHaveLength(1);
    recordTake(baseInput);
    expect(loadTakes()).toHaveLength(2);
  });
});

describe("guideToneAccuracy", () => {
  it("returns null when transitionsHit is missing", () => {
    const t: PerformanceTake = {
      id: "x",
      recordedAt: new Date().toISOString(),
      ...baseInput,
    };
    expect(guideToneAccuracy(t)).toBeNull();
  });

  it("returns null when transitionsMissed is missing", () => {
    const t: PerformanceTake = {
      id: "x",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 3,
    };
    expect(guideToneAccuracy(t)).toBeNull();
  });

  it("returns 0 when hit+missed=0 (defensive — avoid /0)", () => {
    const t: PerformanceTake = {
      id: "x",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 0,
      transitionsMissed: 0,
    };
    expect(guideToneAccuracy(t)).toBeNull();
  });

  it("returns the hit fraction", () => {
    const t: PerformanceTake = {
      id: "x",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 3,
      transitionsMissed: 1,
    };
    expect(guideToneAccuracy(t)).toBeCloseTo(0.75);
  });

  it("ignores non-integer tallies (defensive)", () => {
    const t: PerformanceTake = {
      id: "x",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 1.5,
      transitionsMissed: 1,
    };
    expect(guideToneAccuracy(t)).toBeNull();
  });
});

describe("getPreviousTakeWithTally", () => {
  it("returns null for rep #1 (no prior take)", () => {
    const t = recordTake(baseInput);
    recordGuideToneResult(t.id, { transitionsHit: 3, transitionsMissed: 1 });
    expect(getPreviousTakeWithTally(loadTakes(), t)).toBeNull();
  });

  it("returns null when the prior take has no tally", () => {
    const t1 = recordTake(baseInput);
    const t2 = recordTake(baseInput);
    // Only attach the tally to t2 (the current).
    recordGuideToneResult(t2.id, { transitionsHit: 3, transitionsMissed: 1 });
    expect(getPreviousTakeWithTally(loadTakes(), t2)).toBeNull();
    // t1 still has no tally, even though it's the immediately previous rep.
    expect(t1.transitionsHit).toBeUndefined();
  });

  it("returns the previous take when both have tallies", () => {
    const t1 = recordTake(baseInput);
    const t2 = recordTake(baseInput);
    recordGuideToneResult(t1.id, { transitionsHit: 2, transitionsMissed: 2 });
    recordGuideToneResult(t2.id, { transitionsHit: 3, transitionsMissed: 1 });
    const prev = getPreviousTakeWithTally(loadTakes(), t2);
    expect(prev?.id).toBe(t1.id);
  });

  it("returns the prior rep on a non-adjacent take (rep #3 -> rep #2)", () => {
    const t1 = recordTake(baseInput);
    const t2 = recordTake(baseInput);
    const t3 = recordTake(baseInput);
    recordGuideToneResult(t1.id, { transitionsHit: 2, transitionsMissed: 2 });
    recordGuideToneResult(t2.id, { transitionsHit: 3, transitionsMissed: 1 });
    recordGuideToneResult(t3.id, { transitionsHit: 4, transitionsMissed: 0 });
    // t3.rep=3 -> look up rep=2 -> t2.
    const prev = getPreviousTakeWithTally(loadTakes(), t3);
    expect(prev?.id).toBe(t2.id);
    expect(prev?.rep).toBe(2);
  });

  it("does not cross paths", () => {
    recordTake(baseInput); // rep 1 on "test-path"
    const other = recordTake({ ...baseInput, pathId: "other-path" });
    recordGuideToneResult(other.id, { transitionsHit: 3, transitionsMissed: 1 });
    // current = other.pathId="other-path", rep=1 -> returns null
    expect(getPreviousTakeWithTally(loadTakes(), other)).toBeNull();
  });

  it("returns null when rep field is missing (legacy take)", () => {
    // Simulate a pre-rep-field entry by injecting directly.
    const legacy: PerformanceTake = {
      id: "legacy-1",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 2,
      transitionsMissed: 2,
      // no rep field
    };
    const current: PerformanceTake = {
      id: "current-1",
      recordedAt: new Date().toISOString(),
      ...baseInput,
      transitionsHit: 3,
      transitionsMissed: 1,
      rep: 2,
    };
    expect(getPreviousTakeWithTally([legacy, current], current)).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-18T12:00:00Z").getTime();
  it("renders 'just now' for <1 minute", () => {
    expect(formatRelativeTime("2026-09-18T11:59:30Z", now)).toBe("just now");
  });
  it("renders minutes", () => {
    expect(formatRelativeTime("2026-09-18T11:48:00Z", now)).toBe("12m ago");
  });
  it("renders hours", () => {
    expect(formatRelativeTime("2026-09-18T09:00:00Z", now)).toBe("3h ago");
  });
  it("renders days", () => {
    expect(formatRelativeTime("2026-09-16T12:00:00Z", now)).toBe("2d ago");
  });
  it("renders weeks", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00Z", now)).toBe("2w ago");
  });
  it("renders 'unknown time' for bad input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("unknown time");
  });
});
