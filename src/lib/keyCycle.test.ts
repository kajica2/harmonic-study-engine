/**
 * src/lib/keyCycle.test.ts - PRD-001 Phase 2 (D13) decision pins.
 *
 * Star Eyes shape: a 32-step form padded x3 to 96 steps, so the
 * cycle must advance exactly when playback lands on 32, 64, and the
 * wrap 95 -> 0.
 */

import { describe, it, expect } from "vitest";
import { shouldAdvanceKeyCycle } from "./keyCycle";

const ACTIVE = { cycleActive: true, subLoopActive: false } as const;

describe("shouldAdvanceKeyCycle - form-boundary advances (formLen=32, steps=96)", () => {
  it("advances at 31 -> 32, 63 -> 64, and the wrap 95 -> 0", () => {
    for (const nextStepIndex of [32, 64, 0]) {
      expect(
        shouldAdvanceKeyCycle({
          nextStepIndex,
          formLen: 32,
          totalSteps: 96,
          ...ACTIVE,
        }),
      ).toBe(true);
    }
  });

  it("never advances off the form boundary", () => {
    for (const nextStepIndex of [1, 16, 31, 33, 63, 65, 95]) {
      expect(
        shouldAdvanceKeyCycle({
          nextStepIndex,
          formLen: 32,
          totalSteps: 96,
          ...ACTIVE,
        }),
      ).toBe(false);
    }
  });
});

describe("shouldAdvanceKeyCycle - suppression rules", () => {
  it("sub-range loop active -> never, even on a form boundary", () => {
    for (const nextStepIndex of [0, 32, 64]) {
      expect(
        shouldAdvanceKeyCycle({
          nextStepIndex,
          formLen: 32,
          totalSteps: 96,
          cycleActive: true,
          subLoopActive: true,
        }),
      ).toBe(false);
    }
  });

  it("cycle inactive -> never", () => {
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 32,
        formLen: 32,
        totalSteps: 96,
        cycleActive: false,
        subLoopActive: false,
      }),
    ).toBe(false);
  });

  it("formLen == steps -> advance only at the wrap", () => {
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 0,
        formLen: 96,
        totalSteps: 96,
        ...ACTIVE,
      }),
    ).toBe(true);
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 32,
        formLen: 96,
        totalSteps: 96,
        ...ACTIVE,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 95,
        formLen: 96,
        totalSteps: 96,
        ...ACTIVE,
      }),
    ).toBe(false);
  });

  it("degenerate inputs -> never (empty path / zero form / bad index)", () => {
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 0,
        formLen: 0,
        totalSteps: 0,
        ...ACTIVE,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: -1,
        formLen: 32,
        totalSteps: 96,
        ...ACTIVE,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceKeyCycle({
        nextStepIndex: 32,
        formLen: 32,
        totalSteps: 0,
        ...ACTIVE,
      }),
    ).toBe(false);
  });
});
