/**
 * rhythmEngine metronome toggle — the user can mute the click
 * track via the UI. The flag is checked inside playStep; the
 * backing track is unaffected.
 *
 * These tests don't start the engine's interval (no audio playback);
 * they exercise the public setMetronomeEnabled / isMetronomeEnabled
 * surface plus the default value. The integration test ("the click
 * actually skips when disabled") is the AudioContext-driven loopWav
 * suite, not this file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RhythmEngine } from "../src/lib/rhythm";
import { audioEngine } from "../src/lib/audio";

describe("RhythmEngine metronome flag", () => {
  it("defaults to enabled", () => {
    const e = new RhythmEngine();
    expect(e.isMetronomeEnabled()).toBe(true);
  });

  it("setMetronomeEnabled(false) flips the flag", () => {
    const e = new RhythmEngine();
    e.setMetronomeEnabled(false);
    expect(e.isMetronomeEnabled()).toBe(false);
  });

  it("setMetronomeEnabled is idempotent", () => {
    const e = new RhythmEngine();
    e.setMetronomeEnabled(false);
    e.setMetronomeEnabled(false);
    expect(e.isMetronomeEnabled()).toBe(false);
    e.setMetronomeEnabled(true);
    e.setMetronomeEnabled(true);
    expect(e.isMetronomeEnabled()).toBe(true);
  });
});

describe("RhythmEngine playStep metronome gating", () => {
  // Regression: the practice-header "Click" toggle must actually mute
  // the click. playStep() is the only click source; when the engine's
  // metronomeEnabled flag is false it must not fire
  // audioEngine.playMetronomeClick. (The App wires metronomeOn ->
  // setMetronomeEnabled; this test pins the engine-side contract.)
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(audioEngine, "playMetronomeClick").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("fires the click on the downbeat when enabled", () => {
    const e = new RhythmEngine();
    e.setMetronomeEnabled(true);
    (e as unknown as { playStep: (step: number) => void }).playStep(0);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it("skips the click entirely when muted", () => {
    const e = new RhythmEngine();
    e.setMetronomeEnabled(false);
    (e as unknown as { playStep: (step: number) => void }).playStep(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips the click on subdivision steps when muted", () => {
    const e = new RhythmEngine();
    e.setMetronomeEnabled(false);
    (e as unknown as { playStep: (step: number) => void }).playStep(4);
    expect(spy).not.toHaveBeenCalled();
  });
});