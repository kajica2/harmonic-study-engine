/**
 * src/lib/composePreview.test.ts - PRD-001 Phase 4 Slice 3 (test plan
 * 9). PURE SURFACES (D72): buffer-length math (ppq/tempo -> frames),
 * the 90s cap, tick->sec mapping through the REAL tempo functions, and
 * VOICE_RECIPES bounds - plus the GAP-2 play->play-while-active
 * singleton pin on a FAKE AudioContext (no render execution: jsdom/
 * node lack OfflineAudioContext - tests/setup.ts header, loopWav
 * precedent; the render path stays browser-pinned via the e2e state
 * machine + manual verification).
 */

import { describe, it, expect } from "vitest";
import {
  composePreviewPlayer,
  PREVIEW_CAP_SEC,
  PREVIEW_SAMPLE_RATE,
  PREVIEW_TAIL_SEC,
  previewFrameCount,
  previewFullSec,
  previewIsCapped,
  previewRenderSec,
} from "./composePreview";
import { VOICE_RECIPES, midiToFreq } from "./composeVoices";
import type { AccompanimentResult, NormalizedProject } from "../../engine/compose/types";

function project(ppq: number, bpm: number, endTick: number): NormalizedProject {
  return {
    version: 1,
    format: 1,
    ppq,
    name: "fx",
    fileName: "fx.mid",
    tempos: [{ tick: 0, bpm }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks: [],
    endTick,
    durationSec: 0,
    warnings: [],
  };
}

function resultWithEndTick(endTick: number): AccompanimentResult {
  return {
    version: 1,
    generated: { bass: [], chords: [], pad: [] },
    meta: {
      version: 1,
      styleId: "jazz",
      density: 3,
      seed: 1,
      roles: ["bass"],
      patternIds: { bass: "walking", chords: "freddieGreen", pad: "sustain" },
      voicingStyle: "drop2",
      swingRatioApplied: 0.64,
      gridDivisions: 2,
      registersUsed: { bass: [28, 48], chords: [48, 72], pad: [60, 84] },
      transpose: 0,
      noteCounts: { bass: 0, chords: 0, pad: 0 },
      rootlessCount: 0,
      quartalFallbackCount: 0,
      unknownQualityCount: 0,
      bars: 0,
      endTick,
      gridFingerprint: "x",
    },
    annotations: [],
  };
}

describe("tick -> seconds via the PROJECT tempo map (one truth, D46)", () => {
  it("120 BPM ppq 480: 480 ticks = 0.5s; 8 bars (15360 ticks) + tail", () => {
    const p = project(480, 120, 15360);
    expect(previewFullSec(p, 15360)).toBeCloseTo(15360 / 480 * 0.5 + PREVIEW_TAIL_SEC, 6);
    // 60 BPM halves the speed.
    const slow = project(480, 60, 15360);
    expect(previewFullSec(slow, 15360)).toBeCloseTo(previewFullSec(p, 15360) * 2 - PREVIEW_TAIL_SEC, 4);
  });

  it("odd ppq 96 at 100 BPM maps through ticksToSeconds (no hard-coded 480)", () => {
    const p = project(96, 100, 96 * 4 * 8); // 8 bars of 4/4
    const sec = previewFullSec(p, 96 * 32) - PREVIEW_TAIL_SEC;
    expect(sec).toBeCloseTo((32 * 60) / 100, 6); // 32 quarters at 100 BPM
  });
});

describe("90s cap + buffer-length math", () => {
  it("short grids render fully (+tail); long grids cap at 90s", () => {
    const short = project(480, 120, 9600); // 9600 ticks = 10s at 120bpm
    expect(previewRenderSec(short, 9600)).toBeCloseTo(10 + PREVIEW_TAIL_SEC, 6);
    expect(previewRenderSec(short, 9600)).toBeLessThan(PREVIEW_CAP_SEC);
    const long = project(480, 120, 480 * 60 * 10); // 10 minutes
    expect(previewRenderSec(long, 480 * 6000)).toBe(PREVIEW_CAP_SEC);
  });

  it("previewIsCapped flips exactly at the cap boundary", () => {
    // 120 BPM ppq 480: 1 second = 960 ticks.
    const p = project(480, 120, 0);
    const capped = resultWithEndTick(960 * 90); // 90s + 1s tail > cap
    const uncapped = resultWithEndTick(960 * 80); // 80s + 1s tail < cap
    expect(previewIsCapped(capped, p)).toBe(true);
    expect(previewIsCapped(uncapped, p)).toBe(false);
  });

  it("frame count: ceil(sec * sampleRate), never below 1", () => {
    expect(previewFrameCount(10, 44100)).toBe(441000);
    expect(previewFrameCount(0.0001, 44100)).toBe(5);
    expect(previewFrameCount(0, 44100)).toBe(1);
    expect(previewFrameCount(-5, 44100)).toBe(1);
    expect(previewFrameCount(PREVIEW_CAP_SEC)).toBe(Math.ceil(PREVIEW_CAP_SEC * PREVIEW_SAMPLE_RATE));
  });
});

describe("VOICE_RECIPES bounds (D72 seam table)", () => {
  it("every role ships a sane recipe (attack/decay/release > 0, levels in (0,1])", () => {
    for (const role of ["bass", "chords", "pad"] as const) {
      const r = VOICE_RECIPES[role];
      expect(r.attackSec).toBeGreaterThan(0);
      expect(r.decaySec).toBeGreaterThan(0);
      expect(r.releaseSec).toBeGreaterThan(0);
      expect(r.sustainLevel).toBeGreaterThan(0);
      expect(r.sustainLevel).toBeLessThanOrEqual(1);
      expect(r.peak).toBeGreaterThan(0);
      expect(r.peak).toBeLessThanOrEqual(1);
      expect([1, 2]).toContain(r.voices);
      expect(["sine", "triangle", "sawtooth"]).toContain(r.oscType);
    }
    // The D72 recipe identities: bass triangle fast decay, chords TWO
    // detuned sines pluck, pad filtered saw slow attack.
    expect(VOICE_RECIPES.bass.oscType).toBe("triangle");
    expect(VOICE_RECIPES.chords.oscType).toBe("sine");
    expect(VOICE_RECIPES.chords.voices).toBe(2);
    expect(VOICE_RECIPES.chords.detuneCents).toBeGreaterThan(0);
    expect(VOICE_RECIPES.pad.oscType).toBe("sawtooth");
    expect(VOICE_RECIPES.pad.filterHz).not.toBeNull();
    expect(VOICE_RECIPES.pad.attackSec).toBeGreaterThan(VOICE_RECIPES.chords.attackSec);
  });

  it("midiToFreq: A4 = 440, C4 = 261.63-ish, monotone", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
    expect(midiToFreq(70)).toBeGreaterThan(midiToFreq(69));
  });
});

describe("play -> play-while-active singleton (GAP-2)", () => {
  it("second play stops+disconnects the first source and reuses ONE AudioContext", () => {
    // FAKE AudioContext (jsdom/node have none - the real render path
    // stays browser-pinned). Proves the D72/StrictMode claim: re-play
    // while active never leaks a double-throwing source and never
    // builds a second context.
    class FakeSource {
      buffer: unknown = null;
      onended: (() => void) | null = null;
      stopCount = 0;
      disconnectCount = 0;
      startCount = 0;
      connect(): void {}
      disconnect(): void {
        this.disconnectCount++;
      }
      start(): void {
        this.startCount++;
      }
      stop(): void {
        this.stopCount++;
      }
    }
    const sources: FakeSource[] = [];
    class FakeAudioContext {
      static created = 0;
      destination = {};
      constructor() {
        FakeAudioContext.created++;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
      createBufferSource(): FakeSource {
        const s = new FakeSource();
        sources.push(s);
        return s;
      }
    }
    const g = globalThis as unknown as { AudioContext?: unknown };
    const prev = g.AudioContext;
    g.AudioContext = FakeAudioContext;
    try {
      const buf = { duration: 1 } as unknown as AudioBuffer;
      composePreviewPlayer.play(buf);
      expect(sources).toHaveLength(1);
      expect(composePreviewPlayer.getState()).toBe("playing");
      composePreviewPlayer.play(buf); // PLAY WHILE ACTIVE
      expect(sources).toHaveLength(2);
      expect(sources[0].stopCount).toBe(1); // first source STOPPED...
      expect(sources[0].disconnectCount).toBe(1); // ...and DISCONNECTED
      expect(sources[1].startCount).toBe(1); // second plays normally
      expect(sources[1].stopCount).toBe(0); // and is untouched
      expect(FakeAudioContext.created).toBe(1); // ONE context EVER
      expect(composePreviewPlayer.getState()).toBe("playing");
    } finally {
      composePreviewPlayer.stop(); // singleton hygiene: never leak state
      if (prev === undefined) delete g.AudioContext;
      else g.AudioContext = prev;
    }
    expect(composePreviewPlayer.getState()).toBe("idle");
  });
});
