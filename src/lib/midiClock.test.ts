import { describe, it, expect } from "vitest";
import {
  MidiClockFollower,
  type MidiClockTransportKind,
} from "./midiClock";

/** Deterministic synthetic 24-PPQN clock: emits tick() every intervalMs. */
function drive(
  follower: MidiClockFollower,
  bpm: number,
  seconds: number,
  stepMs = 1,
): number[] {
  // 24 ticks per quarter at `bpm` -> tick period in ms.
  const quarterMs = 60000 / bpm;
  const tickMs = quarterMs / 24;
  const published: number[] = [];
  const off = follower.onBpm((b) => published.push(b));
  // Simulate wall clock: monotonic ms from 0, stepping every stepMs.
  let now = 0;
  let totalTicks = Math.round((seconds * 1000) / tickMs);
  while (totalTicks-- > 0) {
    now += tickMs; // deterministic interval (no jitter in this drive)
    follower.tick(now);
  }
  off();
  return published;
}

describe("MidiClockFollower", () => {
  it("reports null BPM until warmup settles", () => {
    const f = new MidiClockFollower({ warmupTicks: 6 });
    const bpm = f.snapshot().bpm;
    expect(bpm).toBeNull();
    expect(f.snapshot().isWarm).toBe(false);
  });

  it("settles on a stable 120 BPM clock", () => {
    const f = new MidiClockFollower();
    const published = drive(f, 120, 4);
    expect(published.length).toBeGreaterThan(0);
    const last = published[published.length - 1];
    expect(last).toBeGreaterThan(110);
    expect(last).toBeLessThan(130);
    expect(f.snapshot().isWarm).toBe(true);
    expect(f.snapshot().bpm).not.toBeNull();
  });

  it("rejects a glitchy start (first interval too large)", () => {
    const f = new MidiClockFollower({ warmupTicks: 2 });
    let now = 0;
    f.tick(now);
    now += 9000; // gap bigger than maxGapMs resets
    f.tick(now);
    expect(f.snapshot().bpm).toBeNull();
    expect(f.snapshot().isWarm).toBe(false);
  });

  it("publishes after a healthy warmup even if the first gap glitched", () => {
    const f = new MidiClockFollower({ warmupTicks: 2 });
    let now = 0;
    f.tick(now);
    now += 9000;
    const quarterMs = 500; // 120 BPM
    const tickMs = quarterMs / 24;
    for (let i = 0; i < 20; i += 1) {
      now += tickMs;
      f.tick(now);
    }
    expect(f.snapshot().bpm).not.toBeNull();
  });

  it("fires transport listeners on start/continue/stop", () => {
    const f = new MidiClockFollower();
    const seen: MidiClockTransportKind[] = [];
    const off = f.onTransport((t) => seen.push(t));
    f.start();
    f.continueTransport();
    f.stop();
    off();
    expect(seen).toEqual(["start", "continue", "stop"]);
  });

  it("reset() clears published state", () => {
    const f = new MidiClockFollower();
    const published = drive(f, 120, 4);
    expect(published.length).toBeGreaterThan(0);
    f.reset();
    expect(f.snapshot().bpm).toBeNull();
    expect(f.snapshot().isWarm).toBe(false);
  });
});
