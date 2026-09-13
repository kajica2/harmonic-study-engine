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

import { describe, it, expect } from "vitest";
import { RhythmEngine } from "../src/lib/rhythm";

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