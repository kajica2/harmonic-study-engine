/**
 * loopWav render tests — verify the schedule of the rendered WAV
 * via a fake OfflineAudioContext. Records every oscillator
 * start/stop and every gain ramp, then asserts on the schedule.
 *
 * The mock (in `tests/loopWav-mock.ts`) is a hand-rolled replacement
 * for the Web Audio API. We don't care about the rendered samples
 * — only that the schedule is correct. This is the right level of
 * testing for an audio renderer: "did the right things get
 * scheduled in the right order" rather than "do the samples
 * sound right."
 *
 * Coverage:
 *   - block mode schedules the chord's gain envelope with a
 *     sustain-level ramp that holds across the bar boundary
 *   - mono mode schedules exactly 1 oscillator per bar tuned to
 *     the chord's top note
 *   - arp mode schedules multiple oscillators per bar (the sweep)
 *
 * Note: a true regression test for the chord-sustain change in
 * commit aaa5be7 (durSec secPerBar * 0.9 -> secPerBar) would need
 * to compare the exact t=0.001 decay timestamp between versions.
 * The change in release-tail duration is subtle (0.2s) and not
 * what a typical user could hear; the tests below document the
 * current behavior rather than pin specific timestamps.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderPathToWav } from "../src/lib/loopWav";
import { installMockOfflineAudioContext } from "./loopWav-mock";
import { HarmonicPath } from "../src/lib/paths";

// ---------- fixtures ----------------------------------------------------

const TEST_PATH: HarmonicPath = {
  id: "test",
  title: "Test Progression",
  description: "loopWav render schedule test",
  steps: [
    { name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" },
    { name: "Fmaj7", notes: [60, 65, 67, 72], descriptions: "" },
    { name: "G7", notes: [59, 62, 65, 69], descriptions: "" },
    { name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" },
  ],
};

const SEC_PER_BAR = 2; // 120 BPM 4/4 = 0.5s/beat * 4

describe("renderPathToWav scheduling", () => {
  let handle: ReturnType<typeof installMockOfflineAudioContext>;

  beforeEach(() => {
    handle = installMockOfflineAudioContext();
  });
  afterEach(() => {
    handle.uninstall();
  });

  it("block mode: every chord's oscillator runs through the bar", async () => {
    await renderPathToWav(TEST_PATH, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "block",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    // The block path creates 1 osc per note + octave harmonics.
    // For each bar, verify all oscillators started in that bar
    // continue running until at least the bar boundary.
    for (let bar = 0; bar < 4; bar++) {
      const barStart = bar * SEC_PER_BAR;
      const barEnd = barStart + SEC_PER_BAR;
      const inBar = mock!.oscillators.filter(
        (o) =>
          o.startTime !== null &&
          o.startTime >= barStart &&
          o.startTime < barEnd,
      );
      expect(
        inBar.length,
        `bar ${bar} should have oscillators started in [${barStart}, ${barEnd})`,
      ).toBeGreaterThan(0);
      for (const osc of inBar) {
        expect(
          osc.stopTime,
          `bar ${bar} osc should stop at or after ${barEnd} (got ${osc.stopTime})`,
        ).toBeGreaterThanOrEqual(barEnd - 0.01);
      }
    }
  });

  it("block mode: gain envelope holds a sustain level across the bar boundary", async () => {
    await renderPathToWav(TEST_PATH, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "block",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    // The first chord's gain is the first one created. It has the
    // epiano ADSR: attack to ~0.35, ramp to sustainLevel (0.32) at
    // 0.6s, then ramp to 0.001 at startSec + durSec + release.
    // This test pins the contract: the sustain ramp is scheduled
    // and the gain value at t = bar boundary is > 0.1 (sustaining).
    const firstGain = mock!.gains[0];
    expect(firstGain).toBeDefined();
    const sustainEvent = firstGain!.gain.events.find(
      (e) => e.kind === "ramp" && e.value > 0.2 && e.value < 0.5,
    );
    expect(sustainEvent, "expected a sustain-level ramp event").toBeDefined();
    // Reconstruct the gain value at the bar boundary (t=2.0).
    const upToBar = firstGain!.gain.events.filter((e) => e.time <= 2.0);
    const lastBeforeBar = upToBar[upToBar.length - 1];
    expect(
      lastBeforeBar!.value,
      "gain at the bar boundary should still be sustaining (>0.1)",
    ).toBeGreaterThan(0.1);
  });

  it("mono mode: each bar schedules exactly one oscillator", async () => {
    await renderPathToWav(TEST_PATH, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    // Mono collapses each chord to its top voice — exactly 1 osc/bar.
    expect(mock!.oscillators.length).toBe(4);
    for (let bar = 0; bar < 4; bar++) {
      const barStart = bar * SEC_PER_BAR;
      const inBar = mock!.oscillators.filter(
        (o) =>
          o.startTime !== null &&
          o.startTime >= barStart &&
          o.startTime < barStart + SEC_PER_BAR,
      );
      expect(inBar.length, `bar ${bar} should have exactly 1 oscillator`).toBe(1);
    }
  });

  it("mono mode: each oscillator is tuned to the top note of its chord", async () => {
    // Top notes: Cmaj7=71, Fmaj7=72, G7=69, Cmaj7=71 (MIDI)
    const topByBar = [71, 72, 69, 71];
    await renderPathToWav(TEST_PATH, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    for (let bar = 0; bar < 4; bar++) {
      const barStart = bar * SEC_PER_BAR;
      const osc = mock!.oscillators.find(
        (o) =>
          o.startTime !== null &&
          o.startTime >= barStart &&
          o.startTime < barStart + SEC_PER_BAR,
      );
      expect(osc, `bar ${bar} should have one oscillator`).toBeDefined();
      // Verify the recorded frequency matches the top MIDI.
      const expectedFreq = 440 * Math.pow(2, (topByBar[bar]! - 69) / 12);
      expect(osc!.frequency.value).toBeCloseTo(expectedFreq, 1);
    }
  });

  it("arp mode: more than one oscillator per bar (the sweep + tail)", async () => {
    await renderPathToWav(TEST_PATH, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "arp",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    for (let bar = 0; bar < 4; bar++) {
      const barStart = bar * SEC_PER_BAR;
      const inBar = mock!.oscillators.filter(
        (o) =>
          o.startTime !== null &&
          o.startTime >= barStart &&
          o.startTime < barStart + SEC_PER_BAR,
      );
      expect(
        inBar.length,
        `arp bar ${bar} should have multiple oscillators`,
      ).toBeGreaterThan(1);
    }
  });
});