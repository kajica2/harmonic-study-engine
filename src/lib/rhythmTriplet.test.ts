/**
 * src/lib/rhythmTriplet.test.ts - PRD-001 Phase 3 Slice 3 FIX ROUND
 * (TESTER MED): the triplet OFFSETS were unpinned. tests/rhythm.test.ts
 * is FROZEN as the T1 legacy-click canary, so the new pins live here
 * instead of being appended there.
 *
 * The triplet path in playStep (D34) fires the beat-boundary click on
 * the grid and schedules the two off-grid partners in WebAudio time
 * via audioEngine.scheduleMetronomeClick at secPerBeat/3 and
 * 2*secPerBeat/3, where secPerBeat is the METER-CORRECT beat
 * ((60000/tempo/1000) * stepsPerBeatFor(ts)/4). This file pins:
 *   1. the exact delay values on a 4/4 beat boundary,
 *   2. the compound-meter scaling (6/8 eighth beat),
 *   3. no scheduling on off-beat steps,
 *   4. NO scheduler use at all for non-triplet subdivisions.
 *
 * Node project (src/lib): playStep is driven directly (no interval,
 * no AudioContext) through the same private-access cast the frozen
 * file uses.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { RhythmEngine } from "./rhythm";
import { audioEngine } from "./audio";
import type { MetronomeSubdivision } from "./metronomePatterns";
import type { TimeSignature } from "./rhythm";

const TEMPO = 120; // quarter = 500 ms -> 4/4 secPerBeat 0.5 s, 6/8 0.25 s

function engineWith(subdivision: MetronomeSubdivision, ts: TimeSignature) {
  const e = new RhythmEngine();
  e.setTempo(TEMPO);
  e.setTimeSignature(ts);
  e.setMetronomePattern(subdivision, [0]);
  return e;
}

function playStep(e: RhythmEngine, step: number) {
  (e as unknown as { playStep: (step: number) => void }).playStep(step);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triplet scheduling offsets (D34, fix-round pin)", () => {
  it("4/4 beat boundary schedules the two partners at 1/3 and 2/3 of the beat", () => {
    const click = vi
      .spyOn(audioEngine, "playMetronomeClick")
      .mockImplementation(() => {});
    const sched = vi
      .spyOn(audioEngine, "scheduleMetronomeClick")
      .mockImplementation(() => {});
    playStep(engineWith(3, "4/4"), 0);
    const secPerBeat = (60000 / TEMPO / 1000) * (4 / 4); // 0.5 - quarter beat
    expect(click).toHaveBeenCalledTimes(1); // on-grid boundary click
    expect(sched).toHaveBeenCalledTimes(2); // exactly the two partners
    expect(sched).toHaveBeenNthCalledWith(1, false, secPerBeat / 3);
    expect(sched).toHaveBeenNthCalledWith(2, false, (2 * secPerBeat) / 3);
  });

  it("6/8 scales the offsets to the EIGHTH-note beat (stepsPerBeatFor)", () => {
    const click = vi
      .spyOn(audioEngine, "playMetronomeClick")
      .mockImplementation(() => {});
    const sched = vi
      .spyOn(audioEngine, "scheduleMetronomeClick")
      .mockImplementation(() => {});
    const e = engineWith(3, "6/8");
    playStep(e, 2); // step 2 = beat 1 boundary (2 sixteenth steps/beat)
    const secPerBeat = (60000 / TEMPO / 1000) * (2 / 4); // 0.25 - eighth beat
    expect(click).toHaveBeenCalledTimes(1);
    expect(sched).toHaveBeenCalledTimes(2);
    expect(sched).toHaveBeenNthCalledWith(1, false, secPerBeat / 3);
    expect(sched).toHaveBeenNthCalledWith(2, false, (2 * secPerBeat) / 3);
  });

  it("off-beat steps never schedule and never click (triplet rides boundaries only)", () => {
    const click = vi
      .spyOn(audioEngine, "playMetronomeClick")
      .mockImplementation(() => {});
    const sched = vi
      .spyOn(audioEngine, "scheduleMetronomeClick")
      .mockImplementation(() => {});
    const e = engineWith(3, "4/4");
    playStep(e, 1); // mid-beat 16th - NOT a beat boundary
    playStep(e, 2);
    playStep(e, 3);
    expect(sched).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("non-triplet subdivisions NEVER touch the scheduler", () => {
    const click = vi
      .spyOn(audioEngine, "playMetronomeClick")
      .mockImplementation(() => {});
    const sched = vi
      .spyOn(audioEngine, "scheduleMetronomeClick")
      .mockImplementation(() => {});
    for (const s of [1, 2, 4] as const) {
      const e = engineWith(s, "4/4");
      playStep(e, 0); // beat boundary DOES click (1: legacy)
      expect(click).toHaveBeenCalledTimes(1);
      expect(sched).not.toHaveBeenCalled();
      click.mockClear();
    }
  });
});
