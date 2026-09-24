/**
 * engine/practice/windows.test.ts - PRD-001 Phase 7 S1 (D110) pins.
 * Node env (pure logic, no DOM). S2 extends this file with the
 * pause duty-cycle / AB alternation / containment properties once
 * windows.ts grows the scheduler (docs/PHASE-7-PRACTICE.md 7).
 */
import { describe, it, expect } from "vitest";
import {
  barOfStep,
  clampWindow,
  totalFormBars,
  windowStepRange,
  type BarWindow,
} from "./windows";

describe("totalFormBars", () => {
  it("is the honest display total", () => {
    expect(totalFormBars(16)).toBe(16);
    expect(totalFormBars(96)).toBe(96);
  });

  it("degenerate form lengths still show one bar", () => {
    expect(totalFormBars(0)).toBe(1);
    expect(totalFormBars(-5)).toBe(1);
    expect(totalFormBars(Number.NaN)).toBe(1);
    expect(totalFormBars(3.7)).toBe(3);
  });
});

describe("barOfStep - the one honest bar<->step law", () => {
  it("identity map within the first pass", () => {
    for (let s = 0; s < 16; s++) expect(barOfStep(s, 16)).toBe(s);
  });

  it("wraps across padded repeats (form-relative, not absolute)", () => {
    expect(barOfStep(16, 16)).toBe(0);
    expect(barOfStep(20, 16)).toBe(4);
    expect(barOfStep(95, 16)).toBe(15);
    // Non-repeating path: formLen === steps.length -> plain 1:1.
    expect(barOfStep(7, 96)).toBe(7);
  });

  it("negative + NaN guarded (never returns a negative bar)", () => {
    expect(barOfStep(-1, 16)).toBe(15);
    expect(barOfStep(-16, 16)).toBe(0);
    expect(barOfStep(Number.NaN, 16)).toBe(0);
    expect(barOfStep(5, 0)).toBe(0); // degenerate total -> 1 bar
    expect(barOfStep(5, Number.NaN)).toBe(0);
  });
});

describe("clampWindow", () => {
  it("passes an in-range window through unchanged", () => {
    expect(clampWindow({ fromBar: 4, toBar: 7 }, 16)).toEqual({
      fromBar: 4,
      toBar: 7,
    });
  });

  it("clamps toBar >= formLen and negative fromBar into range", () => {
    expect(clampWindow({ fromBar: 0, toBar: 999 }, 16)).toEqual({
      fromBar: 0,
      toBar: 15,
    });
    expect(clampWindow({ fromBar: -3, toBar: 2 }, 16)).toEqual({
      fromBar: 0,
      toBar: 2,
    });
  });

  it("normalizes a reversed selection (from > to swaps)", () => {
    expect(clampWindow({ fromBar: 9, toBar: 2 }, 16)).toEqual({
      fromBar: 2,
      toBar: 9,
    });
  });

  it("degenerate form lengths collapse to bar 0", () => {
    expect(clampWindow({ fromBar: 5, toBar: 8 }, 0)).toEqual({
      fromBar: 0,
      toBar: 0,
    });
  });
});

describe("windowStepRange - identity within the first pass", () => {
  it("maps inclusive bars [a..c] to half-open steps [a..c+1)", () => {
    // The F3 case: "loop bars 5-8" (0-based 4..7) = steps 4..8).
    expect(windowStepRange({ fromBar: 4, toBar: 7 }, 16)).toEqual({
      fromStep: 4,
      toStep: 8,
    });
  });

  it("a full-form window spans exactly formLen steps (NOT *4)", () => {
    const r = windowStepRange({ fromBar: 0, toBar: 15 }, 16);
    expect(r).toEqual({ fromStep: 0, toStep: 16 });
    expect(r.toStep - r.fromStep).toBe(16);
  });

  it("clamps persisted outliers before mapping", () => {
    expect(windowStepRange({ fromBar: 0, toBar: 999 }, 16)).toEqual({
      fromStep: 0,
      toStep: 16,
    });
    expect(windowStepRange({ fromBar: 20, toBar: 30 }, 16)).toEqual({
      fromStep: 15,
      toStep: 16,
    });
  });

  it("single-bar window spans one step", () => {
    const w: BarWindow = { fromBar: 3, toBar: 3 };
    expect(windowStepRange(w, 16)).toEqual({ fromStep: 3, toStep: 4 });
  });
});

describe("handler-law regression (the F3 bug class)", () => {
  it("a 4-bar selection spans 4 steps, never 16", () => {
    const { fromStep, toStep } = windowStepRange({ fromBar: 4, toBar: 7 }, 16);
    expect(toStep - fromStep).toBe(4);
    // The legacy math (startBar * 4 .. (endBar + 1) * 4) spanned 16.
    expect(4 * 4).not.toBe(fromStep);
  });
});
