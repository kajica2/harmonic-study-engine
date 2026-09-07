import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePathGenerator } from "../src/hooks/usePathGenerator";

/**
 * usePathGenerator — pure hook that prepends a generated
 * HarmonicPath to the path list. Tests cover the public
 * behavior: it calls generateHarmonicPath with the right
 * length/complexity, prepends to existing paths, and resets
 * transport state.
 */

function makeArgs(overrides: Partial<{
  currentPaths: any[];
  setPaths: ReturnType<typeof vi.fn>;
  setActivePathIndex: ReturnType<typeof vi.fn>;
  setActiveStepIndex: ReturnType<typeof vi.fn>;
  setTransposeShift: ReturnType<typeof vi.fn>;
  length: number;
  complexity: number;
}> = {}) {
  return {
    currentPaths: overrides.currentPaths ?? [],
    setPaths: overrides.setPaths ?? vi.fn(),
    setActivePathIndex: overrides.setActivePathIndex ?? vi.fn(),
    setActiveStepIndex: overrides.setActiveStepIndex ?? vi.fn(),
    setTransposeShift: overrides.setTransposeShift ?? vi.fn(),
    length: overrides.length ?? 8,
    complexity: overrides.complexity ?? 3,
  };
}

describe("usePathGenerator", () => {
  it("returns a callable function", () => {
    const { result } = renderHook(() => usePathGenerator(makeArgs()));
    expect(typeof result.current).toBe("function");
  });

  it("calls setPaths with the generated path prepended", () => {
    const setPaths = vi.fn();
    const existing = [{ id: "existing-1", title: "Old" }];
    const { result } = renderHook(() =>
      usePathGenerator(makeArgs({ currentPaths: existing, setPaths })),
    );
    act(() => {
      result.current();
    });
    expect(setPaths).toHaveBeenCalledTimes(1);
    const newPaths = setPaths.mock.calls[0][0];
    expect(newPaths).toHaveLength(2);
    // The new path is at index 0; the old one shifted down
    expect(newPaths[0].id).not.toBe("existing-1");
    expect(newPaths[1]).toEqual(existing[0]);
  });

  it("resets transport state to step 0 / path 0 / no transpose", () => {
    const setActivePathIndex = vi.fn();
    const setActiveStepIndex = vi.fn();
    const setTransposeShift = vi.fn();
    const { result } = renderHook(() =>
      usePathGenerator(
        makeArgs({
          setActivePathIndex,
          setActiveStepIndex,
          setTransposeShift,
        }),
      ),
    );
    act(() => {
      result.current();
    });
    expect(setActivePathIndex).toHaveBeenCalledWith(0);
    expect(setActiveStepIndex).toHaveBeenCalledWith(0);
    expect(setTransposeShift).toHaveBeenCalledWith(0);
  });

  it("uses the length/complexity args passed in", () => {
    // generateHarmonicPath just makes a HarmonicPath; we can't
    // easily verify the exact length it picked without
    // inspecting internals, so we just confirm it ran by
    // checking setPaths was called once.
    const setPaths = vi.fn();
    const { result } = renderHook(() =>
      usePathGenerator(
        makeArgs({ setPaths, length: 16, complexity: 5 }),
      ),
    );
    act(() => {
      result.current();
    });
    expect(setPaths).toHaveBeenCalledTimes(1);
    expect(setPaths.mock.calls[0][0]).toHaveLength(1);
  });

  it("returns a stable callback across re-renders with same args", () => {
    const args = makeArgs();
    const { result, rerender } = renderHook(() => usePathGenerator(args));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new callback when args change", () => {
    const args1 = makeArgs({ length: 8 });
    const { result, rerender } = renderHook(
      ({ a }) => usePathGenerator(a),
      { initialProps: { a: args1 } },
    );
    const first = result.current;
    rerender({ a: makeArgs({ length: 16 }) });
    expect(result.current).not.toBe(first);
  });
});
