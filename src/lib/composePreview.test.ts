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

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 4 (D77/D78, test plan 7): the MIXER pure surfaces.
// EVERYTHING ABOVE IS BYTE-IDENTICAL TO S3 - the absorb must not perturb
// the mutation-proven pins (the two blocks below are additive).
// ---------------------------------------------------------------------------

import { computeGroupGains, mapOriginalTracks } from "./composePreview";
import { MIXER_DEFAULTS } from "../../engine/compose/types";
import type { MixerState, NormalizedTrack, TrackRoleAssignment } from "../../engine/compose/types";

function track(
  index: number,
  over: Partial<NormalizedTrack> = {},
): NormalizedTrack {
  return {
    index,
    name: `t${index}`,
    channel: index,
    program: 0,
    isPercussion: false,
    notes: [
      { midi: 60, tick: 480, durationTicks: 120, velocity: 0.8 },
      { midi: 62, tick: 0, durationTicks: 120, velocity: 0.7 },
    ],
    endTick: 600,
    usesPitchBend: false,
    ...over,
  };
}

function mixerWith(over: Partial<Record<string, { level?: number; muted?: boolean; solo?: boolean }>>): MixerState {
  const base = { ...MIXER_DEFAULTS } as Record<string, { level: number; muted: boolean; solo: boolean }>;
  for (const [g, v] of Object.entries(over)) {
    base[g] = { ...base[g], ...v };
  }
  return base as unknown as MixerState;
}

describe("mapOriginalTracks (D78 role->voice table)", () => {
  const roles = (over: Partial<Record<number, TrackRoleAssignment>> = {}): TrackRoleAssignment[] => {
    const list: TrackRoleAssignment[] = [];
    for (const [idx, r] of Object.entries(over)) {
      list.push({ trackIndex: Number(idx), role: r.role, confidence: r.confidence });
    }
    return list;
  };

  it("melody -> lead, bass -> bass, harmony -> chords, unknown -> chords @ 0.7x peak", () => {
    const p = project(480, 120, 1000);
    const cases: [TrackRoleAssignment["role"], string][] = [
      ["melody", "lead"],
      ["bass", "bass"],
      ["harmony", "chords"],
      ["unknown", "chords"],
    ];
    for (const [role, voice] of cases) {
      const p1 = { ...p, tracks: [track(0)] };
      const out = mapOriginalTracks(p1, roles({ 0: { trackIndex: 0, role, confidence: 1 } }));
      expect(out).toHaveLength(2);
      expect(out[0].voice).toBe(voice);
    }
  });

  it("unknown-role velocity is scaled to 0.7x; every other role passes through", () => {
    const p = { ...project(480, 120, 1000), tracks: [track(0)] };
    // track(0) notes: tick 0 vel 0.7, tick 480 vel 0.8 -> sorted [0, 480].
    const unknown = mapOriginalTracks(p, roles({ 0: { trackIndex: 0, role: "unknown", confidence: 0 } }));
    expect(unknown[0].velocity).toBeCloseTo(0.7 * 0.7, 9); // 0.7x peak scale
    const melody = mapOriginalTracks(p, roles({ 0: { trackIndex: 0, role: "melody", confidence: 1 } }));
    expect(melody[1].velocity).toBe(0.8); // unscaled
  });

  it("PERCUSSION tracks are SKIPPED (isPercussion OR a percussion role)", () => {
    const p = { ...project(480, 120, 1000), tracks: [track(1, { isPercussion: true }), track(2)] };
    const out = mapOriginalTracks(p, roles({ 1: { trackIndex: 1, role: "percussion", confidence: 1 } }));
    expect(out).toHaveLength(2); // only track 2 (unknown role default)
  });

  it("empty-note tracks contribute nothing; output is SORTED by tick", () => {
    const p = {
      ...project(480, 120, 1000),
      tracks: [track(0, { notes: [] }), track(1), track(2, { notes: [{ midi: 40, tick: 10, durationTicks: 5, velocity: 0.5 }] })],
    };
    const out = mapOriginalTracks(p, []);
    const ticks = out.map((n) => n.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(out).toHaveLength(3);
  });

  it("chart sessions: tracks [] -> [] (the D78 empty-original group)", () => {
    expect(mapOriginalTracks(project(480, 120, 0), [])).toEqual([]);
  });
});

describe("computeGroupGains FULL TABLE (D77 - mute/solo/level x hasOriginal)", () => {
  it("defaults: levels pass through, pad at 0.8, original audible", () => {
    const g = computeGroupGains(MIXER_DEFAULTS, true);
    expect(g).toEqual({ original: 1, bass: 1, chords: 1, pad: 0.8 });
  });

  it("hasOriginal=false FORCES original 0 even at full level (D78/D84)", () => {
    const m = mixerWith({ original: { level: 1, muted: false, solo: true } });
    expect(computeGroupGains(m, false).original).toBe(0);
    expect(computeGroupGains(m, true).original).toBe(1);
  });

  it("mute zeroes ONLY its own group", () => {
    const m = mixerWith({ bass: { muted: true } });
    const g = computeGroupGains(m, true);
    expect(g.bass).toBe(0);
    expect(g.chords).toBe(1);
    expect(g.pad).toBe(0.8);
    expect(g.original).toBe(1);
  });

  it("solo dims ALL non-solos to 0 regardless of level/mute state", () => {
    const m = mixerWith({ chords: { solo: true }, pad: { level: 0.8 }, bass: { level: 0.5 } });
    const g = computeGroupGains(m, true);
    expect(g.chords).toBe(1);
    expect(g.bass).toBe(0);
    expect(g.pad).toBe(0);
    expect(g.original).toBe(0);
  });

  it("MUTE WINS over solo (D77 body formula: muted || (anySolo && !thisSolo))", () => {
    const m = mixerWith({ bass: { muted: true, solo: true } });
    const g = computeGroupGains(m, true);
    expect(g.bass).toBe(0); // muted (the flagged yaml-note says otherwise - see header)
    expect(g.chords).toBe(0); // ANY solo dims the non-solos - chords included
    expect(g.pad).toBe(0);
    expect(g.original).toBe(0);
  });

  it("two solos mix together; third group dims", () => {
    const m = mixerWith({
      bass: { solo: true, level: 0.5 },
      chords: { solo: true, level: 0.25 },
      pad: { level: 0.8 },
    });
    const g = computeGroupGains(m, true);
    expect(g.bass).toBe(0.5);
    expect(g.chords).toBe(0.25);
    expect(g.pad).toBe(0);
    expect(g.original).toBe(0);
  });

  it("level multiplies the open gate (0.42 * 1 = 0.42)", () => {
    const m = mixerWith({ chords: { level: 0.42 } });
    expect(computeGroupGains(m, true).chords).toBeCloseTo(0.42, 9);
  });
});

describe("playMix / applyMix on the SAME singleton (D77 absorb evidence)", () => {
  class FakeParam {
    value: number;
    writes: { target: number; time: number; tc: number }[] = [];
    constructor(v: number) {
      this.value = v;
    }
    setTargetAtTime(target: number, time: number, tc: number): void {
      this.writes.push({ target, time, tc });
      this.value = target;
    }
  }
  class FakeGain {
    gain = new FakeParam(1);
    connections: unknown[] = [];
    disconnectCount = 0;
    connect(dest: unknown): void {
      this.connections.push(dest);
    }
    disconnect(): void {
      this.disconnectCount++;
    }
  }
  class FakeSource {
    buffer: unknown = null;
    onended: (() => void) | null = null;
    stopCount = 0;
    disconnectCount = 0;
    startAt: number | null = null;
    connect(): void {}
    disconnect(): void {
      this.disconnectCount++;
    }
    start(when?: number): void {
      this.startAt = when ?? 0;
    }
    stop(): void {
      this.stopCount++;
    }
  }
  const g = globalThis as unknown as { AudioContext?: unknown };
  let ctxCount = 0;

  /** TEST HYGIENE (not a production API): the S3 GAP-2 block above
   *  leaves a gain-less fake cached in the singleton (contexts are
   *  reused FOREVER by design). Release it so the lazy re-create
   *  instantiates THIS block's fake. The S3 test itself stays
   *  byte-identical. */
  function releaseCachedCtx(): void {
    (composePreviewPlayer as unknown as { ctx: AudioContext | null }).ctx = null;
  }

  function installFake(): {
    sources: FakeSource[];
    gains: FakeGain[];
    restore: () => void;
  } {
    releaseCachedCtx();
    const sources: FakeSource[] = [];
    const gains: FakeGain[] = [];
    class FakeAudioContext {
      destination = {};
      currentTime = 1;
      constructor() {
        ctxCount++;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
      createBufferSource(): FakeSource {
        const s = new FakeSource();
        sources.push(s);
        return s;
      }
      createGain(): FakeGain {
        const gn = new FakeGain();
        gains.push(gn);
        return gn;
      }
    }
    const prev = g.AudioContext;
    g.AudioContext = FakeAudioContext;
    return {
      sources,
      gains,
      restore: () => {
        if (prev === undefined) delete g.AudioContext;
        else g.AudioContext = prev;
      },
    };
  }

  it("playMix starts <=4 sources at ONE instant through per-group gains; stop tears all down; ONE context EVER", () => {
    ctxCount = 0;
    const fake = installFake();
    try {
      const buf = { duration: 1 } as unknown as AudioBuffer;
      composePreviewPlayer.playMix({ original: buf, bass: buf, chords: buf, pad: buf });
      expect(fake.sources).toHaveLength(4);
      // SAMPLE-ACCURATE SYNC: identical start time on every source.
      const starts = new Set(fake.sources.map((s) => s.startAt));
      expect(starts.size).toBe(1);
      expect([...starts][0]).toBe(1.05); // currentTime 1 + 0.05 margin
      expect(composePreviewPlayer.getState()).toBe("playing");
      // 4 group gains + 1 master = 5 gains.
      expect(fake.gains).toHaveLength(5);
      // RE-PLAY stops + disconnects ALL prior sources (StrictMode discipline).
      composePreviewPlayer.playMix({ bass: buf });
      for (const s of fake.sources.slice(0, 4)) {
        expect(s.stopCount).toBe(1);
        expect(s.disconnectCount).toBe(1);
      }
      expect(fake.sources).toHaveLength(5);
      expect(composePreviewPlayer.getState()).toBe("playing");
      composePreviewPlayer.stop();
      expect(fake.sources[4].stopCount).toBe(1);
      expect(composePreviewPlayer.getState()).toBe("idle");
      // Empty playMix is honest-idle (nothing to play).
      composePreviewPlayer.playMix({});
      expect(composePreviewPlayer.getState()).toBe("idle");
      expect(ctxCount).toBe(1); // ONE context EVER (the singleton absorbed)
    } finally {
      composePreviewPlayer.stop();
      fake.restore();
    }
  });

  it("applyMix writes LIVE to group gains (setTargetAtTime 0.02) WITHOUT touching state; stashed gains seed the next playMix", () => {
    ctxCount = 0;
    const fake = installFake();
    try {
      const buf = { duration: 1 } as unknown as AudioBuffer;
      composePreviewPlayer.applyMix({ original: 0.5, bass: 0, chords: 1, pad: 0.25 }); // before ANY play: stash only, no ctx yet
      composePreviewPlayer.playMix({ original: buf, pad: buf });
      expect(composePreviewPlayer.getState()).toBe("playing");
      // gains[0] = master (created first), then original, pad.
      const groupGains = fake.gains.slice(1, 3);
      expect(groupGains[0].gain.value).toBeCloseTo(0.5, 9); // stashed gains applied AT START
      expect(groupGains[1].gain.value).toBeCloseTo(0.25, 9);
      composePreviewPlayer.applyMix({ original: 0.1, bass: 0, chords: 1, pad: 0.9 });
      // LIVE writes: each group gain got a setTargetAtTime(..., 0.02).
      expect(groupGains[0].gain.writes.at(-1)?.tc).toBe(0.02);
      expect(groupGains[0].gain.value).toBeCloseTo(0.1, 9);
      expect(groupGains[1].gain.value).toBeCloseTo(0.9, 9);
      expect(composePreviewPlayer.getState()).toBe("playing"); // STATE UNTOUCHED
      composePreviewPlayer.stop();
      expect(ctxCount).toBe(1);
    } finally {
      composePreviewPlayer.stop();
      fake.restore();
    }
  });

  it("S3 play() still routes DIRECTLY to destination (no gain nodes) - byte-identical path", () => {
    ctxCount = 0;
    const fake = installFake();
    try {
      const buf = { duration: 1 } as unknown as AudioBuffer;
      composePreviewPlayer.play(buf);
      expect(fake.gains).toHaveLength(0); // NO gains on the S3 path
      expect(fake.sources).toHaveLength(1);
      composePreviewPlayer.stop();
    } finally {
      fake.restore();
    }
  });
});
