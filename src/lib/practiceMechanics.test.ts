/**
 * src/lib/practiceMechanics.test.ts - PRD-001 Phase 7 S2 (D126): the
 * hydrate-guard pins. normalizePracticeMechanics must map ANY stored
 * JSON to a valid config (normalizeMetronomeConfig's contract,
 * audit #14); formatRampChip pins the exact REQ-PRAC-32 strings.
 * Node env (pure logic).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_MECHANICS,
  formatRampChip,
  normalizePracticeMechanics,
} from "./practiceMechanics";
import { initialRampState, rampNext } from "../../engine/practice/ramp";

function isValid(c: ReturnType<typeof normalizePracticeMechanics>): void {
  expect(["off", "loop", "pause", "ab"]).toContain(c.mode);
  expect(c.pause.playBars).toBeGreaterThanOrEqual(1);
  expect(c.pause.playBars).toBeLessThanOrEqual(16);
  expect(c.pause.restBars).toBeGreaterThanOrEqual(1);
  expect(c.pause.restBars).toBeLessThanOrEqual(16);
  expect(c.ab.a.fromBar).toBeLessThanOrEqual(c.ab.a.toBar);
  expect(c.ab.b.fromBar).toBeLessThanOrEqual(c.ab.b.toBar);
  expect(c.ab.swapBars).toBeGreaterThanOrEqual(1);
  expect(c.ab.swapBars).toBeLessThanOrEqual(32);
  // Law 6 + S2 fix-round LOW-3 contract: an ENABLED ramp is always a
  // valid ladder (start < target); a rejected-but-edited ladder
  // survives ONLY force-disabled, with every field finite + clamped
  // (no NaN ever reaches live state - the MED-1 guarantee).
  if (c.rampEnabled) expect(c.ramp.startBpm).toBeLessThan(c.ramp.targetBpm);
  expect(c.ramp.startBpm).toBeGreaterThanOrEqual(30);
  expect(c.ramp.startBpm).toBeLessThanOrEqual(240);
  expect(c.ramp.targetBpm).toBeGreaterThanOrEqual(30);
  expect(c.ramp.targetBpm).toBeLessThanOrEqual(240);
  expect(c.ramp.stepBpm).toBeGreaterThanOrEqual(1);
  expect(c.ramp.repsPerStep).toBeGreaterThanOrEqual(1);
  expect(c.ramp.failThreshold).toBeGreaterThanOrEqual(1);
  expect(typeof c.rampEnabled).toBe("boolean");
  // S3 (D132): the detect slice is TOTAL after normalize too.
  expect(typeof c.detect.enabled).toBe("boolean");
  expect(c.detect.toleranceMs).toBeGreaterThanOrEqual(60);
  expect(c.detect.toleranceMs).toBeLessThanOrEqual(300);
  expect(c.detect.passThreshold).toBeGreaterThanOrEqual(0.5);
  expect(c.detect.passThreshold).toBeLessThanOrEqual(1);
  // S4 (D143): the noteInput slice is TOTAL after normalize too.
  expect(typeof c.noteInput.enabled).toBe("boolean");
  expect(c.noteInput.rootOctave).toBeGreaterThanOrEqual(3);
  expect(c.noteInput.rootOctave).toBeLessThanOrEqual(4);
}

describe("normalizePracticeMechanics - total-shape guard", () => {
  it("undefined -> shipped defaults", () => {
    const c = normalizePracticeMechanics(undefined);
    expect(c).toEqual(DEFAULT_MECHANICS);
    isValid(c);
  });

  it("null / array / string garbage -> defaults, never throws", () => {
    for (const raw of [null, [], "pause", 42, true]) {
      isValid(normalizePracticeMechanics(raw));
    }
  });

  it("empty object -> all defaults", () => {
    expect(normalizePracticeMechanics({})).toEqual(DEFAULT_MECHANICS);
  });

  it("string fields / out-of-range numbers -> clamped or defaulted", () => {
    const c = normalizePracticeMechanics({
      mode: "teleport",
      pause: { playBars: "4", restBars: 999 },
      ab: { a: { fromBar: -5, toBar: "x" }, b: null, swapBars: 0 },
      ramp: { startBpm: "90", targetBpm: null },
      rampEnabled: "yes",
    });
    isValid(c);
    expect(c.mode).toBe("off");
    expect(c.pause.playBars).toBe(DEFAULT_MECHANICS.pause.playBars);
    expect(c.pause.restBars).toBe(16);
    expect(c.ab.a).toEqual(DEFAULT_MECHANICS.ab.a);
    expect(c.ab.swapBars).toBe(1);
    expect(c.ramp).toEqual(DEFAULT_MECHANICS.ramp);
    expect(c.rampEnabled).toBe(false);
  });

  it("NaN anywhere -> defaults for that field", () => {
    const c = normalizePracticeMechanics({
      pause: { playBars: Number.NaN, restBars: 2 },
      ab: { a: { fromBar: 0, toBar: Number.NaN }, b: { fromBar: 8, toBar: 15 }, swapBars: Number.NaN },
    });
    isValid(c);
    expect(c.pause.playBars).toBe(DEFAULT_MECHANICS.pause.playBars);
    expect(c.ab.a).toEqual(DEFAULT_MECHANICS.ab.a);
    expect(c.ab.swapBars).toBe(DEFAULT_MECHANICS.ab.swapBars);
  });

  it("pause steppers clamp to 1..16", () => {
    const c = normalizePracticeMechanics({ pause: { playBars: 100, restBars: -3 } });
    expect(c.pause).toEqual({ playBars: 16, restBars: 1 });
  });

  it("reversed persisted windows normalize ascending; huge indices cap", () => {
    const c = normalizePracticeMechanics({
      ab: { a: { fromBar: 10, toBar: 2 }, b: { fromBar: 1e9, toBar: 3 } },
    });
    expect(c.ab.a).toEqual({ fromBar: 2, toBar: 10 });
    expect(c.ab.b).toEqual({ fromBar: 3, toBar: 128 });
    isValid(c);
  });

  it("a REJECTED ramp config (start >= target) disables the ramp but KEEPS the edited ladder (LOW-3)", () => {
    const c = normalizePracticeMechanics({
      ramp: { startBpm: 150, targetBpm: 90, stepBpm: 6, repsPerStep: 3, failThreshold: 2 },
      rampEnabled: true,
    });
    isValid(c);
    // S2 fix-round LOW-3: no silent wipe - the user's numbers survive
    // (each law-6 clamped), the ramp is force-disabled (law 6: it can
    // never engage while start >= target).
    expect(c.ramp).toEqual({ startBpm: 150, targetBpm: 90, stepBpm: 6, repsPerStep: 3, failThreshold: 2 });
    expect(c.rampEnabled).toBe(false);
  });

  it("a GARBAGE ramp (non-object / non-finite bpms) still falls to the default ladder", () => {
    for (const raw of ["fast", 42, null, [], { startBpm: Number.NaN, targetBpm: 120 }]) {
      const c = normalizePracticeMechanics({ ramp: raw, rampEnabled: true });
      isValid(c);
      expect(c.ramp).toEqual(DEFAULT_MECHANICS.ramp);
      expect(c.rampEnabled).toBe(false);
    }
  });

  it("a valid stored config round-trips untouched", () => {
    const stored = {
      mode: "pause",
      pause: { playBars: 2, restBars: 6 },
      ab: { a: { fromBar: 4, toBar: 7 }, b: { fromBar: 8, toBar: 11 }, swapBars: 2 },
      ramp: { startBpm: 90, targetBpm: 102, stepBpm: 6, repsPerStep: 2, failThreshold: 2 },
      rampEnabled: true,
      // S3: a COMPLETE stored detect with NON-default values - the
      // round-trip must preserve them (not clobber with defaults).
      // The legacy missing-key case is pinned separately (no-v5 pin).
      detect: { enabled: true, toleranceMs: 90, passThreshold: 0.9 },
      // S4: same law for noteInput - a COMPLETE stored payload carries
      // the materialized sub-field (the missing-key case is the no-v5
      // pin in the S4 describe below).
      noteInput: { enabled: true, rootOctave: 3 },
    };
    expect(normalizePracticeMechanics(stored)).toEqual(stored);
  });

  it("defaults are not shared-mutable: mutating a result cannot poison DEFAULT_MECHANICS", () => {
    const c = normalizePracticeMechanics(undefined);
    c.pause.playBars = 99;
    c.ab.a.fromBar = 77;
    expect(DEFAULT_MECHANICS.pause.playBars).toBe(4);
    expect(DEFAULT_MECHANICS.ab.a.fromBar).toBe(0);
  });
});

describe("formatRampChip", () => {
  const cfg = { startBpm: 90, targetBpm: 102, stepBpm: 6, repsPerStep: 4, failThreshold: 2 };

  it("climbing chip: bpm, target, step, rep, streaks", () => {
    let s = initialRampState(cfg);
    s = rampNext(s, cfg, { kind: "rep", success: true });
    s = rampNext(s, cfg, { kind: "rep", success: true });
    s = rampNext(s, cfg, { kind: "rep", success: true });
    s = rampNext(s, cfg, { kind: "rep", success: true });
    // 4 reps at 90 -> climb to 96, reps reset, streak keeps counting.
    expect(formatRampChip(s, cfg)).toBe("RAMP 96 -> 102 (+6)  rep 0/4  S4/F0");
    s = rampNext(s, cfg, { kind: "rep", success: false });
    // A failure clears successStreak (CONSECUTIVE literal) - the doc's
    // illustrative "S3/F1" is UNREACHABLE by construction: F>0 only
    // while the current event is a fail (S=0). Pinned honestly here.
    expect(formatRampChip(s, cfg)).toBe("RAMP 96 -> 102 (+6)  rep 0/4  S0/F1");
    s = rampNext(s, cfg, { kind: "rep", success: true });
    expect(formatRampChip(s, cfg)).toBe("RAMP 96 -> 102 (+6)  rep 1/4  S1/F0");
  });

  it("complete chip: TARGET visible (REQ-PRAC-33)", () => {
    const c2 = { ...cfg, repsPerStep: 1 };
    let s = initialRampState(c2);
    s = rampNext(s, c2, { kind: "rep", success: true });
    s = rampNext(s, c2, { kind: "rep", success: true });
    s = rampNext(s, c2, { kind: "rep", success: true }); // 90->96->102
    expect(formatRampChip(s, c2)).toBe("RAMP 102 - TARGET");
  });

  it("initial chip", () => {
    expect(formatRampChip(initialRampState(cfg), cfg)).toBe(
      "RAMP 90 -> 102 (+6)  rep 0/4  S0/F0",
    );
  });
});

describe("S3 detect slice (D132): defaults-at-read, no v5", () => {
  it("LEGACY S2 payload WITHOUT the detect key -> shipped detect defaults (the no-v5 pin)", () => {
    const legacy = {
      mode: "pause",
      pause: { playBars: 2, restBars: 6 },
      ab: { a: { fromBar: 0, toBar: 3 }, b: { fromBar: 4, toBar: 7 }, swapBars: 2 },
      ramp: { startBpm: 100, targetBpm: 140, stepBpm: 5, repsPerStep: 3, failThreshold: 2 },
      rampEnabled: true,
    };
    const c = normalizePracticeMechanics(legacy);
    isValid(c);
    expect(c.detect).toEqual({ enabled: false, toleranceMs: 120, passThreshold: 0.8 });
    // Siblings untouched by the widening.
    expect(c.mode).toBe("pause");
    expect(c.pause).toEqual({ playBars: 2, restBars: 6 });
    expect(c.rampEnabled).toBe(true);
  });

  it("garbage detect -> defaults per field (string enabled, wild tolerance, NaN threshold)", () => {
    const c = normalizePracticeMechanics({
      detect: { enabled: "yes", toleranceMs: "120", passThreshold: Number.NaN },
    });
    isValid(c);
    expect(c.detect.enabled).toBe(false);
    expect(c.detect.toleranceMs).toBe(120);
    expect(c.detect.passThreshold).toBe(0.8);
  });

  it("range clamps: tolerance 60..300 INT, passThreshold 0.5..1.0", () => {
    const hi = normalizePracticeMechanics({ detect: { enabled: true, toleranceMs: 9999, passThreshold: 2 } });
    expect(hi.detect).toEqual({ enabled: true, toleranceMs: 300, passThreshold: 1 });
    const lo = normalizePracticeMechanics({ detect: { toleranceMs: 5, passThreshold: 0.1 } });
    expect(lo.detect.toleranceMs).toBe(60);
    expect(lo.detect.passThreshold).toBe(0.5);
    const frac = normalizePracticeMechanics({ detect: { toleranceMs: 120.7 } });
    expect(frac.detect.toleranceMs).toBe(120); // intInRange floors
  });

  it("DEFAULT_MECHANICS.detect shape + clone isolation", () => {
    expect(DEFAULT_MECHANICS.detect).toEqual({ enabled: false, toleranceMs: 120, passThreshold: 0.8 });
    const c = normalizePracticeMechanics("garbage");
    c.detect.enabled = true;
    expect(DEFAULT_MECHANICS.detect.enabled).toBe(false); // constant never mutated
  });
});

/**
 * PRD-001 Phase 7 S4 (D139/D143): the noteInput slice rides the ONE
 * practiceMechanics field - defaults-at-read, no v5, no new K keys.
 */
describe("S4 noteInput slice (D143): defaults-at-read, no v5", () => {
  it("LEGACY S3 payload WITHOUT the noteInput key -> shipped defaults (the no-v5 pin)", () => {
    const legacy = {
      mode: "loop",
      pause: { playBars: 4, restBars: 4 },
      ab: { a: { fromBar: 0, toBar: 7 }, b: { fromBar: 8, toBar: 15 }, swapBars: 4 },
      ramp: { startBpm: 90, targetBpm: 150, stepBpm: 4, repsPerStep: 2, failThreshold: 2 },
      rampEnabled: false,
      detect: { enabled: true, toleranceMs: 200, passThreshold: 0.65 },
    };
    const c = normalizePracticeMechanics(legacy);
    isValid(c);
    // Default OFF (D139 anti-regression law): a legacy user never
    // hears a letter-key note.
    expect(c.noteInput).toEqual({ enabled: false, rootOctave: 4 });
    // Siblings untouched by the widening.
    expect(c.detect).toEqual(legacy.detect);
    expect(c.mode).toBe("loop");
  });

  it("octave garbage -> clamped 3..4 (string/float/wild/negative all resolve)", () => {
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: "4" } }).noteInput.rootOctave).toBe(4);
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: 99 } }).noteInput.rootOctave).toBe(4);
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: 0 } }).noteInput.rootOctave).toBe(3);
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: 2 } }).noteInput.rootOctave).toBe(3); // legacy 2 clamps up at read, no migration
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: 5 } }).noteInput.rootOctave).toBe(4); // legacy 5 clamps down at read, no migration
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: 3.7 } }).noteInput.rootOctave).toBe(4); // non-int -> default
    expect(normalizePracticeMechanics({ noteInput: { rootOctave: null } }).noteInput.rootOctave).toBe(4);
    const hi = normalizePracticeMechanics({ noteInput: { enabled: true, rootOctave: 4 } });
    expect(hi.noteInput).toEqual({ enabled: true, rootOctave: 4 });
    const lo = normalizePracticeMechanics({ noteInput: { enabled: true, rootOctave: 3 } });
    expect(lo.noteInput).toEqual({ enabled: true, rootOctave: 3 });
  });

  it("enabled non-boolean -> false (strict === true law, mirrors detect)", () => {
    for (const raw of ["true", 1, {}, []]) {
      const c = normalizePracticeMechanics({ noteInput: { enabled: raw } });
      isValid(c);
      expect(c.noteInput.enabled).toBe(false);
    }
    // DEFAULT_MECHANICS shape + clone isolation.
    expect(DEFAULT_MECHANICS.noteInput).toEqual({ enabled: false, rootOctave: 4 });
    const c = normalizePracticeMechanics("garbage");
    c.noteInput.enabled = true;
    expect(DEFAULT_MECHANICS.noteInput.enabled).toBe(false); // constant never mutated
  });
});
