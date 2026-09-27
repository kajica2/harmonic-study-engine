/**
 * src/lib/backingEngine.test.ts - PRD-001 Phase 7 S2 (D128): the
 * rest-mute BUS GAIN law. setRestMuted(true) drives the drum/bass/
 * piano bus targets to 0; false restores the level; the flag COMPOSES
 * with the per-track mutes (gain = muted || rest ? 0 : level) exactly
 * like setLevels' mutes - and the metronome click bus is NOT in this
 * graph (REQ-PRAC-3 by topology, audit #6/D33).
 *
 * Seam: a minimal fake AudioContext installed on window before
 * init() - backingEngine.ts only ever reaches the ctx through
 * newAudioContext(), so the fake is enough to observe the emitted
 * setTargetAtTime targets (the same call the real buses receive).
 * start()/stop()/scheduleAhead are NOT exercised: the gate under test
 * is the gain recompute, not the scheduler.
 *
 * jsdom env via JSDOM_FILES (vitest.config.ts) - webAudio.ts reads
 * `window`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// No network in unit tests: the soundfont loader resolves to null
// (the shipped offline-fallback path). The gate under test is the bus
// gain recompute, not the sample players.
vi.mock("./soundfont", () => ({
  loadSoundfont: () => Promise.resolve(null),
  playSoundfontNote: () => {},
}));

// Import AFTER the mock is declared (vitest hoists vi.mock; the
// engine singleton's init() then runs against the fake ctx below).
import { backingEngine } from "./backingEngine";

type FakeGain = {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
};
type FakeNode = { connect: () => void; disconnect: () => void; gain?: FakeGain };

const createdGains: FakeGain[] = [];

function fakeGain() {
  const gain: FakeGain = {
    value: 0,
    setTargetAtTime: vi.fn((v: number) => {
      gain.value = v;
    }),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  createdGains.push(gain);
  return { connect: () => {}, disconnect: () => {}, gain };
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = { connect: () => {}, disconnect: () => {} };
  createGain() {
    return fakeGain();
  }
  createBiquadFilter() {
    return {
      connect: () => {},
      disconnect: () => {},
      type: "highpass",
      frequency: { value: 0 },
      Q: { value: 0 },
    };
  }
}

// Bus creation order inside init(): master, drum, bass, piano.
const MASTER = 0;
const DRUMS = 1;
const BASS = 2;
const PIANO = 3;

beforeEach(() => {
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: FakeAudioContext,
  });
  // The singleton keeps ctx + buses across tests in this file (init()
  // is idempotent) - createdGains is filled by the FIRST init only,
  // then stays valid. Start every pin from the un-rested, unmuted
  // state; the flag + levels are re-synced here.
  backingEngine.setRestMuted(false);
  backingEngine.init();
  backingEngine.setLevels({
    drums: 0.7,
    bass: 0.6,
    piano: 0.4,
    drumsMuted: false,
    bassMuted: false,
    pianoMuted: false,
  });
  expect(createdGains.length).toBeGreaterThanOrEqual(4);
});

describe("backingEngine.setRestMuted - bus gain law (D128)", () => {
  it("rest true -> all three bus targets 0", () => {
    backingEngine.setRestMuted(true);
    expect(createdGains[DRUMS].setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    expect(createdGains[BASS].setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    expect(createdGains[PIANO].setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
  });

  it("rest false + levels -> the level targets are restored", () => {
    backingEngine.setRestMuted(true);
    backingEngine.setRestMuted(false);
    expect(createdGains[DRUMS].value).toBeCloseTo(0.7);
    expect(createdGains[BASS].value).toBeCloseTo(0.6);
    expect(createdGains[PIANO].value).toBeCloseTo(0.4);
  });

  it("composes with per-track mutes: muted stays 0 after rest release", () => {
    backingEngine.setLevels({ bassMuted: true });
    backingEngine.setRestMuted(true);
    backingEngine.setRestMuted(false);
    expect(createdGains[BASS].value).toBe(0); // mute survives
    expect(createdGains[DRUMS].value).toBeCloseTo(0.7); // rest released
  });

  it("setLevels while resting keeps the rest gate (no unmute leak)", () => {
    backingEngine.setRestMuted(true);
    backingEngine.setLevels({ drums: 0.9 });
    expect(createdGains[DRUMS].value).toBe(0); // rest overrides level
    backingEngine.setRestMuted(false);
    expect(createdGains[DRUMS].value).toBeCloseTo(0.9);
  });

  it("the master bus target is never touched by the rest gate", () => {
    const masterCallsBefore = createdGains[MASTER].setTargetAtTime.mock.length;
    backingEngine.setRestMuted(true);
    backingEngine.setRestMuted(false);
    expect(createdGains[MASTER].setTargetAtTime.mock.length).toBe(
      masterCallsBefore,
    );
  });
});
