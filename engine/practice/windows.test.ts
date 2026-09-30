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
  decideAutoAdvance,
  isLoopPresetActive,
  loopPresetWindow,
  totalFormBars,
  wholeFormNextStep,
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

describe("wholeFormNextStep - the DEFAULT whole-form repeat (2026-09)", () => {
  it("advances one form bar per step inside the form", () => {
    for (let s = 0; s < 15; s++) expect(wholeFormNextStep(s, 16)).toBe(s + 1);
  });

  it("wraps at the FORM tail, not the padded-path tail", () => {
    expect(wholeFormNextStep(15, 16)).toBe(0);
    // The padded view keeps the SAME law: 24 padded bars of a 16-bar
    // form still wrap to 0 at the form tail. The retired branch did
    // next = 0 at steps.length - 1 (23), i.e. it played a truncated
    // 1.5-pass form and (with the Loop chip off) halted there.
    expect(wholeFormNextStep(23, 16)).toBe(0);
  });

  it("repeats the whole form forever: one wrap per pass, always in range", () => {
    const formLen = 16;
    let step = 0;
    const walked: number[] = [];
    for (let i = 0; i < formLen * 3; i++) {
      step = wholeFormNextStep(step, formLen);
      walked.push(step);
    }
    const onePass = Array.from({ length: formLen }, (_, i) =>
      i === formLen - 1 ? 0 : i + 1,
    );
    expect(walked.slice(0, formLen)).toEqual(onePass);
    expect(walked.slice(formLen).slice(0, formLen)).toEqual(onePass);
    expect(walked.filter((s) => s === 0).length).toBe(3); // 3 passes, 3 wraps
    expect(walked.every((s) => s >= 0 && s < formLen)).toBe(true);
  });

  it("a degenerate form (0 / NaN) stays on its single bar", () => {
    expect(wholeFormNextStep(0, 0)).toBe(0);
    expect(wholeFormNextStep(3, Number.NaN)).toBe(0);
  });

  it("negative / NaN prev snaps back to form bar 1 (stale persist)", () => {
    expect(wholeFormNextStep(-3, 16)).toBe(0);
    expect(wholeFormNextStep(Number.NaN, 16)).toBe(1);
  });
});

describe("decideAutoAdvance - loop OFF -> play once then advance (2026-09)", () => {
  it("loop ON always wraps (the historical whole-form repeat)", () => {
    // Mid-form, form tail, last path: loop wins regardless.
    expect(
      decideAutoAdvance({
        loopOn: true,
        nextStep: 5,
        activePathIndex: 0,
        pathCount: 3,
      }),
    ).toBe("wrap");
    expect(
      decideAutoAdvance({
        loopOn: true,
        nextStep: 0,
        activePathIndex: 2,
        pathCount: 3,
      }),
    ).toBe("wrap");
  });

  it("loop OFF mid-form keeps the whole-form cycle (wrap)", () => {
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 5,
        activePathIndex: 0,
        pathCount: 3,
      }),
    ).toBe("wrap");
    // The last form bar before the wrap is still mid-form.
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 15,
        activePathIndex: 0,
        pathCount: 3,
      }),
    ).toBe("wrap");
  });

  it("loop OFF form pass complete advances to the next path", () => {
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 0,
        pathCount: 3,
      }),
    ).toBe("advance");
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 1,
        pathCount: 3,
      }),
    ).toBe("advance");
  });

  it("loop OFF form pass complete on the LAST path stops", () => {
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 2,
        pathCount: 3,
      }),
    ).toBe("stop");
  });

  it("a single-path set stops at its one pass completion", () => {
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 0,
        pathCount: 1,
      }),
    ).toBe("stop");
  });

  it("a 1-bar form completes a pass every measure (honest law)", () => {
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 0,
        pathCount: 2,
      }),
    ).toBe("advance");
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 1,
        pathCount: 2,
      }),
    ).toBe("stop");
  });

  it("degenerate / NaN inputs never advance past the set", () => {
    // A NaN nextStep is not a wrap signal, so the form keeps cycling.
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: Number.NaN,
        activePathIndex: 0,
        pathCount: 3,
      }),
    ).toBe("wrap");
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: Number.NaN,
        pathCount: 3,
      }),
    ).toBe("advance"); // NaN index snaps to 0 -> not the last path
    expect(
      decideAutoAdvance({
        loopOn: false,
        nextStep: 0,
        activePathIndex: 0,
        pathCount: Number.NaN,
      }),
    ).toBe("stop"); // NaN count snaps to 0 -> single-path set
  });
});

describe("loopPresetWindow - one-click loop presets anchored at currentBar", () => {
  it("mid-form: the requested span lands cleanly inside the form", () => {
    // The happy path: a 4-bar loop anchored at bar 4 of a 16-bar form
    // spans bars 4..7 (inclusive 0-based; display 5..8).
    expect(loopPresetWindow(4, 4, 16)).toEqual({ fromBar: 4, toBar: 7 });
    // 1-bar preset: anchored at bar 4 spans exactly bar 4.
    expect(loopPresetWindow(4, 1, 16)).toEqual({ fromBar: 4, toBar: 4 });
    // 2-bar preset: anchored at bar 0 spans bars 0..1.
    expect(loopPresetWindow(0, 2, 16)).toEqual({ fromBar: 0, toBar: 1 });
  });

  it("near-tail: end bar is clamped to the form tail (start stays anchored)", () => {
    // 4-bar preset from bar 14 of a 16-bar form: bars 14..17 -> clamp
    // toBar to 15. The 2-bar span stays at the user's anchor; the
    // active-highlight helper catches the truncation (see below).
    expect(loopPresetWindow(14, 4, 16)).toEqual({ fromBar: 14, toBar: 15 });
    // 2-bar preset from bar 15 of a 16-bar form: bars 15..16 -> 15..15.
    expect(loopPresetWindow(15, 2, 16)).toEqual({ fromBar: 15, toBar: 15 });
  });

  it("single-bar form: anchors on bar 0 regardless of requested bars", () => {
    // A 1-bar form (totalFormBars(1) = 1) is degenerate but legal.
    // currentBar 0 is the ONLY in-range anchor; any bars value is the
    // whole form.
    expect(loopPresetWindow(0, 1, 1)).toEqual({ fromBar: 0, toBar: 0 });
    expect(loopPresetWindow(0, 4, 1)).toEqual({ fromBar: 0, toBar: 0 });
    expect(loopPresetWindow(0, 16, 1)).toEqual({ fromBar: 0, toBar: 0 });
    // currentBar outside [0, 1) is out of range -> null.
    expect(loopPresetWindow(1, 4, 1)).toBeNull();
    expect(loopPresetWindow(-1, 4, 1)).toBeNull();
  });

  it("bars > formLen: returns the whole form (clamped to the tail)", () => {
    // 32-bar preset on a 16-bar form from bar 0 = whole form.
    expect(loopPresetWindow(0, 32, 16)).toEqual({ fromBar: 0, toBar: 15 });
    // Same overshoot from mid-form: still clamped to the form tail.
    expect(loopPresetWindow(8, 32, 16)).toEqual({ fromBar: 8, toBar: 15 });
  });

  it("currentBar >= formLen: out of range -> null", () => {
    // currentBar 16 of a 16-bar form is past the last bar.
    expect(loopPresetWindow(16, 4, 16)).toBeNull();
    // Way out of range.
    expect(loopPresetWindow(999, 4, 16)).toBeNull();
    // currentBar === formLen for a 1-bar form is past the only bar.
    expect(loopPresetWindow(1, 1, 1)).toBeNull();
  });

  it("currentBar negative: out of range -> null", () => {
    expect(loopPresetWindow(-1, 4, 16)).toBeNull();
    expect(loopPresetWindow(-16, 4, 16)).toBeNull();
    expect(loopPresetWindow(-0.5, 4, 16)).toBeNull();
  });

  it("bars <= 0 or non-finite: degenerate -> null", () => {
    expect(loopPresetWindow(0, 0, 16)).toBeNull();
    expect(loopPresetWindow(0, -1, 16)).toBeNull();
    expect(loopPresetWindow(0, Number.NaN, 16)).toBeNull();
    expect(loopPresetWindow(0, Number.POSITIVE_INFINITY, 16)).toBeNull();
  });

  it("currentBar / formLen non-finite or non-positive form: -> null", () => {
    expect(loopPresetWindow(Number.NaN, 4, 16)).toBeNull();
    // formLen 0 collapses to totalFormBars=1; currentBar outside [0,1)
    // is out of range.
    expect(loopPresetWindow(2, 4, 0)).toBeNull();
    expect(loopPresetWindow(Number.NaN, 4, Number.NaN)).toBeNull();
    // Negative formLen collapses to totalFormBars=1; same boundary.
    expect(loopPresetWindow(1, 4, -3)).toBeNull();
  });

  it("fractional currentBar is floored (bar step is integer)", () => {
    // 4.7 -> 4: the bar step is integer per the 1:1 law, so a
    // fractional cursor rounds down (consistent with safeInt).
    expect(loopPresetWindow(4.7, 4, 16)).toEqual({ fromBar: 4, toBar: 7 });
  });
});

describe("isLoopPresetActive - active highlight for the preset chip", () => {
  it("a stored window matching the preset span highlights (no truncation)", () => {
    // The 4-bar preset from bar 4 of a 16-bar form: store bars 4..7.
    const w = loopPresetWindow(4, 4, 16)!;
    expect(isLoopPresetActive(w, 4, 16)).toBe(true);
    // 1-bar / 2-bar variants light up their respective buttons.
    expect(isLoopPresetActive(loopPresetWindow(4, 1, 16)!, 1, 16)).toBe(true);
    expect(isLoopPresetActive(loopPresetWindow(0, 2, 16)!, 2, 16)).toBe(true);
  });

  it("a near-tail truncated window does NOT highlight (not a real 4-bar)", () => {
    // bars 14..15 is the clamped result of a 4-bar preset from bar 14:
    // only 2 form bars span the window, so isLoopPresetActive is
    // false for bars=4 (the button knows it would land here).
    const w = loopPresetWindow(14, 4, 16)!;
    expect(w).toEqual({ fromBar: 14, toBar: 15 });
    expect(isLoopPresetActive(w, 4, 16)).toBe(false);
    // But it IS the 2-bar preset from bar 14.
    expect(isLoopPresetActive(w, 2, 16)).toBe(true);
  });

  it("a whole-form loop (bars > formLen result) does NOT highlight any preset", () => {
    // 32-bar preset from bar 0 collapses to the whole form. None of
    // the 1/2/4-bar presets match the 16-bar span.
    const w = loopPresetWindow(0, 32, 16)!;
    expect(w).toEqual({ fromBar: 0, toBar: 15 });
    expect(isLoopPresetActive(w, 1, 16)).toBe(false);
    expect(isLoopPresetActive(w, 2, 16)).toBe(false);
    expect(isLoopPresetActive(w, 4, 16)).toBe(false);
  });

  it("a null / cleared window never highlights", () => {
    expect(isLoopPresetActive(null, 1, 16)).toBe(false);
    expect(isLoopPresetActive(null, 4, 16)).toBe(false);
  });

  it("degenerate bars / formLen never highlight", () => {
    const w = { fromBar: 4, toBar: 7 };
    expect(isLoopPresetActive(w, 0, 16)).toBe(false);
    expect(isLoopPresetActive(w, -1, 16)).toBe(false);
    expect(isLoopPresetActive(w, Number.NaN, 16)).toBe(false);
  });

  it("the whole-form shipped default (loopStartBar null) never highlights", () => {
    // The default loop state is null loopStartBar - no preset matches
    // until the user clicks one. This is the "fresh session" baseline.
    expect(isLoopPresetActive(null, 1, 16)).toBe(false);
    expect(isLoopPresetActive(null, 4, 32)).toBe(false);
  });
});
