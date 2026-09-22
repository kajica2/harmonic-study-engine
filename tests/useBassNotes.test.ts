import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * useBassNotes - React hook that subscribes to BackingEngine's
 * real-time bass-note stream and returns the active MIDI set, now
 * merged with live MIDI bass notes from the player's device on a
 * dedicated "bass channel" (default 2). See
 * docs/midiChannelSplit-feature.md.
 *
 * The hook reads `backingEngine.getActiveBassMidis()` on mount and
 * subscribes via `backingEngine.onBassNotes(cb)`. It ALSO subscribes
 * to `midiOut.onNoteOn` / `onNoteOff`, filters by the configured bass
 * channel, and merges the union of both streams into local state.
 *
 * We mock both backingEngine and midiOut before importing the hook
 * so the hook's module-level captures land on our stubs.
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

interface StubMidiOut {
  onNoteOn: (
    cb: (m: number, v: number, ch: number) => void,
  ) => () => void;
  onNoteOff: (
    cb: (m: number, ch: number) => void,
  ) => () => void;
  _onSubs: Array<(m: number, v: number, ch: number) => void>;
  _offSubs: Array<(m: number, ch: number) => void>;
}

function makeMidiOutStub(): StubMidiOut {
  const onSubs: Array<(m: number, v: number, ch: number) => void> = [];
  const offSubs: Array<(m: number, ch: number) => void> = [];
  return {
    onNoteOn: (cb) => {
      onSubs.push(cb);
      return () => {
        const i = onSubs.indexOf(cb);
        if (i >= 0) onSubs.splice(i, 1);
      };
    },
    onNoteOff: (cb) => {
      offSubs.push(cb);
      return () => {
        const i = offSubs.indexOf(cb);
        if (i >= 0) offSubs.splice(i, 1);
      };
    },
    _onSubs: onSubs,
    _offSubs: offSubs,
  };
}

let stub: StubEngine;
let midiStub: StubMidiOut;

vi.mock("../src/lib/backingEngine", () => {
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

vi.mock("../src/lib/midiOut", () => {
  let current: StubMidiOut = makeMidiOutStub();
  return {
    get midiOut() {
      return current;
    },
    __setMidiStub: (s: StubMidiOut) => {
      current = s;
    },
  };
});

// Import after the mocks so the hook sees them.
import { useBassNotes } from "../src/lib/useBassNotes";
import * as backingEngineMod from "../src/lib/backingEngine";
import * as midiOutMod from "../src/lib/midiOut";

beforeEach(() => {
  stub = makeStub([40, 47]); // E2 + B2 - typical ii bass + V bass
  (backingEngineMod as unknown as { __setStub: (s: StubEngine) => void })
    .__setStub(stub);
  midiStub = makeMidiOutStub();
  (midiOutMod as unknown as { __setMidiStub: (s: StubMidiOut) => void })
    .__setMidiStub(midiStub);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBassNotes", () => {
  it("returns the engine's current bass midis on first render", () => {
    const { result } = renderHook(() => useBassNotes(2));
    expect(result.current).toEqual([40, 47]);
  });

  it("subscribes to engine bass-note events on mount", () => {
    renderHook(() => useBassNotes(2));
    expect(stub._subscribers.length).toBe(1);
  });

  it("unsubscribes when the hook unmounts", () => {
    const { unmount } = renderHook(() => useBassNotes(2));
    expect(stub._subscribers.length).toBe(1);
    unmount();
    expect(stub._subscribers.length).toBe(0);
  });

  it("updates state when the engine pushes a new chord", () => {
    const { result } = renderHook(() => useBassNotes(2));
    expect(result.current).toEqual([40, 47]);

    act(() => {
      // Engine pushes a new chord (e.g. ii-V-I resolution).
      stub._subscribers.forEach((cb) => cb([41, 48]));
    });
    expect(result.current).toEqual([41, 48]);
  });

  it("re-reads active midis on mount (covers engine-started-before-mount case)", () => {
    // New stub whose getActiveBassMidis returns a different value
    // than the initial snapshot - the hook picks up the fresh value
    // via the mount-time re-sync.
    stub = makeStub([60, 64]); // C4 + E4
    (backingEngineMod as unknown as { __setStub: (s: StubEngine) => void })
      .__setStub(stub);

    const { result } = renderHook(() => useBassNotes(2));
    expect(result.current).toEqual([60, 64]);
  });

  // --- channel-split additions (docs/midiChannelSplit-feature.md) ---

  it("subscribes to midiOut on mount to capture bass-channel note-ons", () => {
    renderHook(() => useBassNotes(2));
    expect(midiStub._onSubs.length).toBe(1);
    expect(midiStub._offSubs.length).toBe(1);
  });

  it("merges incoming bass-channel note-ons into the returned set", () => {
    const { result } = renderHook(() => useBassNotes(2));
    expect(result.current).toEqual([40, 47]);

    // ch2 note-on: live bass note should join the set.
    act(() => {
      midiStub._onSubs.forEach((cb) => cb(36, 96, 2));
    });
    expect(result.current).toEqual(expect.arrayContaining([40, 47, 36]));

    // Engine pushes a fresh chord: live note still present in union.
    act(() => {
      stub._subscribers.forEach((cb) => cb([41]));
    });
    expect(result.current).toEqual(expect.arrayContaining([41, 36]));
  });

  it("ignores note-ons on non-bass channels", () => {
    const { result } = renderHook(() => useBassNotes(2));
    expect(result.current).toEqual([40, 47]);

    // ch1 (guide tone / upper) must NOT be treated as bass.
    act(() => {
      midiStub._onSubs.forEach((cb) => cb(63, 96, 1));
      midiStub._onSubs.forEach((cb) => cb(70, 96, 1));
    });
    expect(result.current).toEqual([40, 47]);
  });

  it("respects a different bass channel (e.g. ch10)", () => {
    const { result } = renderHook(() => useBassNotes(10));
    expect(result.current).toEqual([40, 47]);

    act(() => {
      midiStub._onSubs.forEach((cb) => cb(36, 96, 2)); // ch2 - ignored
    });
    expect(result.current).toEqual([40, 47]);

    act(() => {
      midiStub._onSubs.forEach((cb) => cb(36, 96, 10)); // ch10 - live bass
    });
    expect(result.current).toEqual(expect.arrayContaining([40, 47, 36]));
  });

  it("removes live bass notes on note-off", () => {
    const { result } = renderHook(() => useBassNotes(2));
    act(() => {
      midiStub._onSubs.forEach((cb) => cb(36, 96, 2));
    });
    expect(result.current).toEqual(expect.arrayContaining([36]));

    act(() => {
      midiStub._offSubs.forEach((cb) => cb(36, 2));
    });
    expect(result.current).not.toEqual(expect.arrayContaining([36]));
    expect(result.current).toEqual([40, 47]);
  });

  it("ignores note-offs on non-bass channels", () => {
    const { result } = renderHook(() => useBassNotes(2));
    // ch1 note-off must NOT remove anything (it was never there).
    act(() => {
      midiStub._offSubs.forEach((cb) => cb(36, 1));
    });
    expect(result.current).toEqual([40, 47]);
  });

  it("unsubscribes from midiOut when the hook unmounts", () => {
    const { unmount } = renderHook(() => useBassNotes(2));
    expect(midiStub._onSubs.length).toBe(1);
    expect(midiStub._offSubs.length).toBe(1);
    unmount();
    expect(midiStub._onSubs.length).toBe(0);
    expect(midiStub._offSubs.length).toBe(0);
  });
});
