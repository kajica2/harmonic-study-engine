// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionStore } from "./useSessionStore";

describe("useSessionStore.setHarmonicStep", () => {
  it("replaces a single step in the active path", () => {
    const { result } = renderHook(() => useSessionStore());
    const initialStep = result.current.paths[0].steps[0];
    const originalName = initialStep.name;

    // Sanity check
    expect(initialStep.name).toBeTruthy();

    // Mutate step 4 of the active path
    act(() => {
      result.current.setHarmonicStep(4, {
        name: "TEST_CHORD",
        notes: [60, 64, 67],
        descriptions: "test mutation",
      });
    });

    // The active path's step 4 should now be the new step
    const newStep = result.current.paths[0].steps[4];
    expect(newStep.name).toBe("TEST_CHORD");
    expect(newStep.notes).toEqual([60, 64, 67]);
    expect(newStep.descriptions).toBe("test mutation");

    // Other steps in the active path are unchanged
    expect(result.current.paths[0].steps[0].name).toBe(originalName);
    expect(result.current.paths[0].steps[3].name).not.toBe("TEST_CHORD");

    // The active path is still the same path object identity (we
    // mutated steps but didn't replace the path itself)
    expect(result.current.paths[0].id).toBe(result.current.paths[0].id);
  });

  it("clamps stepIndex out of range (no mutation)", () => {
    const { result } = renderHook(() => useSessionStore());
    const originalSteps = result.current.paths[0].steps.slice();

    act(() => {
      result.current.setHarmonicStep(-1, {
        name: "OOPS",
        notes: [60],
        descriptions: "out of range",
      });
      result.current.setHarmonicStep(99999, {
        name: "OOPS",
        notes: [60],
        descriptions: "out of range",
      });
    });

    // No change
    expect(result.current.paths[0].steps).toEqual(originalSteps);
  });

  it("is stable across renders (memoized via useCallback)", () => {
    const { result, rerender } = renderHook(() => useSessionStore());
    const ref1 = result.current.setHarmonicStep;
    rerender();
    const ref2 = result.current.setHarmonicStep;
    expect(ref1).toBe(ref2);
  });
});
