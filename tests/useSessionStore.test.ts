/**
 * useSessionStore hydration — verifies the localStorage-migration
 * logic for every persisted field, with special attention to the
 * legacy `beatType` map that has shipped several migrations:
 *   - "jazz"   -> "swing"
 *   - "bossa"  -> "bossa"
 *   - "techno" -> "funk"
 *   - "none"   -> "off"
 *   - "metronome" -> "off"
 *
 * The hook is the source of truth for App.tsx's persistent state.
 * If hydration breaks, every reload silently resets user prefs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionStore } from "../src/hooks/useSessionStore";

describe("useSessionStore hydration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses defaults when localStorage is empty", () => {
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.tempo).toBe(60);
    expect(result.current.volume).toBe(50);
    expect(result.current.timeSignature).toBe("4/4");
    expect(result.current.beatType).toBe("off");
    expect(result.current.transposeShift).toBe(0);
    expect(result.current.voicingType).toBe("closed");
    expect(result.current.optimizeVoiceLeading).toBe(false);
    expect(result.current.isLooping).toBe(true); // default true
    expect(result.current.instrument).toBe("epiano");
    expect(result.current.arpRate).toBe(4);
    expect(result.current.arpGate).toBe(80);
    expect(result.current.arpOctaves).toBe(1);
    expect(result.current.arpType).toBe("none");
    expect(result.current.kbRange).toEqual({ from: 36, to: 72 });
  });

  it("hydrates tempo from localStorage when present", () => {
    localStorage.setItem("synesthesia_tempo", "132");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.tempo).toBe(132);
  });

  it("hydrates timeSignature from localStorage when present", () => {
    localStorage.setItem("synesthesia_timeSignature", '"7/8"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.timeSignature).toBe("7/8");
  });

  it("hydrates volume from localStorage when present", () => {
    localStorage.setItem("synesthesia_volume", "75");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.volume).toBe(75);
  });

  it("migrates legacy beatType 'jazz' -> 'swing'", () => {
    localStorage.setItem("synesthesia_beatType", '"jazz"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("swing");
  });

  it("migrates legacy beatType 'bossa' -> 'bossa'", () => {
    localStorage.setItem("synesthesia_beatType", '"bossa"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("bossa");
  });

  it("migrates legacy beatType 'techno' -> 'funk'", () => {
    localStorage.setItem("synesthesia_beatType", '"techno"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("funk");
  });

  it("migrates legacy beatType 'none' -> 'off'", () => {
    localStorage.setItem("synesthesia_beatType", '"none"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("off");
  });

  it("migrates legacy beatType 'metronome' -> 'off'", () => {
    // The metronome beat type was removed when BackingEngine took
    // over — now the metronome click lives in rhythm.ts only.
    localStorage.setItem("synesthesia_beatType", '"metronome"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("off");
  });

  it("passes through modern BackingStyle strings unchanged", () => {
    // After the migration, valid values are 11-style strings.
    // "swing", "bossa", "funk" pass through; anything not in the
    // legacy map falls back to "off".
    localStorage.setItem("synesthesia_beatType", '"swing"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("swing");
  });

  it("passes through unknown strings verbatim (forward-compat)", () => {
    // Forward compatibility: if a future build introduces a
    // BackingStyle that an old client doesn't know about, we
    // shouldn't crash OR silently reset to "off". Pass the unknown
    // string through — the BackingEngine will fall back at render
    // time if the value is truly invalid. Better to surface "you have
    // a stale BackingStyle" than to mask the issue.
    localStorage.setItem("synesthesia_beatType", '"definitely-future-mode"');
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.beatType).toBe("definitely-future-mode");
  });

  it("hydrates drum/bass/piano mutes from '1' string", () => {
    localStorage.setItem("synesthesia_drumsMuted", "1");
    localStorage.setItem("synesthesia_bassMuted", "0");
    localStorage.setItem("synesthesia_pianoMuted", "1");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.drumsMuted).toBe(true);
    expect(result.current.bassMuted).toBe(false);
    expect(result.current.pianoMuted).toBe(true);
  });

  it("hydrates loopStartBar and loopEndBar as nullable numbers", () => {
    localStorage.setItem("synesthesia_loopStartBar", "4");
    localStorage.setItem("synesthesia_loopEndBar", "12");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.loopStartBar).toBe(4);
    expect(result.current.loopEndBar).toBe(12);
  });

  it("loopStartBar/loopEndBar stay null when unset", () => {
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.loopStartBar).toBeNull();
    expect(result.current.loopEndBar).toBeNull();
  });

  it("hydrates isLooping from localStorage when present", () => {
    // Default is true (current behavior), but a saved 'false' must
    // round-trip correctly.
    localStorage.setItem("synesthesia_isLooping", "false");
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.isLooping).toBe(false);
  });

  it("hydrates kbRange JSON object", () => {
    localStorage.setItem(
      "synesthesia_kbRange",
      JSON.stringify({ from: 48, to: 84 }),
    );
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.kbRange).toEqual({ from: 48, to: 84 });
  });

  it("setters are functional-update compatible (Dispatch<SetStateAction>)", () => {
    const { result } = renderHook(() => useSessionStore());
    expect(result.current.tempo).toBe(60);
    act(() => {
      result.current.setTempo((t) => t + 5);
    });
    expect(result.current.tempo).toBe(65);
    act(() => {
      result.current.setTempo((t) => t * 2);
    });
    expect(result.current.tempo).toBe(130);
  });
});