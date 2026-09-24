/**
 * src/lib/composeExport.test.ts - PRD-001 Phase 4 Slice 4 (D80/D81,
 * test plan 8). THE GOLDEN TEST is the strongest pin available:
 * export -> readMidiFile (S1's OWN adapter) -> normalize -> assert
 * ppq/tempos/timeSignatures/keySignatures EQUALITY + per-track note
 * tuples + track count. The keySig equality KILLS the errata-D6
 * landmine with a test (the round-trip works BY INSERTION, not by
 * luck). Node env (no DOM): readMidiFile + @tonejs + midi-file all
 * run headless.
 */

import { describe, it, expect, vi } from "vitest";
import { parseMidi } from "midi-file";
import {
  buildCombinedMidiJson,
  encodeComposeMidi,
  composeExportFilename,
  exportBaseName,
  keySignatureSf,
  insertKeySignatureEvents,
  mixGroupBuffers,
  accumulateGroupInto,
  normalizePeak,
  exportComposeWav,
  GENERATED_GM_PROGRAM,
  type ComposeExportInput,
} from "./composeExport";
import {
  renderMixGroups,
  renderMixGroupsSequential,
  previewFullSec,
  previewFrameCount,
  PREVIEW_SAMPLE_RATE,
  type MixRenderInput,
} from "./composePreview";
import { MIXER_DEFAULTS } from "../../engine/compose/types";
import { readMidiFile, type ReadableMidiFile } from "./composeMidi";
import { withTempoOverride } from "../../engine/compose/tempo";
import { generateAccompaniment } from "../../engine/compose/accompany";
import { buildChartSession, parseChordChart } from "../../engine/compose/chordchart";
import { restCell } from "../../engine/compose/types";
import type {
  AccompanimentRequest,
  BarRegions,
  ChordGrid,
  KeyCandidate,
  NormalizedProject,
  NormalizedTrack,
  TrackRoleAssignment,
} from "../../engine/compose/types";

const PPQ = 480;
const BAR = 1920;

function track(index: number, channel: number, program: number, notes: NormalizedTrack["notes"], isPercussion = false): NormalizedTrack {
  return {
    index,
    name: `T${index}`,
    channel,
    program,
    isPercussion,
    notes,
    endTick: notes.reduce((m, n) => Math.max(m, n.tick + n.durationTicks), 0),
    usesPitchBend: false,
  };
}

/** 2 tempos, 2 time sigs, 2 key sigs (MAJORS - the @tonejs READER
 *  labels minor sigs by their relative major, a pre-existing reader
 *  convention; the minor arm is pinned at the BYTE level below),
 *  3 tracks incl. channel-9 percussion. */
function fixtureProject(over: Partial<NormalizedProject> = {}): NormalizedProject {
  const tracks = [
    track(0, 0, 0, [
      { midi: 60, tick: 0, durationTicks: 480, velocity: 0.7 },
      { midi: 64, tick: 480, durationTicks: 480, velocity: 0.7 },
    ]),
    track(1, 1, 56, [
      { midi: 72, tick: 0, durationTicks: 240, velocity: 0.8 },
      { midi: 76, tick: 240, durationTicks: 240, velocity: 0.8 },
      { midi: 79, tick: 480, durationTicks: 720, velocity: 0.8 },
    ]),
    track(2, 9, 0, [
      { midi: 36, tick: 0, durationTicks: 120, velocity: 0.9 },
      { midi: 38, tick: 480, durationTicks: 120, velocity: 0.9 },
    ], true),
  ];
  return {
    version: 1,
    format: 1,
    ppq: PPQ,
    name: "golden",
    fileName: "golden.mid",
    tempos: [
      { tick: 0, bpm: 120 },
      { tick: 3840, bpm: 96 },
    ],
    timeSignatures: [
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 7680, numerator: 3, denominator: 4 },
    ],
    keySignatures: [
      { tick: 0, tonicPc: 0, mode: "major" },
      { tick: 9600, tonicPc: 7, mode: "major" },
    ],
    tracks,
    endTick: 11520,
    durationSec: 0,
    warnings: [],
    ...over,
  };
}

function fixtureGrid(bars = 4): ChordGrid {
  const prog: readonly [number, string][] = [
    [0, "maj7"],
    [9, "min7"],
    [5, "maj7"],
    [7, "dom7"],
  ];
  const regions: BarRegions[] = [];
  for (let b = 0; b < bars; b++) {
    const [rootPc, qualitySymbol] = prog[b % prog.length];
    regions.push({
      bar: b,
      startTick: b * BAR,
      endTick: (b + 1) * BAR,
      slots: [{ ...restCell(), rootPc, qualitySymbol, name: "x", isRest: false, confidence: 1 }],
    });
  }
  return { slotsPerBar: 1, bars: regions };
}

function fixtureResult(roles: AccompanimentRequest["roles"]) {
  const req: AccompanimentRequest = {
    version: 1,
    styleId: "jazz",
    roles,
    density: 3,
    seed: 42,
  };
  const out = generateAccompaniment(req, fixtureGrid(), PPQ, {
    tonicPc: 0,
    mode: "major",
    correlation: 1,
  });
  if (!out.ok) throw new Error(`fixture generate failed: ${out.error.code}`);
  return out.value;
}

function input(over: Partial<ComposeExportInput> = {}): ComposeExportInput {
  return {
    project: fixtureProject(),
    result: fixtureResult(["bass", "chords"]),
    roles: [
      { trackIndex: 0, role: "harmony", confidence: 0.9 },
      { trackIndex: 1, role: "melody", confidence: 0.9 },
      { trackIndex: 2, role: "percussion", confidence: 0.9 },
    ],
    ...over,
  };
}

function toReadable(bytes: Uint8Array): ReadableMidiFile {
  return {
    name: "exported.mid",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

const KEY_C: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

describe("GOLDEN round-trip: encode -> readMidiFile (S1's adapter) -> normalize (D80)", () => {
  it("ppq + tempos + timeSignatures + keySignatures are EQUAL (the errata-D6 landmine, killed by a test)", async () => {
    const bytes = encodeComposeMidi(input());
    const read = await readMidiFile(toReadable(bytes));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const p = read.value;
    expect(p.ppq).toBe(PPQ);
    expect(p.tempos).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 3840, bpm: 96 },
    ]);
    expect(p.timeSignatures).toEqual([
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 7680, numerator: 3, denominator: 4 },
    ]);
    // THE equality assertion: our INSERTED spec bytes round-trip.
    expect(p.keySignatures).toEqual([
      { tick: 0, tonicPc: 0, mode: "major" },
      { tick: 9600, tonicPc: 7, mode: "major" },
    ]);
  });

  it("track COUNT = originals + roles; per-track note tuples EQUAL (vel quantized to /127); programs survive", async () => {
    const inp = input();
    const bytes = encodeComposeMidi(inp);
    const read = await readMidiFile(toReadable(bytes));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const p = read.value;
    expect(p.tracks.length).toBe(5); // 3 originals + bass + chords (conductor dropped by @tonejs parse)
    const byChannel = new Map(p.tracks.map((t) => [t.channel, t]));
    // Originals UNTRANSPOSED (REQ-TRANS-3) + channel 9 percussion PRESENT
    // (D78: export is DATA, not mix - the mixer skips drums, this does not).
    const orig0 = byChannel.get(0);
    expect(orig0).toBeDefined();
    expect(orig0?.program).toBe(0);
    expect(orig0?.notes).toEqual([
      { midi: 60, tick: 0, durationTicks: 480, velocity: Math.floor(0.7 * 127) / 127 },
      { midi: 64, tick: 480, durationTicks: 480, velocity: Math.floor(0.7 * 127) / 127 },
    ]);
    const drums = byChannel.get(9);
    expect(drums?.isPercussion).toBe(true);
    expect(drums?.notes.length).toBe(2);
    // Generated roles: GM programs 33/0 on the FIRST UNUSED channels (2,3).
    const bass = byChannel.get(2);
    const chords = byChannel.get(3);
    expect(bass?.program).toBe(GENERATED_GM_PROGRAM.bass);
    expect(chords?.program).toBe(GENERATED_GM_PROGRAM.chords);
    expect(bass?.notes.length).toBeGreaterThan(0);
    expect(chords?.notes.length).toBeGreaterThan(0);
    // Tuple equality vs the SOURCE notes (quantized velocity).
    const srcBass = inp.result?.generated.bass ?? [];
    expect(bass?.notes.map((n) => [n.midi, n.tick, n.durationTicks])).toEqual(
      srcBass.map((n) => [n.midi, n.tick, n.durationTicks]),
    );
  });

  it("NO-override arm preserves the FILE tempo map; override arm exports the SINGLE override tempo (D79 both arms)", async () => {
    const plain = await readMidiFile(toReadable(encodeComposeMidi(input())));
    expect(plain.ok && plain.value.tempos.length).toBe(2);
    const overridden = input({ project: withTempoOverride(fixtureProject(), 150) });
    const read = await readMidiFile(toReadable(encodeComposeMidi(overridden)));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.tempos).toEqual([{ tick: 0, bpm: 150 }]);
  });

  it("odd ppq 96 survives the header-division fix (@tonejs stamps 480; we rewrite the SMF field)", async () => {
    const bytes = encodeComposeMidi(input({ project: fixtureProject({ ppq: 96 }) }));
    const parsed = parseMidi(bytes);
    expect(parsed.header.ticksPerBeat).toBe(96);
  });

  it("chart arm: no originals, generated present, directive keySig round-trips (Bb = -2)", async () => {
    const chart = parseChordChart("{key: Bb}\nBbmaj7 Gm7 Ebmaj7 Ab7");
    expect(chart.ok).toBe(true);
    if (!chart.ok) return;
    const { project, analysis } = buildChartSession(chart.value);
    const result = (() => {
      const out = generateAccompaniment(
        { version: 1, styleId: "jazz", roles: ["bass", "chords", "pad"], density: 3, seed: 42 },
        analysis.grid,
        project.ppq,
        analysis.key.candidates[0],
      );
      if (!out.ok) throw new Error("chart generate failed");
      return out.value;
    })();
    const bytes = encodeComposeMidi({ project, result, roles: [] });
    const read = await readMidiFile(toReadable(bytes));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.tracks.length).toBe(3); // generated only
    expect(read.value.keySignatures).toEqual([{ tick: 0, tonicPc: 10, mode: "major" }]);
    expect(read.value.tempos).toEqual([{ tick: 0, bpm: 120 }]);
  });

  it("determinism: encoding twice yields BYTE-IDENTICAL files", () => {
    const a = encodeComposeMidi(input());
    const b = encodeComposeMidi(input());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("channel assignment (D80)", () => {
  it("origins on ch1 + ch9 -> generated pick 0, 2, 3 (ascending, 9 reserved-skip)", () => {
    const p = fixtureProject();
    const tracks = [
      track(0, 1, 0, [{ midi: 60, tick: 0, durationTicks: 10, velocity: 0.5 }]),
      track(1, 9, 0, [{ midi: 36, tick: 0, durationTicks: 10, velocity: 0.5 }], true),
    ];
    const inp: ComposeExportInput = {
      project: { ...p, tracks },
      result: fixtureResult(["bass", "chords", "pad"]),
      roles: [],
    };
    const midi = buildCombinedMidiJson(inp);
    const channels = midi.tracks.map((t) => t.channel);
    expect(channels.slice(0, 2)).toEqual([1, 9]); // originals untouched
    expect(channels.slice(2)).toEqual([0, 2, 3]); // generated picks
  });
});

describe("keySig insertion + sf table (D80)", () => {
  it("all 24 canonical keys hit the SMF spec sf values", () => {
    const MAJOR: readonly number[] = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5]; // C Db D Eb E F Gb G Ab A Bb B
    const MINOR: readonly number[] = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2]; // Cm C#m Dm Ebm Em Fm F#m Gm G#m Am Bbm Bm
    for (let pc = 0; pc < 12; pc++) {
      expect(keySignatureSf(pc, "major")).toBe(MAJOR[pc]);
      expect(keySignatureSf(pc, "minor")).toBe(MINOR[pc]);
    }
  });

  it("out-of-domain pc -> null (the skip-event guard)", () => {
    expect(keySignatureSf(12, "major")).toBeNull();
    expect(keySignatureSf(-1, "minor")).toBeNull();
    expect(keySignatureSf(3.5, "major")).toBeNull();
    expect(keySignatureSf(Number.NaN, "major")).toBeNull();
  });

  it("MINOR keys carry the SPEC sf byte (Cm -> key:-3 scale:1) even though the @tonejs READER labels minor by its relative major", () => {
    const p = fixtureProject({
      keySignatures: [{ tick: 0, tonicPc: 0, mode: "minor" }],
    });
    const bytes = encodeComposeMidi(input({ project: p }));
    const parsed = parseMidi(bytes);
    const ev = (parsed.tracks[0] as unknown as { type: string; key?: number; scale?: number }[]).find(
      (e) => e.type === "keySignature",
    );
    expect(ev).toBeDefined();
    expect(ev?.key).toBe(-3);
    expect(ev?.scale).toBe(1);
  });

  it("no keySigs -> bytes UNTOUCHED (insertion path skipped, zero risk to the plain export)", () => {
    const p = fixtureProject({ keySignatures: [] });
    const inp = input({ project: p });
    const viaEncode = encodeComposeMidi(inp);
    const viaTonejs = new Uint8Array(buildCombinedMidiJson(inp).toArray());
    expect(Buffer.from(viaEncode).equals(Buffer.from(viaTonejs))).toBe(true);
  });

  it("insertion at tick 0 lands in the leading meta block with deltaTime 0 (D80 note)", () => {
    const p = fixtureProject({ keySignatures: [{ tick: 0, tonicPc: 3, mode: "major" }] });
    const bytes = encodeComposeMidi(input({ project: p }));
    const parsed = parseMidi(bytes);
    let cum = 0;
    const ks = (parsed.tracks[0] as unknown as { type: string; deltaTime: number; key?: number }[]).find(
      (e) => {
        const at = cum + e.deltaTime;
        cum = at;
        return e.type === "keySignature";
      },
    );
    expect(ks?.deltaTime).toBe(0);
    expect(ks?.key).toBe(-3);
  });

  it("insertKeySignatureEvents is a pure passthrough for empty specs (same bytes)", () => {
    const bytes = encodeComposeMidi(input({ project: fixtureProject({ keySignatures: [] }) }));
    expect(insertKeySignatureEvents(bytes, [])).toBe(bytes);
  });
});

describe("REQ-COMP-43 filename (spellTonic; fallback-omit; sanitize)", () => {
  it("key segment = spellTonic(pc, mode, '')", () => {
    expect(composeExportFilename("song", KEY_C, "mid")).toBe("song_accomp_C.mid");
    expect(composeExportFilename("song", { tonicPc: 10, mode: "major", correlation: 1 }, "wav")).toBe(
      "song_accomp_Bb.wav",
    );
    expect(composeExportFilename("song", { tonicPc: 3, mode: "minor", correlation: 1 }, "mid")).toBe(
      "song_accomp_Eb.mid",
    );
    expect(composeExportFilename("song", { tonicPc: 6, mode: "major", correlation: 1 }, "mid")).toBe(
      "song_accomp_Gb.mid", // ties flat (MAJOR_TABLE)
    );
    expect(composeExportFilename("song", { tonicPc: 1, mode: "minor", correlation: 1 }, "mid")).toBe(
      "song_accomp_C#.mid", // minor ties sharp (MINOR_TABLE)
    );
  });

  it("NO key -> the segment is OMITTED (never a fake key)", () => {
    expect(composeExportFilename("song", null, "mid")).toBe("song_accomp.mid");
  });

  it("sanitize: strip [\\\\/:*?\"<>|], collapse whitespace to _; base = fileName minus ext", () => {
    expect(composeExportFilename('a/b:c*d?e<f>g"h|i|j', KEY_C, "mid")).toBe(
      "abcdefghij_accomp_C.mid",
    );
    expect(composeExportFilename("two  words here", null, "wav")).toBe("two_words_here_accomp.wav");
    expect(exportBaseName("My Song.mid")).toBe("My Song");
    expect(exportBaseName("chart.MIDI")).toBe("chart");
    expect(exportBaseName("chart.mid")).toBe("chart"); // chart sessions (D80)
    expect(exportBaseName("noext")).toBe("noext");
  });
});

describe("WAV full-mix pure helpers (D81/D88)", () => {
  function fakeBuffer(data: Float32Array): AudioBuffer {
    return { length: data.length, getChannelData: () => data } as unknown as AudioBuffer;
  }

  it("mixGroupBuffers sums at gain levels over the longest group", () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 0.5]);
    const out = mixGroupBuffers(
      { original: fakeBuffer(a), bass: fakeBuffer(b) },
      { original: 0.5, bass: 1, chords: 0, pad: 1 },
    );
    expect(Array.from(out)).toEqual([0.5, 0.5, 0, 0]);
  });

  it("zero-gain groups are skipped entirely", () => {
    const a = new Float32Array([1, 1]);
    const out = mixGroupBuffers(
      { pad: fakeBuffer(a) },
      { original: 0, bass: 0, chords: 0, pad: 0 },
    );
    expect(Array.from(out)).toEqual([0, 0]);
  });

  it("normalizePeak: HOT mixes scale to 1.0, quiet mixes NEVER amplify (D88 clamp), silence survives", () => {
    const hot = new Float32Array([2, -4, 1]);
    const scaled = normalizePeak(hot);
    expect(Math.max(...Array.from(scaled).map(Math.abs))).toBeCloseTo(1, 9);
    expect(scaled[0]).toBeCloseTo(0.5, 9);
    const quiet = new Float32Array([0.1, -0.2]);
    expect(normalizePeak(quiet)).toBe(quiet); // SAME object (no-op)
    expect(Array.from(normalizePeak(new Float32Array(3)))).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// MED-001 (S4 fix round): the EXPORT-path memory accounting. The old
// exportComposeWav ran renderMixGroups (4 CONCURRENT OfflineAudioContexts)
// -> at the 600s cap that is ~423MB of group buffers alive at once. The
// fix renders SEQUENTIALLY and free-mixes each buffer into the accumulator
// (peak = one group buffer + accumulator). Node has no OfflineAudioContext
// so we install a fake that logs create/resolve ORDER + tracks live buffers.
// ---------------------------------------------------------------------------

import { computeGroupGains } from "./composePreview";
import type { OriginalVoiceNote } from "./composePreview";

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  detune = new FakeParam();
  type = "sine";
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

function installFakeOffline() {
  const events: string[] = [];
  let created = 0;
  let live = 0;
  let peak = 0;
  class FakeOffline {
    id: number;
    len: number;
    destination = {};
    constructor(_ch: number, len: number, _sr: number) {
      this.id = ++created;
      this.len = len;
      events.push(`create-${this.id}`);
    }
    createGain(): FakeNode {
      return new FakeNode();
    }
    createBiquadFilter(): FakeNode {
      return new FakeNode();
    }
    createOscillator(): FakeNode {
      return new FakeNode();
    }
    startRendering(): Promise<AudioBuffer> {
      const id = this.id;
      const len = this.len;
      return Promise.resolve().then(() => {
        events.push(`resolve-${id}`);
        const data = new Float32Array(len).fill(0.25);
        live += 1;
        if (live > peak) peak = live;
        return { length: len, getChannelData: () => data } as unknown as AudioBuffer;
      });
    }
  }
  const g = globalThis as unknown as { OfflineAudioContext?: unknown };
  const prev = g.OfflineAudioContext;
  g.OfflineAudioContext = FakeOffline;
  return {
    events,
    release: () => {
      live -= 1;
    },
    getPeak: () => peak,
    getCreated: () => created,
    restore: () => {
      if (prev === undefined) delete g.OfflineAudioContext;
      else g.OfflineAudioContext = prev;
    },
  };
}

function mixInput(): MixRenderInput {
  const tracks: OriginalVoiceNote[] = [
    { voice: "bass", midi: 40, tick: 0, durationTicks: 480, velocity: 0.5 },
  ];
  return {
    project: fixtureProject(),
    result: fixtureResult(["bass", "chords"]),
    tracks,
    endTick: 11520,
  };
}

describe("MED-001 export path: sequential render + free-into-accumulator", () => {
  it("renderMixGroups (AUDITION, parallel) constructs EVERY context before any resolves (the memory problem, pinned)", async () => {
    const fake = installFakeOffline();
    try {
      await renderMixGroups(mixInput(), 600);
      // 3 groups (original + bass + chords): all created up front.
      expect(fake.getCreated()).toBe(3);
      expect(fake.events.slice(0, 3)).toEqual(["create-1", "create-2", "create-3"]);
      // ...and all three buffers are LIVE simultaneously (peak 3).
      expect(fake.getPeak()).toBe(3);
    } finally {
      fake.restore();
    }
  });

  it("renderMixGroupsSequential interleaves create/resolve ONE AT A TIME", async () => {
    const fake = installFakeOffline();
    try {
      const gains = computeGroupGains(MIXER_DEFAULTS, true);
      const acc = new Float32Array(previewFrameCount(
        Math.min(previewFullSec(fixtureProject(), 11520), 600),
      ));
      await renderMixGroupsSequential(mixInput(), 600, (group, buf) => {
        accumulateGroupInto(acc, buf, gains[group]);
        fake.release(); // model the loop dropping the buffer ref
      });
      expect(fake.getCreated()).toBe(3);
      // STRICT interleave: create-1, resolve-1, create-2, resolve-2, create-3, resolve-3.
      expect(fake.events).toEqual([
        "create-1", "resolve-1", "create-2", "resolve-2", "create-3", "resolve-3",
      ]);
      // Peak LIVE group buffers <= 2 (one being accumulated while the
      // next has not yet been constructed) - the whole point of MED-001.
      expect(fake.getPeak()).toBeLessThanOrEqual(2);
      // Correctness: every sample = 0.25 * (sum of active gains).
      const sumGain = gains.original + gains.bass + gains.chords;
      expect(acc[0]).toBeCloseTo(0.25 * sumGain, 9);
      expect(acc[acc.length - 1]).toBeCloseTo(0.25 * sumGain, 9);
    } finally {
      fake.restore();
    }
  });

  it("exportComposeWav drives the SEQUENTIAL path (create/resolve interleave), not the parallel sum", async () => {
    const fake = installFakeOffline();
    try {
      await exportComposeWav(mixInput(), MIXER_DEFAULTS, true, null);
      expect(fake.getCreated()).toBe(3);
      // Discriminative: a regression to renderMixGroups (parallel) would
      // show create-1, create-2, create-3 up front. Sequential interleaves.
      expect(fake.events.slice(0, 2)).toEqual(["create-1", "resolve-1"]);
      expect(fake.events.indexOf("create-2")).toBeGreaterThan(fake.events.indexOf("resolve-1"));
    } finally {
      fake.restore();
    }
  });

  it("accumulateGroupInto matches mixGroupBuffers for the same groups+gains (no drift between pure and sequential paths)", () => {
    const mk = (v: number, len: number) =>
      ({ length: len, getChannelData: () => new Float32Array(len).fill(v) } as unknown as AudioBuffer);
    const groups = { original: mk(0.5, 8), bass: mk(0.25, 8), chords: mk(0.1, 8) };
    const gains = { original: 1, bass: 0.5, chords: 0.25, pad: 0 };
    const viaSum = mixGroupBuffers(groups, gains);
    const acc = new Float32Array(8);
    for (const g of ["original", "bass", "chords"] as const) {
      accumulateGroupInto(acc, groups[g], gains[g]);
    }
    expect(Array.from(acc)).toEqual(Array.from(viaSum));
  });
});
