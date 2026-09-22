import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuideToneTrail } from "./useGuideToneTrail";
import { midiOut } from "../lib/midiOut";

// Cm7 in root position: 3rd (Eb/63) + 7th (Bb/70) are guide tones.
const CM7 = [60, 63, 67, 70];

function emitNoteOn(midi: number): void {
  const holders = (
    midiOut as unknown as {
      inputListeners: {
        onNoteOn: Array<(midi: number, velocity: number) => void>;
      };
    }
  ).inputListeners.onNoteOn.slice();
  for (const cb of holders) cb(midi, 100);
}

describe("useGuideToneTrail hardening", () => {
  it("begin() twice does not clear the in-progress tally", () => {
    const { result, unmount } = renderHook(() => useGuideToneTrail(CM7));
    act(() => result.current.begin());
    act(() => emitNoteOn(63));
    expect(result.current.tally.totalNotes).toBe(1);
    act(() => result.current.begin());
    expect(result.current.tally.totalNotes).toBe(1);
    expect(result.current.tally.guideHits).toBe(1);
    unmount();
  });

  it("end() then begin() starts from a cleared tally", () => {
    const { result, unmount } = renderHook(() => useGuideToneTrail(CM7));
    act(() => result.current.begin());
    act(() => emitNoteOn(63));
    let ended: unknown;
    act(() => {
      ended = result.current.end();
    });
    expect(ended).not.toBeNull();
    act(() => result.current.begin());
    expect(result.current.tally.totalNotes).toBe(0);
    expect(result.current.tally.guideHits).toBe(0);
    unmount();
  });

  it("reset() clears the tally but preserves the active run", () => {
    const { result, unmount } = renderHook(() => useGuideToneTrail(CM7));
    act(() => result.current.begin());
    act(() => emitNoteOn(63));
    expect(result.current.tally.totalNotes).toBe(1);
    act(() => result.current.reset());
    expect(result.current.tally.totalNotes).toBe(0);
    // Still active: later notes keep counting without a new begin().
    act(() => emitNoteOn(70));
    expect(result.current.tally.totalNotes).toBe(1);
    expect(result.current.tally.guideHits).toBe(1);
    let ended: unknown;
    act(() => {
      ended = result.current.end();
    });
    expect(ended).not.toBeNull();
    unmount();
  });
});
