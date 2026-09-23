/**
 * scripts/compose-perf.ts - PRD-001 Phase 4 Slice 1 (D54).
 *
 * Local performance bench for the Compose parse+analyze pipeline. Runs
 * N iterations over a 3-minute, 8-track, ~30k-note synthetic MIDI and
 * prints p50/p95 against the PRD's 500ms p95 target. This is a MANUAL
 * gate (documented in DEVELOPING) - the CI budget (< 1500ms, honest for
 * flake-free shared hardware) is pinned in src/lib/composeMidi.perf.test.ts.
 *
 * Run: npx tsx scripts/compose-perf.ts
 *
 * NOTE: @tonejs/midi is CommonJS; under raw tsx (Node ESM) the named
 * import does not resolve, so this dev-only script loads it via
 * createRequire and builds the DTO inline. The shipped adapter
 * (src/lib/composeMidi.ts) keeps the vite-friendly named import.
 */
import { createRequire } from "node:module";
import { normalizeMidiJson } from "../engine/compose/normalize";
import { analyzeProject } from "../engine/compose/index";
import type { MidiJsonLike } from "../engine/compose/types";

const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi") as {
  Midi: new (buf?: ArrayBuffer | ArrayLike<number>) => {
    header: {
      ppq: number;
      name: string;
      tempos: { ticks: number; bpm: number }[];
      timeSignatures: { ticks: number; timeSignature: number[] }[];
      keySignatures: { ticks: number; key: string; scale: string }[];
    };
    tracks: {
      channel: number;
      name: string;
      addNote: (p: { midi: number; ticks: number; durationTicks: number; velocity: number }) => unknown;
    }[];
    addTrack: () => { channel: number; name: string; addNote: (p: { midi: number; ticks: number; durationTicks: number; velocity: number }) => unknown };
    toArray: () => Uint8Array;
    toJSON: () => unknown;
  };
};

const TRACKS = 8;
const NOTES_PER_TRACK = 3750; // 8 x 3750 = 30,000
const BAR_LEN = 1920;
const BARS = 90;
const ITERATIONS = 10;
const TARGET_P95_MS = 500; // PRD sec 8 NFR
const CI_BUDGET_MS = 1500; // honest CI pin

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

function readSmfFormat(buf: ArrayBuffer): number | undefined {
  if (buf.byteLength < 10) return undefined;
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== 0x4d || dv.getUint8(1) !== 0x54 || dv.getUint8(2) !== 0x68 || dv.getUint8(3) !== 0x64) return undefined;
  return dv.getUint16(8);
}

function toDto(buf: ArrayBuffer): MidiJsonLike {
  const json = new Midi(buf).toJSON() as {
    header: { ppq: number; name: string; tempos: { ticks: number; bpm: number }[]; timeSignatures: { ticks: number; timeSignature: number[] }[]; keySignatures: { ticks: number; key: string; scale: string }[] };
    tracks: MidiJsonLike["tracks"][number][];
  };
  return {
    header: {
      ppq: json.header.ppq,
      name: json.header.name,
      format: readSmfFormat(buf),
      tempos: json.header.tempos,
      timeSignatures: json.header.timeSignatures,
      keySignatures: json.header.keySignatures,
    },
    tracks: json.tracks,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function once(bytes: Uint8Array): { ms: number; notes: number; bars: number } {
  const buf = bytes.buffer;
  const t0 = performance.now();
  const json = toDto(buf);
  const norm = normalizeMidiJson(json, "bench.mid");
  if (!norm.ok) throw new Error(`normalize failed: ${norm.error.code}`);
  const a = analyzeProject(norm.value);
  const ms = performance.now() - t0;
  if (!a.ok) throw new Error(`analyze failed: ${a.error.code}`);
  const notes = norm.value.tracks.reduce((s, t) => s + t.notes.length, 0);
  return { ms, notes, bars: a.value.grid.bars.length };
}

const bytes = buildBigMidi();
console.log(`compose-perf: ${TRACKS} tracks x ${NOTES_PER_TRACK} notes = ${TRACKS * NOTES_PER_TRACK} notes, ${BARS} bars`);
once(bytes); // warm-up (JIT)

const samples: number[] = [];
let notes = 0;
let bars = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const r = once(bytes);
  samples.push(r.ms);
  notes = r.notes;
  bars = r.bars;
}
samples.sort((a, b) => a - b);
const p50 = percentile(samples, 50);
const p95 = percentile(samples, 95);
const min = samples[0];
const max = samples[samples.length - 1];

console.log(`  notes=${notes} analyzed bars=${bars} iterations=${ITERATIONS}`);
console.log(`  ms: min=${min.toFixed(1)} p50=${p50.toFixed(1)} p95=${p95.toFixed(1)} max=${max.toFixed(1)}`);
console.log(`  PRD p95 target: ${TARGET_P95_MS}ms -> ${p95 <= TARGET_P95_MS ? "PASS" : "MISS"}`);
console.log(`  CI budget p95 : ${CI_BUDGET_MS}ms -> ${p95 <= CI_BUDGET_MS ? "PASS" : "FAIL"}`);
