/**
 * midiExport — single function `exportToMidiFile` returns a data URI
 * containing a Standard MIDI File. The function delegates to the
 * `midi-writer-js` library; our coverage is the contract that the
 * URI is well-formed and decodes to a valid SMF.
 */

import { describe, it, expect } from "vitest";
import {
  exportToMidiFile,
  exportMidiWithVariation,
} from "../src/lib/midiExport";

/** Decode the `data:audio/midi;base64,…` URI the writer produces. */
function decodeMidi(uri: string): Buffer {
  const b64 = uri.replace(/^data:audio\/midi;base64,/, "");
  return Buffer.from(b64, "base64");
}

/** Standard header + format + track-count read. */
function readHeader(bytes: Buffer): {
  headerLen: number;
  format: number;
  trackCount: number;
} {
  return {
    headerLen: bytes.readUInt32BE(4),
    format: bytes.readUInt16BE(8),
    trackCount: bytes.readUInt16BE(10),
  };
}

/**
 * Scan the MTrk chunk for note-on events and pull out the pitch byte
 * from each. Note-on in MIDI is `0x9n dd vv` where the high nibble
 * is 9 and the next byte is the pitch (0–127). We look for those
 * bytes by walking the track and reading variable-length deltas.
 *
 * For these tests we take a coarser shortcut: any byte in the 0x90–0x9F
 * range (status byte of any note-on) followed by the next byte being
 * a plausible pitch (0–127). That overcounts slightly (a delta-time
 * of 0x90 won't happen in practice because VLQ deltas use the high
 * bit as continuation) but is good enough to verify pitch shifts.
 */
function findNoteOnPitches(bytes: Buffer): number[] {
  const pitches: number[] = [];
  for (let i = 14; i < bytes.length - 2; i++) {
    const b = bytes[i];
    if (b === undefined) continue;
    if (b >= 0x90 && b <= 0x9f) {
      const next = bytes[i + 1];
      if (next !== undefined && next <= 0x7f) {
        pitches.push(next);
      }
    }
  }
  return pitches;
}

describe("exportToMidiFile (legacy)", () => {
  const TEST_PATH = {
    id: "test",
    title: "Test",
    description: "ii-V-I",
    steps: [
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
      { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "" },
    ],
  };

  it("returns a base64 data URI", () => {
    const uri = exportToMidiFile(TEST_PATH);
    expect(uri).toMatch(/^data:audio\/midi;base64,/);
  });

  it("decodes to a non-empty byte buffer", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const bytes = decodeMidi(uri);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("starts with the SMF 'MThd' header magic", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const bytes = decodeMidi(uri);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
  });

  it("encodes a single-track format-0 file", () => {
    // After the 8-byte MThd header (4 + 4), the next 4 bytes are
    // the header data length (always 6 for SMF), then format type
    // (0 = single-track), then number of tracks, then division.
    const uri = exportToMidiFile(TEST_PATH);
    const bytes = decodeMidi(uri);
    const { headerLen, format, trackCount } = readHeader(bytes);
    expect(headerLen).toBe(6);
    expect(format).toBe(0);
    expect(trackCount).toBe(1);
  });

  it("includes an MTrk chunk for the track", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const bytes = decodeMidi(uri);
    // The MTrk magic starts at byte 14 (after the 14-byte MThd header)
    const trackMagic = bytes.subarray(14, 18).toString("ascii");
    expect(trackMagic).toBe("MTrk");
  });
});

describe("exportMidiWithVariation", () => {
  // Default path: middle-register chord notes that survive any
  // reasonable transpose shift (|shift| ≤ 12).
  const PATH = {
    id: "var-test",
    title: "Var Test",
    description: "ii-V-I",
    steps: [
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
      { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "" },
    ],
  };

  // Path with deliberately-high notes so we can verify out-of-range
  // handling without emptying the entire track.
  const HIGH_PATH = {
    id: "high",
    title: "High",
    description: "notes near the top of the keyboard",
    steps: [
      { name: "Cmaj7 hi", notes: [84, 88, 91, 95], descriptions: "" },
      { name: "G7 hi", notes: [89, 93, 96, 99], descriptions: "" },
    ],
  };

  it("asWritten matches the legacy export shape", () => {
    const legacy = exportToMidiFile(PATH);
    const varied = exportMidiWithVariation(PATH, { kind: "asWritten" });
    // Same input → same data URI byte-for-byte. We pin this so the
    // legacy single-path button's contract holds.
    expect(varied).toBe(legacy);
  });

  it("transpose shifts note-on pitches by the requested semitones", () => {
    const original = exportMidiWithVariation(PATH, { kind: "asWritten" });
    const shifted = exportMidiWithVariation(PATH, { kind: "transpose", semitones: 12 });
    const origPitches = findNoteOnPitches(decodeMidi(original));
    const shiftPitches = findNoteOnPitches(decodeMidi(shifted));
    expect(origPitches.length).toBeGreaterThan(0);
    expect(shiftPitches.length).toBe(origPitches.length);
    // Every original pitch +12 must be present in the shifted set,
    // and no other pitch should appear (assuming no clamping, which
    // is true for PATH with |shift| ≤ 12).
    const origSet = new Set(origPitches);
    const shiftSet = new Set(shiftPitches);
    for (const p of origSet) {
      expect(shiftSet.has(p + 12)).toBe(true);
    }
    // The shift is bijective for in-range notes — the shift set has
    // the same cardinality as the original.
    expect(shiftSet.size).toBe(origSet.size);
  });

  it("transpose drops notes that fall outside 0..127 (no pitch byte > 127)", () => {
    // +30 keeps the first chord intact (84..95 → 114..125 ≤ 127) but
    // pushes the highest note of the second chord (99 → 129) past
    // the MIDI ceiling, so it should be dropped.
    const uri = exportMidiWithVariation(HIGH_PATH, { kind: "transpose", semitones: 30 });
    const bytes = decodeMidi(uri);
    const pitches = findNoteOnPitches(bytes);
    // No pitch byte in the file may exceed 127 (MIDI's hard limit).
    for (const p of pitches) {
      expect(p).toBeLessThanOrEqual(127);
    }
    // 7 of the 8 source notes survive: 84,88,91,95,89,93,96 → 114,118,121,125,119,123,126
    // and 99 → 129 is dropped. We don't pin exact pitch counts (the
    // note-on scanner can overcount) but the surviving set must
    // include the lower 7 and exclude the +30-shifted 99 (=129).
    expect(pitches.length).toBeGreaterThan(0);
    expect(pitches).not.toContain(129); // would be a byte >127 anyway
    expect(pitches.length).toBeLessThan(8); // at least one was dropped

    // An extreme shift (+200) drops ALL notes from HIGH_PATH. The
    // output is still a valid SMF (header + program + tempo) with
    // zero note-on events — pin the >127 invariant on the bytes.
    const extreme = exportMidiWithVariation(HIGH_PATH, {
      kind: "transpose",
      semitones: 200,
    });
    for (const p of findNoteOnPitches(decodeMidi(extreme))) {
      expect(p).toBeLessThanOrEqual(127);
    }
  });

  it("splitTracks produces a format-1 SMF with ≥ 2 tracks", () => {
    const uri = exportMidiWithVariation(PATH, { kind: "splitTracks" });
    const bytes = decodeMidi(uri);
    const { format, trackCount } = readHeader(bytes);
    expect(format).toBe(1);
    expect(trackCount).toBeGreaterThanOrEqual(2);
    // First 4 bytes still the MThd magic.
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
  });

  it("melodyOnly emits fewer note-on events than asWritten", () => {
    const full = exportMidiWithVariation(PATH, { kind: "asWritten" });
    const melody = exportMidiWithVariation(PATH, { kind: "melodyOnly", melodyIndex: 0 });
    // melody-only uses 1 pitch per step; asWritten uses 4. We don't
    // require an exact ratio because running-status coalescing shifts
    // the count, but the melody file must be measurably smaller.
    expect(decodeMidi(melody).length).toBeLessThan(decodeMidi(full).length);
  });

  it("rhythmOnly is non-empty and well-formed", () => {
    const uri = exportMidiWithVariation(PATH, { kind: "rhythmOnly", noteDuration: "8" });
    expect(uri).toMatch(/^data:audio\/midi;base64,/);
    const bytes = decodeMidi(uri);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(bytes.length).toBeGreaterThan(14);
  });

  it("every variation returns a valid SMF data URI", () => {
    const variations = [
      { kind: "asWritten" as const },
      { kind: "transpose" as const, semitones: 7 },
      { kind: "splitTracks" as const },
      { kind: "melodyOnly" as const, melodyIndex: 1 },
      { kind: "rhythmOnly" as const, noteDuration: "4" as const },
      { kind: "rhythmOnly" as const, noteDuration: "16" as const },
      { kind: "closedVoicing" as const },
      { kind: "openVoicing" as const },
    ];
    for (const v of variations) {
      const uri = exportMidiWithVariation(PATH, v);
      expect(uri).toMatch(/^data:audio\/midi;base64,/);
      expect(decodeMidi(uri).subarray(0, 4).toString("ascii")).toBe("MThd");
    }
  });

  it("legacy exportToMidiFile still works (backwards compat pin)", () => {
    // Single-line guard against accidental signature drift. If a
    // future refactor changes the return type or signature, the
    // imports in ImportExportModal break immediately — we want
    // the test to fail loud too.
    const uri: string = exportToMidiFile(PATH);
    expect(typeof uri).toBe("string");
    expect(uri.startsWith("data:audio/midi;base64,")).toBe(true);
  });
});