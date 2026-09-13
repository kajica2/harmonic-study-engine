import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * useBassNotes — React hook that subscribes to BackingEngine's
 * real-time bass-note stream and returns the active MIDI set.
 *
 * The hook reads `backingEngine.getActiveBassMidis()` on mount and
 * subscribes via `backingEngine.onBassNotes(cb)`. The subscription
 * callback updates local state, which the consumer re-renders on.
 *
 * We mock the backingEngine module before importing the hook so the
 * hook's module-level capture lands on our stub. Tests below push
 * updates through the stub to verify the hook wires them through.
 */

interface StubEngine {
  getActiveBassMidis: () => number[];
  onBassNotes: (
    cb: (m: number[]) => void,
  ) => () => void;
  _subscribers: Array<(m: number[]) => void>;
}

function makeStub(initial: number[] = []): StubEngine {
  const subs: Array<(m: number[]) => void> = [];
  return {
    getActiveBassMidis: () => [...initial],
    onBassNotes: (cb) => {
      subs.push(cb);
      return () => {
        const i = subs.indexOf(cb);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    _subscribers: subs,
  };
}

let stub: StubEngine;

vi.mock("../src/lib/backingEngine", () => {
  // The stub is replaced per-test via `stub` reassignment. We expose
  // it through a getter so the mock module can return the latest
  // value when the hook captures the reference.
  let current: StubEngine = makeStub();
  return {
    get backingEngine() {
      return current;
    },
    __setStub: (s: StubEngine) => {
      current = s;
    },
  };
});

// Import after the mock so the hook sees the stub.
import { useBassNotes } from "../src/lib/useBassNotes";
import * as backingEngineMod from "../src/lib/backingEngine";

beforeEach(() => {
  stub = makeStub([40, 47]); // E2 + B2 — typical ii bass + V bass
  (backingEngineMod as unknown as { __setStub: (s: StubEngine) => void })
    .__setStub(stub);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBassNotes", () => {
  it("returns the engine's current bass midis on first render", () => {
    const { result } = renderHook(() => useBassNotes());
    expect(result.current).toEqual([40, 47]);
  });

  it("subscribes to engine bass-note events on mount", () => {
    renderHook(() => useBassNotes());
    expect(stub._subscribers.length).toBe(1);
  });

  it("unsubscribes when the hook unmounts", () => {
    const { unmount } = renderHook(() => useBassNotes());
    expect(stub._subscribers.length).toBe(1);
    unmount();
    expect(stub._subscribers.length).toBe(0);
  });

  it("updates state when the engine pushes a new chord", () => {
    const { result } = renderHook(() => useBassNotes());
    expect(result.current).toEqual([40, 47]);

    act(() => {
      // Engine pushes a new chord (e.g. ii-V-I resolution).
      stub._subscribers.forEach((cb) => cb([41, 48]));
    });
    expect(result.current).toEqual([41, 48]);
  });

  it("re-reads active midis on mount (covers engine-started-before-mount case)", () => {
    // New stub whose getActiveBassMidis returns a different value
    // than the initial snapshot — the hook picks up the fresh value
    // via the mount-time re-sync.
    stub = makeStub([60, 64]); // C4 + E4
    (backingEngineMod as unknown as { __setStub: (s: StubEngine) => void })
      .__setStub(stub);

    const { result } = renderHook(() => useBassNotes());
    expect(result.current).toEqual([60, 64]);
  });
});
