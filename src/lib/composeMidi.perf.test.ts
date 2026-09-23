/**
 * src/lib/composeMidi.perf.test.ts - PRD-001 Phase 4 Slice 1 (D54,
 * test plan 8).
 *
 * Generates a 3-minute, 8-track, ~30k-note MIDI IN MEMORY, then times
 * parse + normalize + analyze and asserts the honest CI budget of
 * < 1500ms (the PRD's 500ms p95 target lives in scripts/compose-perf.ts
 * locally - NOT pinned here, per D54). Prints ms via console.warn only
 * on failure.
 */

import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { parseMidiBytes } from "./composeMidi";
import { normalizeMidiJson } from "../../engine/compose/normalize";
import { analyzeProject } from "../../engine/compose/index";

const TRACKS = 8;
const NOTES_PER_TRACK = 3750; // 8 x 3750 = 30,000
const BAR_LEN = 1920;
const BARS = 90; // ~3 min @ 120bpm 4/4

function buildBigMidi(): Uint8Array {
  const m = new Midi();
  m.header.tempos = [{ ticks: 0, bpm: 120 }];
  m.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
  const span = BARS * BAR_LEN;
  for (let ti = 0; ti < TRACKS; ti++) {
    const t = m.addTrack();
    t.channel = ti % 16;
    t.name = `T${ti}`;
    for (let k = 0; k < NOTES_PER_TRACK; k++) {
      const tick = (k * 40 + ti * 7) % span;
      const midi = 36 + ((k * 7 + ti * 3) % 60);
      t.addNote({ midi, ticks: tick, durationTicks: 40, velocity: 0.5 + (k % 10) / 20 });
    }
  }
  return m.toArray();
}

describe("compose parse+normalize+analyze perf budget (D54)", () => {
  it("3-min 8-track ~30k notes < 1500ms", () => {
    const bytes = buildBigMidi();
    const buf = bytes.buffer;
    let totalNotes = 0;

    const t0 = performance.now();
    const json = parseMidiBytes(buf);
    const norm = normalizeMidiJson(json, "big.mid");
    if (!norm.ok) throw new Error(`normalize failed: ${norm.error.code}`);
    totalNotes = norm.value.tracks.reduce((s, t) => s + t.notes.length, 0);
    const a = analyzeProject(norm.value);
    const ms = performance.now() - t0;
    if (!a.ok) throw new Error(`analyze failed: ${a.error.code}`);

    if (ms >= 1500) {
      console.warn(`[compose-perf] ${ms.toFixed(0)}ms exceeds the 1500ms CI budget (notes=${totalNotes})`);
    }
    expect(totalNotes).toBeGreaterThan(25000);
    expect(ms).toBeLessThan(1500);
  });
});
