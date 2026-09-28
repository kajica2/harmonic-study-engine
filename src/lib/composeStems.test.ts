/**
 * src/lib/composeStems.test.ts - PRD-001 Phase 8 Slice 2 (D152/D153,
 * test plan 6.1).
 *
 * Node-pure goldens over the stems seams (no AudioContext, no DOM):
 * filename scheme (REQ-COMP-43 extension), gain-bake (WYSIHYG),
 * UNNORMALIZED law (the D153 load-bearing pin), ZIP round-trip
 * (fflate mechanics), encodeWav reality (Blob -> bytes bridge),
 * present-groups contract, silence stability, envelope parity, ASCII.
 *
 * The OfflineAudioContext render itself is NEVER asserted here (D155:
 * the MED-001 FakeOffline pattern proves ORDER, not audio - the stems
 * path adds no scheduling, it calls the shipped sequential renderer).
 */

import { describe, it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import {
  composeStemFilename,
  composeExportFilename,
  exportBaseName,
  mixGroupBuffers,
  accumulateGroupInto,
  normalizePeak,
  scaleGroupSamples,
} from "./composeExport";
import { encodeWav } from "./loopWav";
import { computeGroupGains, PREVIEW_SAMPLE_RATE } from "./composePreview";
import { MIX_GROUPS, MIXER_DEFAULTS, type MixGroup } from "../../engine/compose/types";
import type { KeyCandidate } from "../../engine/compose/types";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function fakeBuffer(data: Float32Array): AudioBuffer {
  return {
    length: data.length,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("composeStemFilename scheme (REQ-COMP-43 extension, D153)", () => {
  it("full scheme: base + C-major key + bass -> exact string", () => {
    expect(composeStemFilename("s4-fixture", C_MAJOR, "bass")).toBe(
      "s4-fixture_accomp_C_stem-bass.wav",
    );
  });

  it("key-null arm: chromaticFallback omits the key segment (never fake)", () => {
    expect(composeStemFilename("chart", null, "pad")).toBe(
      "chart_accomp_stem-pad.wav",
    );
    // Envelope parity: the ZIP envelope omits the key the same way.
    expect(composeExportFilename("chart", null, "zip")).toBe("chart_accomp.zip");
  });

  it("sanitize arm: hostile chars stripped, whitespace -> underscore (S4 law)", () => {
    const fromHostile = composeStemFilename(
      exportBaseName("a/b:c?.mid"),
      C_MAJOR,
      "bass",
    );
    expect(fromHostile).not.toMatch(/[\\/:*?"<>|]/);
    expect(fromHostile).toBe("abc_accomp_C_stem-bass.wav");
    const fromSpaces = composeStemFilename("my song", C_MAJOR, "pad");
    expect(fromSpaces).toBe("my_song_accomp_C_stem-pad.wav");
    expect(fromSpaces).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("group-exhaustiveness: all 4 MIX_GROUPS produce distinct names", () => {
    const names = MIX_GROUPS.map((g) => composeStemFilename("s4-fixture", C_MAJOR, g));
    expect(new Set(names).size).toBe(4);
    for (const g of MIX_GROUPS) {
      expect(names).toContain(`s4-fixture_accomp_C_stem-${g}.wav`);
    }
  });
});

describe("gain-bake (WYSIHYG, shared primitives)", () => {
  it("muted group contributes zeros via mixGroupBuffers", () => {
    const out = mixGroupBuffers(
      {
        original: fakeBuffer(new Float32Array([1, 0.5])),
        bass: fakeBuffer(new Float32Array([1, 0.5])),
      },
      { original: 0.9, bass: 0, chords: 0, pad: 0 },
    );
    expect(out[0]).toBeCloseTo(0.9, 6);
    expect(out[1]).toBeCloseTo(0.45, 6);
  });

  it("UNNORMALIZED law: stems helper output equals the gain-baked array, NOT the normalized mix (D153 discriminative)", () => {
    // DIRECT pin (MED-001 round): the shipped stems scale step IS
    // scaleGroupSamples - exportComposeStems calls it, so pinning the
    // helper pins the path. A future "helpful" normalizePeak(scaled)
    // inserted into that step breaks THIS test loudly.
    const mixer = {
      ...MIXER_DEFAULTS,
      original: { level: 0.5, muted: false, solo: false },
    };
    const gains = computeGroupGains(mixer, true);
    expect(gains.original).toBeCloseTo(0.5, 9);
    // Hot fixture (peak > 1 after gain-bake): normalization is observable.
    const hot = new Float32Array([2, -4, 1]);
    const stem = scaleGroupSamples(
      fakeBuffer(hot).getChannelData(0),
      gains.original,
    );
    // Gain-baked expectation, hand-computed (§6.1 #6 promise: stems
    // helper output toEqual the gain-baked array).
    expect(Array.from(stem)).toEqual([1, -2, 0.5]);
    // The input is never mutated (pure step).
    expect(Array.from(hot)).toEqual([2, -4, 1]);
    // Unnormalized: the shipped output still peaks above 1 ...
    let peak = 0;
    for (const v of stem) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(1);
    // ... and differs from what normalizePeak would ship.
    const normalized = normalizePeak(stem);
    expect(Math.max(...Array.from(normalized).map(Math.abs))).toBeCloseTo(1, 9);
    expect(Array.from(stem)).not.toEqual(Array.from(normalized));
  });
});

describe("ZIP mechanics (fflate, no audio)", () => {
  it("round-trip: zipSync 2 fake WAV members -> unzipSync -> names + bytes exact", () => {
    const a = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    const b = new Uint8Array([82, 73, 70, 70, 4, 5, 6]);
    const files: Record<string, Uint8Array> = {
      "s4-fixture_accomp_C_stem-bass.wav": a,
      "s4-fixture_accomp_C_stem-chords.wav": b,
    };
    const zipped = zipSync(files);
    const back = unzipSync(zipped);
    expect(Object.keys(back).sort()).toEqual([
      "s4-fixture_accomp_C_stem-bass.wav",
      "s4-fixture_accomp_C_stem-chords.wav",
    ]);
    expect(Array.from(back["s4-fixture_accomp_C_stem-bass.wav"] as Uint8Array)).toEqual(
      Array.from(a),
    );
    expect(Array.from(back["s4-fixture_accomp_C_stem-chords.wav"] as Uint8Array)).toEqual(
      Array.from(b),
    );
  });

  it("encodeWav reality: REAL encodeWav -> arrayBuffer -> RIFF/WAVE magic (the Blob bridge)", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 0.25]), PREVIEW_SAMPLE_RATE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = (o: number, n: number): string =>
      String.fromCharCode(...Array.from(bytes.subarray(o, o + n)));
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
  });

  it("present-groups contract: missing pad -> ZIP has 3 members, no stem-pad key", () => {
    const present: MixGroup[] = ["original", "bass", "chords"];
    const members: Record<string, Uint8Array> = {};
    for (const g of present) {
      members[composeStemFilename("s4-fixture", C_MAJOR, g)] = new Uint8Array([1, 2]);
    }
    const back = unzipSync(zipSync(members));
    expect(Object.keys(back).sort()).toEqual([
      "s4-fixture_accomp_C_stem-bass.wav",
      "s4-fixture_accomp_C_stem-chords.wav",
      "s4-fixture_accomp_C_stem-original.wav",
    ]);
    expect(Object.keys(back).some((k) => k.includes("stem-pad"))).toBe(false);
  });

  it("silence-stability: present-but-zero-gain group still yields a member (stable set)", () => {
    // Zero gain leaves the scaled Float32 silent via the SHARED
    // primitive - but the member is still emitted (D153 contract).
    const scaled = new Float32Array(2);
    accumulateGroupInto(scaled, fakeBuffer(new Float32Array([1, 0.5])), 0);
    expect(Array.from(scaled)).toEqual([0, 0]);
    const members: Record<string, Uint8Array> = {
      [composeStemFilename("s4-fixture", C_MAJOR, "chords")]: new Uint8Array([7, 8]),
    };
    const back = unzipSync(zipSync(members));
    expect(Object.keys(back)).toContain("s4-fixture_accomp_C_stem-chords.wav");
  });

  it("envelope parity: ZIP name == composeExportFilename(base, key, zip) (one truth)", () => {
    expect(composeExportFilename("s4-fixture", C_MAJOR, "zip")).toBe(
      "s4-fixture_accomp_C.zip",
    );
  });

  it("ASCII: every generated filename is ASCII-only (PM-2026-009-004)", () => {
    const names: string[] = [
      composeExportFilename("s4-fixture", C_MAJOR, "zip"),
      composeExportFilename("chart", null, "zip"),
      ...MIX_GROUPS.map((g) => composeStemFilename("s4-fixture", C_MAJOR, g)),
      composeStemFilename("chart", null, "pad"),
      composeStemFilename(exportBaseName("a/b:c?.mid"), C_MAJOR, "bass"),
    ];
    for (const n of names) {
      expect(n).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});
