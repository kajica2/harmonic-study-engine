import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTakes,
  recordTake,
  recordGuideToneResult,
  clearTakes,
  getRecentTakes,
  updateTakeRating,
  formatRelativeTime,
  MAX_TAKES,
} from "../src/lib/performanceLog";

const input = {
  pathId: "autumn-leaves",
  pathTitle: "Autumn Leaves",
  tempo: 120,
  meter: "4/4",
  instrument: "Bright",
  personaId: "modal",
  durationSec: 12.5,
  note: "first real run",
};

beforeEach(() => {
  localStorage.clear();
});

describe("recordTake / loadTakes", () => {
  it("appends a take with a stamped id and recordedAt", () => {
    const take = recordTake(input);
    expect(take.pathId).toBe("autumn-leaves");
    expect(take.id).toBeTruthy();
    expect(new Date(take.recordedAt).getTime()).not.toBeNaN();
    expect(loadTakes()).toHaveLength(1);
  });

  it("is append-ordered (newest last), matching getRecentTakes slicing", () => {
    recordTake(input);
    recordTake({ ...input, pathId: "giant-steps", pathTitle: "Giant Steps" });
    const ids = loadTakes().map((t) => t.pathId);
    expect(ids).toEqual(["autumn-leaves", "giant-steps"]);
  });

  it("prunes the oldest takes beyond MAX_TAKES", () => {
    for (let i = 0; i < MAX_TAKES + 5; i++) {
      recordTake({ ...input, pathId: `path-${i}` });
    }
    const takes = loadTakes();
    expect(takes).toHaveLength(MAX_TAKES);
    expect(takes[0].pathId).toBe("path-5");
  });

  it("returns [] (never throws) on corrupt JSON", () => {
    localStorage.setItem("hse.performance.log.v1", "{not json");
    expect(loadTakes()).toEqual([]);
  });

  it("drops malformed entries when the shape changes", () => {
    localStorage.setItem(
      "hse.performance.log.v1",
      JSON.stringify([{ id: "ok", recordedAt: "2026-01-01T00:00:00Z" }, { foo: 1 }, "junk"]),
    );
    const takes = loadTakes();
    expect(takes).toHaveLength(1);
    expect(takes[0].id).toBe("ok");
  });
});

describe("getRecentTakes / clearTakes", () => {
  it("returns the last N takes, newest last", () => {
    for (let i = 0; i < 8; i++) recordTake({ ...input, pathId: `p-${i}` });
    const recent = getRecentTakes(3).map((t) => t.pathId);
    expect(recent).toEqual(["p-5", "p-6", "p-7"]);
  });

  it("clears the whole log", () => {
    recordTake(input);
    clearTakes();
    expect(loadTakes()).toEqual([]);
  });
});

describe("updateTakeRating", () => {
  it("sets a valid rating", () => {
    const take = recordTake(input);
    updateTakeRating(take.id, 4);
    expect(loadTakes()[0].selfRating).toBe(4);
  });

  it("clears the rating when passed undefined", () => {
    const take = recordTake({ ...input, selfRating: 3 });
    updateTakeRating(take.id, undefined);
    expect(loadTakes()[0].selfRating).toBeUndefined();
  });

  it("rejects ratings outside 1–5", () => {
    const take = recordTake(input);
    updateTakeRating(take.id, 9);
    expect(loadTakes()[0].selfRating).toBeUndefined();
  });

  it("is a no-op for an unknown id", () => {
    recordTake(input);
    updateTakeRating("missing", 5);
    expect(loadTakes()).toHaveLength(1);
    expect(loadTakes()[0].selfRating).toBeUndefined();
  });
});

describe("recordGuideToneResult", () => {
  it("attaches the tally to an existing take", () => {
    const take = recordTake(input);
    recordGuideToneResult(take.id, { transitionsHit: 5, transitionsMissed: 3 });
    const stored = loadTakes()[0];
    expect(stored.transitionsHit).toBe(5);
    expect(stored.transitionsMissed).toBe(3);
  });

  it("is a no-op for an unknown id", () => {
    recordTake(input);
    recordGuideToneResult("missing", { transitionsHit: 1, transitionsMissed: 0 });
    expect(loadTakes()[0].transitionsHit).toBeUndefined();
  });

  it("rejects negative tallies", () => {
    const take = recordTake(input);
    recordGuideToneResult(take.id, { transitionsHit: -1, transitionsMissed: 0 });
    expect(loadTakes()[0].transitionsHit).toBeUndefined();
  });

  it("rejects non-integer tallies so a broken callback can't poison the log", () => {
    const take = recordTake(input);
    recordGuideToneResult(take.id, { transitionsHit: 1.5, transitionsMissed: 2 });
    expect(loadTakes()[0].transitionsHit).toBeUndefined();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-18T12:00:00Z").getTime();

  it.each([
    ["just now", "2026-09-18T11:59:30Z"],
    ["12m ago", "2026-09-18T11:48:00Z"],
    ["3h ago", "2026-09-18T09:00:00Z"],
    ["4d ago", "2026-09-14T12:00:00Z"],
    ["2w ago", "2026-09-04T12:00:00Z"],
  ] as const)("formats %s", (expected, iso) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it("never outputs negative/absurd values for future timestamps", () => {
    expect(formatRelativeTime("2026-09-19T12:00:00Z", now)).toBe("just now");
  });

  it("falls back for unparseable timestamps", () => {
    expect(formatRelativeTime("nope", now)).toBe("unknown time");
  });
});