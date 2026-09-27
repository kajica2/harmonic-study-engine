/**
 * engine/practice/duty.test.ts - PRD-001 Phase 7 S2 (D122/D123): the
 * pure next-measure scheduler pins.
 *
 * RED-FIRST DISCIPLINE (handoff note 1): pin #2 (LOOP EQUIVALENCE) was
 * written BEFORE duty.ts existed. It re-implements the SHIPPED F3
 * handler lines (src/App.tsx :1572-1587 at HEAD 33ee287) as the
 * reference oracle - the scheduler must reproduce them for exhaustive
 * (prev, window) sweeps. This is the handler-safety net: routing mode
 * "loop" through advanceTransport() is behavior-preserving BY TEST,
 * not by argument (same role the F3 e2e leg played in S1).
 *
 * Laws pinned here (docs/PHASE-7-S2-MECHANICS.md section 2):
 *   1 CONTAINMENT      nextStep always in [spanFromStep, spanToStep)
 *   2 LOOP EQUIVALENCE mode "loop" == shipped F3 oracle
 *   3 PAUSE EXACTNESS  every (N+M)-cycle: N play then M rest
 *   4 AB ALTERNATION   slot flips every swapBars firings
 *   5 PASS             passCompleted law per mode, never two in one
 *   6 SPAN             pause spans the FORM (not padded); degenerate
 *                      configs fall back to loop law, never crash
 *   7 PURE             integer-guarded, no clock/rng/Date (property:
 *                      same input -> same output, NaN-safe)
 *
 * Node env (pure logic, colocated per the S1 windows.test.ts pattern).
 */

import { describe, it, expect } from "vitest";
import { advanceTransport } from "./duty";
import type {
  AbConfig,
  PauseConfig,
  TransportDecision,
  TransportInput,
} from "./duty";
import { clampWindow, totalFormBars, windowStepRange } from "./windows";
import type { BarWindow } from "./windows";
import { createRng } from "../core/rng";

// ---------------------------------------------------------------------------
// The shipped F3 branch, transcribed VERBATIM from src/App.tsx :1572-1587
// at HEAD 33ee287 (the oracle half of equivalence pin #2). Do not "fix"
// this: it is the regression floor for the handler surgery.
// ---------------------------------------------------------------------------
function shippedF3Branch(
  prev: number,
  loopStartBar: number,
  loopEndBar: number | null,
  formLen: number,
): number {
  const totalBars = totalFormBars(formLen);
  const { fromStep, toStep } = windowStepRange(
    { fromBar: loopStartBar, toBar: loopEndBar ?? totalBars - 1 },
    formLen,
  );
  if (prev + 1 >= toStep) return fromStep;
  else if (prev < fromStep) return fromStep;
  else return prev + 1;
}

function base(over: Partial<TransportInput>): TransportInput {
  return {
    prevStep: 0,
    barCounter: 1,
    formLen: 16,
    totalSteps: 48,
    mode: "loop",
    loop: null,
    pause: null,
    ab: null,
    ...over,
  };
}

describe("duty: LOOP EQUIVALENCE pin #2 (shipped F3 oracle)", () => {
  it("mode loop reproduces the shipped 6 lines for exhaustive (prev, window) sweeps", () => {
    // formLen 4..16, every legal window inside the form, prev across the
    // padded path (3 passes) - the exact domain the handler can present.
    for (let formLen = 4; formLen <= 16; formLen++) {
      const totalSteps = formLen * 3;
      for (let from = 0; from < formLen; from++) {
        for (let to = from; to < formLen; to++) {
          const loop: BarWindow = { fromBar: from, toBar: to };
          for (let prev = 0; prev < totalSteps; prev++) {
            const d = advanceTransport(
              base({ mode: "loop", formLen, totalSteps, prevStep: prev, loop }),
            );
            const oracle = shippedF3Branch(prev, from, to, formLen);
            expect(
              d.nextStep,
              `loop equivalence form=${formLen} window=${from}..${to} prev=${prev}`,
            ).toBe(oracle);
          }
        }
      }
    }
  });

  it("mode loop with null window equals the shipped branch over the whole form", () => {
    for (let formLen = 4; formLen <= 16; formLen++) {
      const totalSteps = formLen * 2;
      for (let prev = 0; prev < totalSteps; prev++) {
        const d = advanceTransport(
          base({ mode: "loop", formLen, totalSteps, prevStep: prev, loop: null }),
        );
        // The shipped call site always resolved toBar ?? totalBars - 1;
        // null here means the SAME span resolved by the caller.
        const oracle = shippedF3Branch(prev, 0, null, formLen);
        expect(d.nextStep, `form ${formLen} prev ${prev}`).toBe(oracle);
      }
    }
  });

  it("loop decisions are phase play, no AB slot, dutyIndex 0, pass only on tail wrap", () => {
    const d = advanceTransport(
      base({ mode: "loop", prevStep: 7, loop: { fromBar: 4, toBar: 7 } }),
    );
    expect(d.phase).toBe("play");
    expect(d.activeWindow).toBeNull();
    expect(d.dutyIndex).toBe(0);
    expect(d.nextStep).toBe(4);
    expect(d.passCompleted).toBe(true); // prev at span tail wrapping to head
    const mid = advanceTransport(
      base({ mode: "loop", prevStep: 5, loop: { fromBar: 4, toBar: 7 } }),
    );
    expect(mid.passCompleted).toBe(false);
  });

  it("single-bar window: every bar is a pass (loop)", () => {
    for (let k = 1; k <= 6; k++) {
      const d = advanceTransport(
        base({ mode: "loop", prevStep: 3, loop: { fromBar: 3, toBar: 3 }, barCounter: k }),
      );
      expect(d.nextStep).toBe(3);
      expect(d.passCompleted).toBe(true);
    }
  });
});

describe("duty: CONTAINMENT property (law 1)", () => {
  it("nextStep stays inside the clamped span for 1k seeded configs x 200-bar walks", () => {
    // mulberry32 INJECTED (engine/core/rng.ts) - never Math.random (law 7).
    const rng = createRng(0x52d47);
    for (let c = 0; c < 1000; c++) {
      const formLen = rng.range(1, 24);
      const totalSteps = formLen * rng.range(1, 4);
      const mode = rng.pick(["loop", "pause", "ab"] as const);
      const hasLoop = rng.bool(0.5);
      const lo = rng.int(formLen);
      const hi = rng.int(formLen);
      const loop: BarWindow | null = hasLoop
        ? { fromBar: Math.min(lo, hi), toBar: Math.max(lo, hi) }
        : null;
      const pause: PauseConfig = { playBars: rng.range(1, 8), restBars: rng.range(1, 8) };
      const ab: AbConfig = {
        a: { fromBar: rng.int(formLen), toBar: rng.int(formLen) },
        b: { fromBar: rng.int(formLen), toBar: rng.int(formLen) },
        swapBars: rng.range(1, 6),
      };
      let prev = rng.int(totalSteps);
      for (let k = 1; k <= 200; k++) {
        const d = advanceTransport(
          base({ mode, formLen, totalSteps, prevStep: prev, loop, pause, ab, barCounter: k }),
        );
        expect(
          d.nextStep >= d.spanFromStep && d.nextStep < d.spanToStep,
          `containment: config ${c} k ${k} prev ${prev} -> ${d.nextStep} not in [${d.spanFromStep},${d.spanToStep})`,
        ).toBe(true);
        prev = d.nextStep;
      }
    }
  });
});

describe("duty: PAUSE duty exactness (law 3)", () => {
  type BarState = { phase: "play" | "rest"; duty: number };

  function pauseBars(N: number, M: number, bars: number, formLen = 16): BarState[] {
    const out: BarState[] = [];
    // Bar 1 after the count-in is ALWAYS play (App resets the counter and
    // the phase on the isPlayingAuto TRUE edge - D122). Firing k governs
    // bar k+1, so bar b carries dutyIndex (b-1) % (N+M).
    out.push({ phase: "play", duty: 0 });
    for (let k = 1; k < bars; k++) {
      const d = advanceTransport(
        base({ mode: "pause", barCounter: k, pause: { playBars: N, restBars: M }, formLen }),
      );
      out.push({ phase: d.phase, duty: d.dutyIndex });
    }
    return out;
  }

  it("10k-bar sweep: every (N+M)-cycle is exactly N play then M rest", () => {
    const N = 3;
    const M = 5;
    const seq = pauseBars(N, M, 10_000);
    for (let b = 0; b + N + M <= seq.length; b += N + M) {
      const cycle = seq.slice(b, b + N + M);
      cycle.forEach((s, i) => {
        expect(s.phase, `cycle @${b} pos ${i}`).toBe(i < N ? "play" : "rest");
      });
    }
  });

  it("dutyIndex == barCounter % (N+M) and dutyIndex 0 is play", () => {
    for (let k = 1; k <= 40; k++) {
      const d = advanceTransport(
        base({ mode: "pause", barCounter: k, pause: { playBars: 2, restBars: 3 } }),
      );
      expect(d.dutyIndex).toBe(k % 5);
      expect(d.phase).toBe(k % 5 < 2 ? "play" : "rest");
    }
  });

  it("corner N=1 M=1 alternates every bar", () => {
    const seq = pauseBars(1, 1, 12);
    expect(seq.map((s) => (s.phase === "play" ? "p" : "r"))).toEqual([
      "p", "r", "p", "r", "p", "r", "p", "r", "p", "r", "p", "r",
    ]);
  });

  it("corner N=1 M=16: one play bar per 17-bar cycle", () => {
    const seq = pauseBars(1, 16, 34);
    seq.forEach((s, b) => {
      expect(s.phase).toBe(b % 17 === 0 ? "play" : "rest");
    });
  });

  it("corner N=16 M=1: single rest bar per 17-bar cycle", () => {
    const seq = pauseBars(16, 1, 34);
    seq.forEach((s, b) => {
      // rest iff (b % 17) === 16 (the 17th bar of each cycle)
      expect(s.phase).toBe(b % 17 === 16 ? "rest" : "play");
    });
  });

  it("pause passCompleted: wrap to span head only (same law as loop)", () => {
    const wrap = advanceTransport(
      base({ mode: "pause", barCounter: 1, prevStep: 15, pause: { playBars: 2, restBars: 2 } }),
    );
    expect(wrap.nextStep).toBe(0);
    expect(wrap.passCompleted).toBe(true);
    const mid = advanceTransport(
      base({ mode: "pause", barCounter: 2, prevStep: 3, pause: { playBars: 2, restBars: 2 } }),
    );
    expect(mid.nextStep).toBe(4);
    expect(mid.passCompleted).toBe(false);
  });

  it("pause over a loop window duties INSIDE the window", () => {
    const loop: BarWindow = { fromBar: 4, toBar: 11 };
    for (let k = 1; k <= 30; k++) {
      const d = advanceTransport(
        base({
          mode: "pause",
          barCounter: k,
          prevStep: 4 + (k % 8),
          loop,
          pause: { playBars: 2, restBars: 2 },
        }),
      );
      expect(d.spanFromStep).toBe(4);
      expect(d.spanToStep).toBe(12);
      expect(d.nextStep).toBeGreaterThanOrEqual(4);
      expect(d.nextStep).toBeLessThan(12);
    }
  });

  it("SPAN LAW: pause with loop=null spans the FORM, never the padded repeat", () => {
    // 32-bar standard padded x3 (96 steps): rests must land on TUNE
    // bars, never on pad artifacts (D122, honest + pinned).
    for (let k = 1; k <= 200; k++) {
      const d = advanceTransport(
        base({
          mode: "pause",
          barCounter: k,
          formLen: 32,
          totalSteps: 96,
          prevStep: k % 32,
          pause: { playBars: 4, restBars: 4 },
        }),
      );
      expect(d.spanFromStep).toBe(0);
      expect(d.spanToStep).toBe(32);
      expect(d.nextStep).toBeLessThan(32);
    }
  });
});

describe("duty: AB alternation (law 4) + pass (law 5)", () => {
  const ab: AbConfig = {
    a: { fromBar: 4, toBar: 7 },   // bars 5..8
    b: { fromBar: 8, toBar: 11 },  // bars 9..12
    swapBars: 4,
  };
  const walk = (k: number, prev: number): TransportDecision =>
    advanceTransport(base({ mode: "ab", barCounter: k, prevStep: prev, ab }));

  it("slot flips every swapBars firings, period 2*swapBars", () => {
    const slots: string[] = [];
    for (let k = 0; k <= 16; k++) {
      const d = advanceTransport(
        base({ mode: "ab", barCounter: k, prevStep: 4, ab }),
      );
      slots.push(d.activeWindow ?? "null");
    }
    // k=0..3 -> a, k=4..7 -> b, k=8..11 -> a, k=12..15 -> b, k=16 -> a
    expect(slots).toEqual([
      "a", "a", "a", "a", "b", "b", "b", "b",
      "a", "a", "a", "a", "b", "b", "b", "b", "a",
    ]);
  });

  it("swap at k=swapBars lands on the new window head and fires passCompleted", () => {
    const d = walk(4, 7); // was bar 8 (step 7, A tail) -> B head
    expect(d.activeWindow).toBe("b");
    expect(d.nextStep).toBe(8);
    expect(d.passCompleted).toBe(true);
    const back = walk(8, 11); // B tail -> A head
    expect(back.activeWindow).toBe("a");
    expect(back.nextStep).toBe(4);
    expect(back.passCompleted).toBe(true);
  });

  it("passCompleted fires on slot change ONLY - never on within-window wrap", () => {
    // swapBars 8 > window length 4: A repeats within the segment.
    const long: AbConfig = { a: { fromBar: 0, toBar: 3 }, b: { fromBar: 8, toBar: 11 }, swapBars: 8 };
    for (let k = 1; k <= 7; k++) {
      const d = advanceTransport(
        base({ mode: "ab", barCounter: k, prevStep: (k - 1) % 4, ab: long }),
      );
      expect(d.activeWindow).toBe("a");
      expect(d.passCompleted, `k ${k}`).toBe(false);
    }
    const swap = advanceTransport(
      base({ mode: "ab", barCounter: 8, prevStep: 3, ab: long }),
    );
    expect(swap.activeWindow).toBe("b");
    expect(swap.passCompleted).toBe(true);
    expect(swap.nextStep).toBe(8);
  });

  it("swapBars SHORTER than a window: mid-window jumps (configurable interval)", () => {
    const short: AbConfig = { a: { fromBar: 0, toBar: 7 }, b: { fromBar: 8, toBar: 15 }, swapBars: 2 };
    const k1 = advanceTransport(base({ mode: "ab", barCounter: 1, prevStep: 0, ab: short }));
    expect(k1.activeWindow).toBe("a");
    expect(k1.nextStep).toBe(1); // still inside A, no jump
    expect(k1.passCompleted).toBe(false);
    const k2 = advanceTransport(base({ mode: "ab", barCounter: 2, prevStep: 1, ab: short }));
    expect(k2.activeWindow).toBe("b");
    expect(k2.nextStep).toBe(8); // jumps to B head mid-A
    expect(k2.passCompleted).toBe(true);
  });

  it("A and B MAY overlap - comparing variants is legitimate", () => {
    const overlap: AbConfig = { a: { fromBar: 0, toBar: 7 }, b: { fromBar: 4, toBar: 11 }, swapBars: 4 };
    const d = advanceTransport(base({ mode: "ab", barCounter: 4, prevStep: 7, ab: overlap }));
    expect(d.activeWindow).toBe("b");
    expect(d.spanFromStep).toBe(4);
    expect(d.spanToStep).toBe(12);
    expect(d.nextStep).toBe(4);
  });

  it("AB span reflects the ACTIVE window (UI band + S3 seam)", () => {
    const dA = walk(1, 4);
    expect(dA.spanFromStep).toBe(4);
    expect(dA.spanToStep).toBe(8);
    const dB = walk(4, 4);
    expect(dB.spanFromStep).toBe(8);
    expect(dB.spanToStep).toBe(12);
  });

  it("AB is always phase play, dutyIndex 0", () => {
    for (let k = 0; k <= 9; k++) {
      const d = walk(k, 4);
      expect(d.phase).toBe("play");
      expect(d.dutyIndex).toBe(0);
    }
  });

  it("single-bar AB windows: every slot change is a pass, containment holds", () => {
    const one: AbConfig = { a: { fromBar: 2, toBar: 2 }, b: { fromBar: 5, toBar: 5 }, swapBars: 1 };
    // swapBars=1: flips EVERY firing.
    for (let k = 1; k <= 6; k++) {
      const d = advanceTransport(
        base({ mode: "ab", barCounter: k, prevStep: k % 2 === 0 ? 2 : 5, ab: one }),
      );
      expect(d.passCompleted).toBe(true);
      expect(d.nextStep).toBe(d.activeWindow === "a" ? 2 : 5);
    }
  });
});

describe("duty: degenerate guards (law 6) + purity (law 7)", () => {
  it("pause with null config falls back to loop-law behavior, never crashes", () => {
    const d = advanceTransport(
      base({ mode: "pause", barCounter: 3, prevStep: 15, pause: null }),
    );
    expect(d.nextStep).toBe(0);
    expect(d.phase).toBe("play");
    expect(d.passCompleted).toBe(true);
    expect(d.dutyIndex).toBe(0);
  });

  it("ab with null config falls back to loop-law behavior, never crashes", () => {
    const d = advanceTransport(
      base({ mode: "ab", barCounter: 5, prevStep: 9, ab: null, loop: { fromBar: 8, toBar: 12 } }),
    );
    expect(d.nextStep).toBe(10);
    expect(d.activeWindow).toBeNull();
    expect(d.passCompleted).toBe(false);
  });

  it("formLen 0 / NaN: degenerate form spans one bar, step 0", () => {
    for (const formLen of [0, Number.NaN]) {
      const d = advanceTransport(
        base({ mode: "pause", prevStep: 5, formLen, pause: { playBars: 1, restBars: 1 } }),
      );
      expect(d.spanFromStep).toBe(0);
      expect(d.spanToStep).toBe(1);
      expect(d.nextStep).toBe(0);
    }
  });

  it("reversed windows normalize via clampWindow (persisted swap)", () => {
    const d = advanceTransport(
      base({
        mode: "ab",
        barCounter: 0,
        prevStep: 0,
        ab: { a: { fromBar: 8, toBar: 2 }, b: { fromBar: 10, toBar: 10 }, swapBars: 4 },
      }),
    );
    expect(d.spanFromStep).toBe(2);
    expect(d.spanToStep).toBe(9);
  });

  it("barCounter 0 / negative is treated as the play-start state", () => {
    for (const k of [0, -5]) {
      const d = advanceTransport(
        base({ mode: "pause", barCounter: k, pause: { playBars: 2, restBars: 2 } }),
      );
      expect(d.dutyIndex).toBe(0);
      expect(d.phase).toBe("play");
      const e = advanceTransport(
        base({
          mode: "ab",
          barCounter: k,
          ab: { a: { fromBar: 0, toBar: 3 }, b: { fromBar: 4, toBar: 7 }, swapBars: 2 },
        }),
      );
      expect(e.activeWindow).toBe("a");
      expect(e.passCompleted).toBe(false); // no pass at the play-start state
    }
  });

  it("NaN prevStep / fractional counter are integer-guarded (safeInt law)", () => {
    const d = advanceTransport(
      base({ mode: "loop", prevStep: Number.NaN, loop: { fromBar: 4, toBar: 7 } }),
    );
    expect(Number.isInteger(d.nextStep)).toBe(true);
    expect(d.nextStep).toBe(4); // prev < fromStep -> head
    const e = advanceTransport(
      base({ mode: "pause", barCounter: 3.7, pause: { playBars: 2, restBars: 2 } }),
    );
    expect(e.dutyIndex).toBe(3);
  });

  it("pure: identical inputs produce identical decisions", () => {
    const input = base({
      mode: "pause",
      barCounter: 17,
      prevStep: 9,
      loop: { fromBar: 4, toBar: 13 },
      pause: { playBars: 3, restBars: 2 },
    });
    const a = advanceTransport(input);
    const b = advanceTransport(input);
    expect(a).toEqual(b);
  });

  it("pause clampWindow: out-of-form loop window narrows, never crashes", () => {
    // Persisted AB/loop windows are app-global; a shorter active form
    // narrows them (D122 form-boundary, same semantics as S1 blast #22).
    const d = advanceTransport(
      base({
        mode: "pause",
        barCounter: 1,
        prevStep: 10,
        formLen: 8,
        totalSteps: 24,
        loop: { fromBar: 2, toBar: 40 },
        pause: { playBars: 2, restBars: 1 },
      }),
    );
    const clamped = clampWindow({ fromBar: 2, toBar: 40 }, 8);
    expect(d.spanFromStep).toBe(clamped.fromBar);
    expect(d.spanToStep).toBe(clamped.toBar + 1);
    expect(d.nextStep).toBeLessThan(d.spanToStep);
  });
});
