/**
 * engine/practice/ramp.test.ts - PRD-001 Phase 7 S2 (D121/D124): the
 * pure tempo-ladder pins. Laws 1-7 of section 2, including the
 * config-matrix sweep (law 7). Node env, colocated.
 */

import { describe, it, expect } from "vitest";
import { initialRampState, rampNext, normalizeRampConfig } from "./ramp";
import type { RampConfig, RampState } from "./ramp";

const CFG: RampConfig = {
  startBpm: 90,
  targetBpm: 102,
  stepBpm: 6,
  repsPerStep: 2,
  failThreshold: 2,
};

const ok = (success: boolean) => ({ kind: "rep" as const, success });
const reseed = (bpm: number) => ({ kind: "reseed" as const, bpm });
const reset = { kind: "reset" as const };

function run(s: RampState, events: Parameters<typeof rampNext>[2][]): RampState {
  return events.reduce((acc, e) => rampNext(acc, CFG, e), s);
}

describe("ramp law 1: CLIMB", () => {
  it("success bumps repsAtBpm + successStreak and clears failStreak", () => {
    const s = run(initialRampState(CFG), [ok(true)]);
    expect(s).toEqual({
      bpm: 90,
      repsAtBpm: 1,
      successStreak: 1,
      failStreak: 0,
      phase: "climb",
    });
  });

  it("at repsPerStep the ladder climbs by stepBpm and resets reps", () => {
    const s = run(initialRampState(CFG), [ok(true), ok(true)]);
    expect(s.bpm).toBe(96);
    expect(s.repsAtBpm).toBe(0);
    expect(s.successStreak).toBe(2); // streak keeps counting
  });

  it("streaks: success after failure resets failStreak (CONSECUTIVE is literal)", () => {
    const s = run(initialRampState(CFG), [ok(false), ok(true)]);
    expect(s.failStreak).toBe(0);
    expect(s.successStreak).toBe(1);
  });
});

describe("ramp law 2: DROP", () => {
  it("failure bumps failStreak and clears successStreak", () => {
    const s = run(initialRampState(CFG), [ok(false)]);
    expect(s.failStreak).toBe(1);
    expect(s.successStreak).toBe(0);
    expect(s.bpm).toBe(90);
  });

  it("at failThreshold the ladder drops one step and resets counters", () => {
    const climbed = run(initialRampState(CFG), [ok(true), ok(true)]); // 96
    const s = rampNext(rampNext(climbed, CFG, ok(false)), CFG, ok(false));
    expect(s.bpm).toBe(90);
    expect(s.failStreak).toBe(0);
    expect(s.repsAtBpm).toBe(0);
  });

  it("interleaved success resets failStreak - no drop without CONSECUTIVE failures", () => {
    // From 96: F, T, F -> the single success clears failStreak, so the
    // trailing F starts a NEW streak of 1 (< threshold 2): NO drop.
    // (Law 1 is literal: the success still counted a rep.)
    const climbed = run(initialRampState(CFG), [ok(true), ok(true)]); // 96
    const s = run(climbed, [ok(false), ok(true), ok(false)]);
    expect(s.bpm).toBe(96);
    expect(s.failStreak).toBe(1);
    expect(s.repsAtBpm).toBe(1);
  });
});

describe("ramp law 3: COMPLETE", () => {
  it("a climb step landing exactly on target marks phase complete", () => {
    const s = run(initialRampState(CFG), [ok(true), ok(true), ok(true), ok(true)]);
    expect(s.bpm).toBe(102);
    expect(s.phase).toBe("complete");
  });

  it("min-clamp makes a NON-DIVIDING gap land exactly on target", () => {
    const c: RampConfig = { startBpm: 90, targetBpm: 100, stepBpm: 7, repsPerStep: 1, failThreshold: 5 };
    let s = initialRampState(c);
    for (let i = 0; i < 10; i++) s = rampNext(s, c, ok(true));
    expect(s.bpm).toBe(100);
    expect(s.phase).toBe("complete");
  });

  it("reseed to target does NOT complete (ladder-only, pinned)", () => {
    const s = rampNext(initialRampState(CFG), CFG, reseed(102));
    expect(s.bpm).toBe(102);
    expect(s.phase).toBe("climb");
  });

  it("a drop below target after completion returns to climb", () => {
    const done = run(initialRampState(CFG), [ok(true), ok(true), ok(true), ok(true)]);
    const s = rampNext(rampNext(done, CFG, ok(false)), CFG, ok(false));
    expect(s.bpm).toBe(96);
    expect(s.phase).toBe("climb");
  });
});

describe("ramp law 4: CLAMPS", () => {
  it("bpm never exceeds target nor sinks below start", () => {
    let s = initialRampState(CFG);
    for (let i = 0; i < 50; i++) s = rampNext(s, CFG, ok(true));
    expect(s.bpm).toBe(102);
    for (let i = 0; i < 50; i++) s = rampNext(s, CFG, ok(false));
    expect(s.bpm).toBe(90);
  });
});

describe("ramp law 5: RESEED + RESET", () => {
  it("reseed clamps into [start, target], zeroes counters, ALWAYS climb", () => {
    const climbed = run(initialRampState(CFG), [ok(true), ok(true), ok(true)]);
    const s = rampNext(climbed, CFG, reseed(240));
    expect(s).toEqual({
      bpm: 102, // clamped to target
      repsAtBpm: 0,
      successStreak: 0,
      failStreak: 0,
      phase: "climb", // takeover invalidates completion
    });
    const low = rampNext(climbed, CFG, reseed(30));
    expect(low.bpm).toBe(90); // clamped up to start
    expect(low.phase).toBe("climb");
  });

  it("reset returns to the initial state and is idempotent", () => {
    const climbed = run(initialRampState(CFG), [ok(true), ok(true), ok(true)]);
    const a = rampNext(climbed, CFG, reset);
    const b = rampNext(a, CFG, reset);
    expect(a).toEqual(initialRampState(CFG));
    expect(b).toEqual(a);
  });
});

describe("ramp law 6: normalizeRampConfig", () => {
  it("rejects startBpm >= targetBpm (null = ramp disabled)", () => {
    expect(normalizeRampConfig({ startBpm: 100, targetBpm: 100, stepBpm: 4, repsPerStep: 2, failThreshold: 2 })).toBeNull();
    expect(normalizeRampConfig({ startBpm: 120, targetBpm: 90, stepBpm: 4, repsPerStep: 2, failThreshold: 2 })).toBeNull();
  });

  it("clamps bpm into [30, 240]", () => {
    const c = normalizeRampConfig({ startBpm: 10, targetBpm: 999, stepBpm: 4, repsPerStep: 2, failThreshold: 2 });
    expect(c).not.toBeNull();
    expect(c!.startBpm).toBe(30);
    expect(c!.targetBpm).toBe(240);
  });

  it("floors stepBpm / repsPerStep / failThreshold at 1", () => {
    const c = normalizeRampConfig({ startBpm: 90, targetBpm: 150, stepBpm: 0, repsPerStep: -3, failThreshold: 0.5 });
    expect(c).not.toBeNull();
    expect(c!.stepBpm).toBe(1);
    expect(c!.repsPerStep).toBe(1);
    expect(c!.failThreshold).toBe(1);
  });

  it("non-object / non-finite garbage -> null", () => {
    expect(normalizeRampConfig(null)).toBeNull();
    expect(normalizeRampConfig("90")).toBeNull();
    expect(normalizeRampConfig({ startBpm: Number.NaN, targetBpm: 150 })).toBeNull();
    expect(normalizeRampConfig({ startBpm: 90 })).toBeNull();
  });
});

describe("ramp law 7: matrix sweep (deterministic corners)", () => {
  it("repsPerStep=1 climbs every success; failThreshold=1 drops every failure", () => {
    const c: RampConfig = { startBpm: 100, targetBpm: 110, stepBpm: 5, repsPerStep: 1, failThreshold: 1 };
    let s = rampNext(initialRampState(c), c, ok(true));
    expect(s.bpm).toBe(105);
    s = rampNext(s, c, ok(true));
    expect(s.bpm).toBe(110);
    expect(s.phase).toBe("complete");
    s = rampNext(s, c, ok(false));
    expect(s.bpm).toBe(105);
    expect(s.phase).toBe("climb");
  });

  it("start=target-1 corner: one climb lands exactly and completes", () => {
    const c: RampConfig = { startBpm: 119, targetBpm: 120, stepBpm: 10, repsPerStep: 1, failThreshold: 3 };
    const s = rampNext(initialRampState(c), c, ok(true));
    expect(s.bpm).toBe(120);
    expect(s.phase).toBe("complete");
  });

  it("stepBpm larger than remaining gap clamps to target without overshoot", () => {
    const c: RampConfig = { startBpm: 90, targetBpm: 100, stepBpm: 40, repsPerStep: 1, failThreshold: 9 };
    const s = rampNext(initialRampState(c), c, ok(true));
    expect(s.bpm).toBe(100);
  });

  it("drop at startBpm floors at start (never below)", () => {
    const c: RampConfig = { startBpm: 90, targetBpm: 100, stepBpm: 40, repsPerStep: 2, failThreshold: 1 };
    const s = rampNext(initialRampState(c), c, ok(false));
    expect(s.bpm).toBe(90);
  });

  it("the e2e ladder (90->102 step 6 reps 2): the exact chip sequence", () => {
    let s = initialRampState(CFG);
    s = rampNext(s, CFG, ok(true));
    s = rampNext(s, CFG, ok(true));
    expect(s.bpm).toBe(96); // Made it x2 -> 96
    s = rampNext(s, CFG, ok(false));
    s = rampNext(s, CFG, ok(false));
    expect(s.bpm).toBe(90); // Missed it x2 -> 90
    s = rampNext(s, CFG, ok(true));
    s = rampNext(s, CFG, ok(true));
    expect(s.bpm).toBe(96); // Made it x2 -> 96
    s = rampNext(s, CFG, ok(true));
    s = rampNext(s, CFG, ok(true));
    expect(s.bpm).toBe(102); // -> 102
    expect(s.phase).toBe("complete"); // TARGET visible (REQ-PRAC-33)
  });
});
