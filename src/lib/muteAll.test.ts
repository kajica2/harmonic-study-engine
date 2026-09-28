/**
 * src/lib/muteAll.test.ts - Mute-all monitor switch pins.
 *
 * Covers the per-source fan-out from ONE session-only `muted` boolean:
 * audioEngine zeros masterGain + metronomeGain (restorable) and gates HD
 * voices; backingEngine zeros masterBus as an independent fourth factor;
 * composePreviewPlayer mutes via mixMaster / single-source gate. All
 * engines boot UNMUTED (the page must never boot silent).
 *
 * Node-pure by design: private fields are injected via narrow casts so no
 * window.AudioContext is needed (no JSDOM_FILES change). The compose
 * playMix pin installs a fake on globalThis (same pattern as
 * composePreview.test.ts) - still node env.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./soundfont", () => ({
  loadSoundfont: () => Promise.resolve(null),
  playSoundfontNote: vi.fn(() => Promise.resolve(true)),
  stopAllSoundfonts: vi.fn(),
  soundfontAvailable: () => true,
}));

import { audioEngine } from "./audio";
import { backingEngine } from "./backingEngine";
import { composePreviewPlayer } from "./composePreview";
import { playSoundfontNote, stopAllSoundfonts } from "./soundfont";

// --- minimal fakes (node-pure, no window) ---------------------------------

type FakeParam = {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
};

function makeParam(initial: number): FakeParam {
  const calls: Array<{ target: number }> = [];
  const fn = vi.fn((target: number) => {
    param.value = target;
    calls.push({ target });
  });
  const param: FakeParam = { value: initial, setTargetAtTime: fn };
  return param;
}

type FakeGain = {
  gain: FakeParam;
  connect: () => void;
  disconnect: () => void;
};

function makeGain(initial: number): FakeGain {
  return { gain: makeParam(initial), connect: () => {}, disconnect: () => {} };
}

type FakeCtx = { currentTime: number };

type AudioPriv = {
  ctx: FakeCtx | null;
  masterGain: FakeGain | null;
  metronomeGain: FakeGain | null;
  targetVolume: number;
  metronomeVolume: number;
  masterMuted: boolean;
  melodyMuted: boolean;
  useHDSounds: boolean;
  currentInstrument: string;
  oscillators: Map<number, unknown>;
};

type BackingPriv = {
  ctx: FakeCtx | null;
  masterBus: FakeGain | null;
  drumBus: FakeGain | null;
  bassBus: FakeGain | null;
  pianoBus: FakeGain | null;
  restMuted: boolean;
  masterMuted: boolean;
  levels: { drums: number; bass: number; piano: number };
};

type ComposePriv = {
  ctx: FakeCtx | null;
  source: { stop: () => void; disconnect: () => void } | null;
  mixSources: Array<unknown>;
  mixMaster: FakeGain | null;
  previewMuted: boolean;
  state: string;
};

function audioPriv(): AudioPriv {
  return audioEngine as unknown as AudioPriv;
}

function backingPriv(): BackingPriv {
  return backingEngine as unknown as BackingPriv;
}

function composePriv(): ComposePriv {
  return composePreviewPlayer as unknown as ComposePriv;
}

// --- audioEngine ------------------------------------------------------------

describe("audioEngine.setMasterMuted - additive monitor switch", () => {
  beforeEach(() => {
    const a = audioPriv();
    a.ctx = { currentTime: 0 };
    a.masterGain = makeGain(0.5);
    a.metronomeGain = makeGain(0.8);
    a.targetVolume = 0.5;
    a.metronomeVolume = 0.8;
    a.masterMuted = false;
    a.melodyMuted = false;
    a.useHDSounds = true;
    a.oscillators = new Map();
    vi.clearAllMocks();
  });

  afterEach(() => {
    audioEngine.setMasterMuted(false);
    const a = audioPriv();
    a.ctx = null;
    a.masterGain = null;
    a.metronomeGain = null;
    vi.clearAllMocks();
  });

  it("default is UNMUTED (page never boots silent)", () => {
    const fresh = audioPriv();
    // beforeEach resets to false; the constructor default is also false
    // (public masterMuted = false in audio.ts).
    expect(fresh.masterMuted).toBe(false);
    expect(audioEngine.isMasterMuted()).toBe(false);
  });

  it("mute drives masterGain + metronomeGain to 0; unmute restores volumes", () => {
    const a = audioPriv();
    audioEngine.setMasterMuted(true);
    expect(a.masterGain?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    expect(a.metronomeGain?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    audioEngine.setMasterMuted(false);
    expect(a.masterGain?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5,
      expect.any(Number),
      0.05,
    );
    expect(a.metronomeGain?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.8,
      expect.any(Number),
      0.05,
    );
  });

  it("setVolume while muted only stashes (no leak); unmute applies the new level", () => {
    const a = audioPriv();
    audioEngine.setMasterMuted(true);
    vi.clearAllMocks();
    audioEngine.setVolume(0.9);
    expect(a.targetVolume).toBe(0.9);
    expect(a.masterGain?.gain.setTargetAtTime).not.toHaveBeenCalled();
    audioEngine.setMasterMuted(false);
    expect(a.masterGain?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.9,
      expect.any(Number),
      0.05,
    );
  });

  it("mute stops HD voices and gates new HD notes", async () => {
    // Unmuted: HD note routes to the soundfont.
    audioEngine.setMasterMuted(false);
    vi.clearAllMocks();
    audioEngine.playNote(60);
    // playSoundfontNote is async-void; flush the microtask.
    await Promise.resolve();
    expect(playSoundfontNote).toHaveBeenCalled();
    // Mute: ringing HD voices are stopped.
    audioEngine.setMasterMuted(true);
    expect(stopAllSoundfonts).toHaveBeenCalled();
    // Gated: no new HD note while muted.
    vi.clearAllMocks();
    audioEngine.playNote(60);
    await Promise.resolve();
    expect(playSoundfontNote).not.toHaveBeenCalled();
  });
});

// --- backingEngine ----------------------------------------------------------

describe("backingEngine.setMasterMuted - fourth-factor independence", () => {
  beforeEach(() => {
    const b = backingPriv();
    b.ctx = { currentTime: 0 };
    b.masterBus = makeGain(0.6);
    b.drumBus = makeGain(0.7);
    b.bassBus = makeGain(0.6);
    b.pianoBus = makeGain(0.4);
    b.restMuted = false;
    b.masterMuted = false;
    b.levels = { drums: 0.7, bass: 0.6, piano: 0.4 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    backingEngine.setMasterMuted(false);
    backingEngine.setRestMuted(false);
    const b = backingPriv();
    b.ctx = null;
    b.masterBus = null;
    b.drumBus = null;
    b.bassBus = null;
    b.pianoBus = null;
  });

  it("default is UNMUTED", () => {
    expect(backingEngine.isMasterMuted()).toBe(false);
  });

  it("mute zeros masterBus; unmute restores the nominal 0.6 mix level", () => {
    const b = backingPriv();
    backingEngine.setMasterMuted(true);
    expect(b.masterBus?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    backingEngine.setMasterMuted(false);
    expect(b.masterBus?.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.6,
      expect.any(Number),
      0.05,
    );
  });

  it("rest-mute never touches master; master-mute never touches buses", () => {
    const b = backingPriv();
    const masterCalls = (): number =>
      (b.masterBus?.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock
        .calls.length;
    // Rest on: buses zero, master untouched.
    const before = masterCalls();
    backingEngine.setRestMuted(true);
    expect(b.drumBus?.gain.value).toBe(0);
    expect(b.bassBus?.gain.value).toBe(0);
    expect(b.pianoBus?.gain.value).toBe(0);
    expect(masterCalls()).toBe(before);
    // Master on while resting: master zeros, buses stay zero.
    backingEngine.setMasterMuted(true);
    expect(b.masterBus?.gain.value).toBe(0);
    expect(b.drumBus?.gain.value).toBe(0);
    // Rest off while master still muted: buses restore, master stays 0.
    backingEngine.setRestMuted(false);
    expect(b.drumBus?.gain.value).toBeCloseTo(0.7);
    expect(b.bassBus?.gain.value).toBeCloseTo(0.6);
    expect(b.pianoBus?.gain.value).toBeCloseTo(0.4);
    expect(b.masterBus?.gain.value).toBe(0);
    // Master off: master restores, buses untouched.
    backingEngine.setMasterMuted(false);
    expect(b.masterBus?.gain.value).toBeCloseTo(0.6);
    expect(b.drumBus?.gain.value).toBeCloseTo(0.7);
  });
});

// --- composePreviewPlayer ---------------------------------------------------

describe("composePreviewPlayer.setMuted - additive audition mute", () => {
  beforeEach(() => {
    const c = composePriv();
    c.ctx = { currentTime: 1 };
    c.mixMaster = null;
    c.source = null;
    c.mixSources = [];
    c.previewMuted = false;
    composePreviewPlayer.stop();
    vi.clearAllMocks();
  });

  afterEach(() => {
    composePreviewPlayer.setMuted(false);
    composePreviewPlayer.stop();
    const c = composePriv();
    c.ctx = null;
    c.mixMaster = null;
    c.source = null;
    const g = globalThis as unknown as { AudioContext?: unknown };
    if (g.AudioContext !== undefined) delete g.AudioContext;
  });

  it("default is UNMUTED", () => {
    expect(composePreviewPlayer.isMuted()).toBe(false);
  });

  it("zeros mixMaster on mute and restores 0.9 on unmute", () => {
    const c = composePriv();
    c.mixMaster = makeGain(0.9);
    composePreviewPlayer.setMuted(true);
    expect(c.mixMaster.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      expect.any(Number),
      0.05,
    );
    composePreviewPlayer.setMuted(false);
    expect(c.mixMaster.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.9,
      expect.any(Number),
      0.05,
    );
  });

  it("single-buffer play() gates to no-op while muted (S3 path stays gain-less)", () => {
    composePreviewPlayer.setMuted(true);
    const buf = { duration: 1 } as unknown as AudioBuffer;
    composePreviewPlayer.play(buf);
    expect(composePreviewPlayer.getState()).toBe("idle");
    composePreviewPlayer.setMuted(false);
  });

  it("playMix while muted starts with master 0; unmute reveals mid-buffer", () => {
    class FakeSource {
      buffer: unknown = null;
      onended: (() => void) | null = null;
      connect(): void {}
      disconnect(): void {}
      start(): void {}
      stop(): void {}
    }
    class FakeGainNode {
      gain = makeParam(1);
      connect(): void {}
      disconnect(): void {}
    }
    class FakeAudioContext {
      destination = {};
      currentTime = 1;
      resume(): Promise<void> {
        return Promise.resolve();
      }
      createBufferSource(): FakeSource {
        return new FakeSource();
      }
      createGain(): FakeGainNode {
        return new FakeGainNode();
      }
    }
    const g = globalThis as unknown as { AudioContext?: unknown };
    const prev = g.AudioContext;
    // Release the cached ctx so the fake is used (same hygiene as
    // composePreview.test.ts).
    (composePreviewPlayer as unknown as { ctx: AudioContext | null }).ctx =
      null;
    g.AudioContext = FakeAudioContext;
    try {
      composePreviewPlayer.setMuted(true);
      const buf = { duration: 1 } as unknown as AudioBuffer;
      composePreviewPlayer.playMix({ original: buf });
      expect(composePreviewPlayer.getState()).toBe("playing");
      const c = composePriv();
      const master = c.mixMaster as unknown as FakeGainNode | null;
      expect(master?.gain.value).toBe(0);
      composePreviewPlayer.setMuted(false);
      expect(master?.gain.value).toBeCloseTo(0.9);
    } finally {
      composePreviewPlayer.stop();
      composePreviewPlayer.setMuted(false);
      if (prev === undefined) delete g.AudioContext;
      else g.AudioContext = prev;
    }
    expect(composePreviewPlayer.getState()).toBe("idle");
  });
});
