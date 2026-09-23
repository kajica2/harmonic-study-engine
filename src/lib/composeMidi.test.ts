/**
 * src/lib/composeMidi.test.ts - PRD-001 Phase 4 Slice 1 (test plan 7c).
 *
 * The @tonejs/midi -> normalize round-trip: build a Midi IN MEMORY
 * (tempo map + 6/8 + two channels), encode to bytes, parse via the
 * adapter, normalize, and assert field fidelity. This is the parse-side
 * half of D51's fidelity proof and, crucially, pins that the SMF time
 * signature survives as the REAL denominator (6/8 -> 8), which is what
 * forced the normalize denominator pass-through decision.
 *
 * NOTE (finding): @tonejs/midi 2.0.28's ENCODER writes key signatures
 * that do not round-trip (the reader yields key: undefined; only
 * major/minor survives). Key-signature parsing is therefore pinned at
 * the DTO layer (engine/compose/normalize.test.ts: "Db major -> tonicPc
 * 1"), and a @tonejs-written key sig is asserted to degrade gracefully
 * here rather than round-trip.
 */

import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { parseMidiBytes, readMidiFile, MAX_MIDI_BYTES } from "./composeMidi";
import type { ReadableMidiFile } from "./composeMidi";
import { normalizeMidiJson } from "../../engine/compose/normalize";
import type { NormalizedProject } from "../../engine/compose/types";

/** Preview of S4's composeExport (project -> Midi bytes), kept local to
 *  the test so Slice 1 ships zero export surface. */
function normalizeReproject(p: NormalizedProject): Uint8Array {
  const m = new Midi();
  m.header.tempos = p.tempos.map((t) => ({ ticks: t.tick, bpm: t.bpm }));
  m.header.timeSignatures = p.timeSignatures.map((t) => ({
    ticks: t.tick,
    timeSignature: [t.numerator, t.denominator],
  }));
  for (const t of p.tracks) {
    const tr = m.addTrack();
    tr.channel = t.channel;
    tr.name = t.name;
    for (const n of t.notes) {
      tr.addNote({ midi: n.midi, ticks: n.tick, durationTicks: n.durationTicks, velocity: n.velocity });
    }
  }
  return m.toArray();
}

function buildTestMidi(): Uint8Array {
  const m = new Midi();
  m.header.timeSignatures = [{ ticks: 0, timeSignature: [6, 8] }];
  m.header.tempos = [
    { ticks: 0, bpm: 120 },
    { ticks: 2880, bpm: 100 },
  ];
  const bass = m.addTrack();
  bass.channel = 1;
  bass.name = "Bass";
  bass.addNote({ midi: 36, ticks: 0, durationTicks: 240, velocity: 0.8 });
  bass.addNote({ midi: 38, ticks: 240, durationTicks: 240, velocity: 0.7 });
  const lead = m.addTrack();
  lead.channel = 2;
  lead.name = "Lead";
  lead.addNote({ midi: 72, ticks: 0, durationTicks: 480, velocity: 0.9 });
  lead.addNote({ midi: 74, ticks: 480, durationTicks: 480, velocity: 0.6 });
  return m.toArray();
}

function stubFile(bytes: Uint8Array, name = "song.mid", size = bytes.byteLength): ReadableMidiFile {
  const copy = bytes.slice().buffer;
  return { name, size, arrayBuffer: async () => copy };
}

describe("readMidiFile / parseMidiBytes round-trip", () => {
  it("preserves ppq, format, tempo map, and the REAL 6/8 denominator", async () => {
    const bytes = buildTestMidi();
    const r = await readMidiFile(stubFile(bytes));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p: NormalizedProject = r.value;
    expect(p.format).toBe(1); // @tonejs encoder always writes format 1
    expect(p.ppq).toBe(480);
    expect(p.tempos).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 2880, bpm: 100 },
    ]);
    expect(p.timeSignatures[0]).toEqual({ tick: 0, numerator: 6, denominator: 8 });
    expect(p.fileName).toBe("song.mid");
  });

  it("keeps per-channel tracks with sorted notes + 0..1 velocity", async () => {
    const r = await readMidiFile(stubFile(buildTestMidi()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.value;
    expect(p.tracks.length).toBe(2); // grouped by (program, channel)
    for (const t of p.tracks) {
      const ticks = t.notes.map((n) => n.tick);
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
      for (const n of t.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(0);
        expect(n.midi).toBeLessThanOrEqual(127);
        expect(n.velocity).toBeGreaterThanOrEqual(0);
        expect(n.velocity).toBeLessThanOrEqual(1);
      }
    }
    expect(p.endTick).toBeGreaterThan(0);
    expect(p.durationSec).toBeGreaterThan(0);
  });

  it("a @tonejs-written key signature degrades gracefully (encoder bug)", () => {
    const m = new Midi();
    m.header.keySignatures = [{ ticks: 0, key: "Db", scale: "major" }];
    const t = m.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 240, velocity: 0.8 });
    const json = parseMidiBytes(m.toArray().buffer);
    const norm = normalizeMidiJson(json, "key.mid");
    expect(norm.ok).toBe(true); // never throws on the dropped key
    if (!norm.ok) return;
    // The reader yields key: undefined -> normalize ignores it (warns).
    expect(norm.value.keySignatures.length).toBe(0);
    expect(norm.value.warnings.some((w) => /key signature/.test(w))).toBe(true);
  });
});

describe("normalize -> reproject -> encode -> parse -> normalize fidelity (D51 preview)", () => {
  it("structural fields survive a full round trip", () => {
    const first = normalizeMidiJson(parseMidiBytes(buildTestMidi().buffer), "a.mid");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const bytes = normalizeReproject(first.value);
    const second = normalizeMidiJson(parseMidiBytes(bytes.buffer), "b.mid");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const a = first.value;
    const b = second.value;
    expect(b.ppq).toBe(a.ppq);
    expect(b.tempos).toEqual(a.tempos);
    expect(b.timeSignatures).toEqual(a.timeSignatures);
    expect(b.tracks.length).toBe(a.tracks.length);
    a.tracks.forEach((ta, i) => {
      const tb = b.tracks[i];
      expect(tb.notes.length).toBe(ta.notes.length);
      ta.notes.forEach((na, j) => {
        expect(tb.notes[j].midi).toBe(na.midi);
        expect(tb.notes[j].tick).toBe(na.tick);
        expect(tb.notes[j].durationTicks).toBe(na.durationTicks);
        expect(tb.notes[j].velocity).toBeCloseTo(na.velocity, 2); // 0..127 rounding
      });
    });
  });
});

describe("readMidiFile error arms", () => {
  it("oversized file -> tooLarge (pre-parse)", async () => {
    const r = await readMidiFile({ name: "big.mid", size: MAX_MIDI_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(8) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("tooLarge");
  });

  it("garbage bytes -> parseFailed (never throws)", async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
    const r = await readMidiFile({ name: "junk.mid", size: junk.byteLength, arrayBuffer: async () => junk });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("parseFailed");
  });
});
