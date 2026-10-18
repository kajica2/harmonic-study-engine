import { describe, it, expect } from "vitest";
import {
  clampKbRange,
  KB_RANGE_DEFAULT,
  KB_RANGE_MIN,
  KB_RANGE_MAX,
  KB_RANGE_MIN_SPAN,
} from "./kbRange";

describe("clampKbRange", () => {
  it("passes a legal range through unchanged", () => {
    expect(clampKbRange({ from: 48, to: 72 }, KB_RANGE_DEFAULT)).toEqual({
      from: 48,
      to: 72,
    });
  });

  it("returns the documented default when nothing else is known", () => {
    // The reset chip calls this shape - no prev, no moved.
    expect(KB_RANGE_DEFAULT).toEqual({ from: 36, to: 72 });
  });

  it("clamps from below KB_RANGE_MIN", () => {
    expect(clampKbRange({ from: 10, to: 72 }, KB_RANGE_DEFAULT, "from")).toEqual({
      from: KB_RANGE_MIN,
      to: 72,
    });
  });

  it("clamps to above KB_RANGE_MAX", () => {
    expect(clampKbRange({ from: 60, to: 130 }, KB_RANGE_DEFAULT, "to")).toEqual({
      from: 60,
      to: KB_RANGE_MAX,
    });
  });

  it("clamps from above KB_RANGE_MAX", () => {
    expect(clampKbRange({ from: 130, to: 72 }, KB_RANGE_DEFAULT, "from")).toEqual({
      from: KB_RANGE_MAX - KB_RANGE_MIN_SPAN,
      to: KB_RANGE_MAX,
    });
  });

  it("clamps to below KB_RANGE_MIN", () => {
    // Both sides: from was way above the floor (60), to was way below
    // (10). The legal-only span after the floor clamp forces from down
    // to the floor, then to forward by one octave.
    expect(clampKbRange({ from: 60, to: 10 }, KB_RANGE_DEFAULT, "to")).toEqual({
      from: KB_RANGE_MIN,
      to: KB_RANGE_MIN + KB_RANGE_MIN_SPAN,
    });
  });

  it("snaps the to-side upward when from moves up past to", () => {
    const result = clampKbRange({ from: 80, to: 72 }, { from: 36, to: 72 }, "from");
    expect(result.from).toBe(80);
    expect(result.to - result.from).toBe(KB_RANGE_MIN_SPAN);
    expect(result.to).toBeGreaterThanOrEqual(80 + KB_RANGE_MIN_SPAN);
  });

  it("snaps the from-side downward when to moves down past from", () => {
    // User drags to below the floor: we pin to at the floor, then
    // from also falls back to the floor, and the only way to honor
    // the min-span rule is to push to forward by one octave.
    const result = clampKbRange({ from: 36, to: 20 }, { from: 36, to: 72 }, "to");
    expect(result.from).toBe(KB_RANGE_MIN);
    expect(result.to).toBe(KB_RANGE_MIN + KB_RANGE_MIN_SPAN);
    expect(result.to - result.from).toBe(KB_RANGE_MIN_SPAN);
  });

  it("rounds non-integer inputs", () => {
    expect(clampKbRange({ from: 47.4, to: 72.6 }, KB_RANGE_DEFAULT, "from")).toEqual({
      from: 47,
      to: 73,
    });
  });

  it("treats NaN as a snap to the lower bound on the moved side", () => {
    // NaN coerces to 0 via Number(); the side the user moved snaps to
    // the lower bound so the span stays legal.
    const result = clampKbRange({ from: Number.NaN, to: 72 }, KB_RANGE_DEFAULT, "from");
    expect(result.from).toBeGreaterThanOrEqual(KB_RANGE_MIN);
    expect(result.to - result.from).toBeGreaterThanOrEqual(KB_RANGE_MIN_SPAN);
  });

  it("never produces from >= to", () => {
    const cases = [
      { from: 72, to: 48 },
      { from: 60, to: 60 },
      { from: 100, to: 50 },
      { from: KB_RANGE_MIN, to: KB_RANGE_MIN },
      { from: KB_RANGE_MAX, to: KB_RANGE_MAX },
    ];
    for (const c of cases) {
      const r = clampKbRange(c, KB_RANGE_DEFAULT);
      expect(r.to - r.from).toBeGreaterThanOrEqual(KB_RANGE_MIN_SPAN);
    }
  });

  it("always honors KB_RANGE_MIN_SPAN even at the extremes", () => {
    const low = clampKbRange({ from: KB_RANGE_MIN, to: KB_RANGE_MIN + 3 }, KB_RANGE_DEFAULT, "from");
    expect(low.to - low.from).toBe(KB_RANGE_MIN_SPAN);
    const high = clampKbRange({ from: KB_RANGE_MAX - 3, to: KB_RANGE_MAX }, KB_RANGE_DEFAULT, "to");
    expect(high.to - high.from).toBe(KB_RANGE_MIN_SPAN);
  });
});