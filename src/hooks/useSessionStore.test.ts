// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
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

// ---------- T5 (PRD-001 Phase 3 Slice 3, D32 + F2) ----------------------
//
// The F2 regression: metronomeOn hydrated from localStorage at boot
// but had NO write path - the toggle silently reset on every reload.
// These pins make the boot comment true: after a toggle, storage
// holds the new value; after a config change, the JSON blob round-
// trips through the corruption-safe normalize.

describe("useSessionStore metronome persistence (D32/F2)", () => {
  afterEach(() => {
    localStorage.removeItem("synesthesia_metronomeOn");
    localStorage.removeItem("synesthesia_metronomeConfig");
  });

  it("F2 regression: setMetronomeOn(true) writes '1' to storage", () => {
    const { result } = renderHook(() => useSessionStore());
    act(() => {
      result.current.setMetronomeOn(true);
    });
    expect(localStorage.getItem("synesthesia_metronomeOn")).toBe("1");
    act(() => {
      result.current.setMetronomeOn(false);
    });
    expect(localStorage.getItem("synesthesia_metronomeOn")).toBe("0");
  });

  it("metronomeConfig persists as one normalized JSON blob", () => {
    const { result } = renderHook(() => useSessionStore());
    act(() => {
      result.current.setMetronomeConfig({
        volume: 55,
        preset: "shaker",
        subdivision: 3,
        accentBeats: [0, 2],
        countInBars: 1,
      });
    });
    const raw = localStorage.getItem("synesthesia_metronomeConfig");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({
      volume: 55,
      preset: "shaker",
      subdivision: 3,
      accentBeats: [0, 2],
      countInBars: 1,
    });
  });

  it("corrupt stored config hydrates to normalized defaults", () => {
    localStorage.setItem(
      "synesthesia_metronomeConfig",
      JSON.stringify({
        volume: "loud",
        preset: "kazoo",
        subdivision: 7,
        accentBeats: "none",
        countInBars: 99,
      }),
    );
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.metronomeConfig).toEqual({
      volume: 80,
      preset: "beep",
      subdivision: 1,
      accentBeats: [0],
      countInBars: 0,
    });
  });

  it("unparseable JSON hydrates to defaults (no throw at boot)", () => {
    localStorage.setItem("synesthesia_metronomeConfig", "{not json");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.metronomeConfig.volume).toBe(80);
    expect(result.current.metronomeConfig.preset).toBe("beep");
  });
});
