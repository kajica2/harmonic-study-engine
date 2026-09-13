import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFeedback } from "./useFeedback";
import { useSessionStore } from "./useSessionStore";

describe("useFeedback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records an accept event", () => {
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.accept("coltrane", "modal"));
    expect(result.current.history()).toHaveLength(1);
    expect(result.current.history()[0]).toEqual({
      personaId: "coltrane",
      suggestion: "modal",
      accepted: true,
    });
  });

  it("records a reject event", () => {
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.reject("bach", "common-practice"));
    expect(result.current.history()[0].accepted).toBe(false);
  });

  it("records multiple events in order", () => {
    const { result, rerender } = renderHook(() => useFeedback());
    act(() => {
      result.current.accept("coltrane", "modal");
      result.current.reject("bach", "common-practice");
      result.current.accept("miles", "modal");
    });
    rerender();
    const h = result.current.history();
    expect(h).toHaveLength(3);
    expect(h.map((e) => e.personaId)).toEqual(["coltrane", "bach", "miles"]);
    expect(h.map((e) => e.accepted)).toEqual([true, false, true]);
  });

  it("record appends to the same hook's history", () => {
    // useSessionStore returns a fresh state per hook instance (no global
    // store); we verify the hook's own append semantics by reading via
    // the rerender path.
    const { result, rerender } = renderHook(() => useFeedback());
    act(() => {
      result.current.accept("coltrane", "modal");
      result.current.accept("miles", "modal");
    });
    rerender();
    expect(result.current.history()).toHaveLength(2);
  });

  it("record({}) is the underlying primitive", () => {
    const { result } = renderHook(() => useFeedback());
    act(() =>
      result.current.record({
        personaId: "kandinsky",
        suggestion: "modal",
        accepted: false,
      }),
    );
    expect(result.current.history()[0].personaId).toBe("kandinsky");
  });
});
