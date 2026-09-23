/**
 * engine/compose/corpus.test.ts - PRD-001 Phase 4 Slice 1 (test plan 7,
 * the RK1/R2 mitigation).
 *
 * (a) ACCURACY SUITE: 24 seeded synthetic diatonic songs (12 tonics x
 *     major/minor, 32 bars, 4-voice realization + melody) -> detectKey
 *     top-1 >= 85% AND top-3 >= 95% (Appendix F); plus a block-chord
 *     variant -> per-bar chord root match >= 80%. Deterministic (fixed
 *     seeds) - identical every run, no flake.
 * (b) HAND-BUILT EDGE DTOs (no @tonejs needed): percussion-only,
 *     pitch-bend flag, format 2, and a > 5-minute file (truncated).
 *
 * The synthetic songs are NormalizedProjects built in-engine (createRng
 * + core/chords), so this file stays purity-clean and needs no binary
 * fixtures. The MIDI byte round-trip lives in src/lib/composeMidi.test.ts.
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { normalizeMidiJson } from "./normalize";
import { analyzeProject } from "./index";
import { detectKey } from "./key";
import { segmentGrid, inferChords } from "./harmony";
import type {
  AnalysisWindow,
  MidiJsonLike,
  NormalizedNote,
  NormalizedProject,
} from "./types";

const MAJOR: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR: readonly number[] = [0, 2, 3, 5, 7, 8, 10];
const BAR_LEN = 1920; // 4/4 @ ppq 480

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function note(midi: number, tick: number, durationTicks: number): NormalizedNote {
  return { midi, tick, durationTicks, velocity: 0.8 };
}

function project(notes: NormalizedNote[]): NormalizedProject {
  const sorted = notes.slice().sort((a, b) => a.tick - b.tick);
  let endTick = 0;
  for (const n of sorted) endTick = Math.max(endTick, n.tick + n.durationTicks);
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "synth",
    fileName: "synth.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks: [
      {
        index: 0,
        name: "synth",
        channel: 0,
        program: 0,
        isPercussion: false,
        notes: sorted,
        endTick,
        usesPitchBend: false,
      },
    ],
    endTick,
    durationSec: 0,
    warnings: [],
  };
}

function triadPcs(tonicPc: number, mode: "major" | "minor", degree: number): number[] {
  const scale = mode === "major" ? MAJOR : MINOR;
  const r = scale[degree];
  const third = scale[(degree + 2) % 7] + ((degree + 2) % 7 === (degree + 2) ? 0 : 12);
  const fifth = scale[(degree + 4) % 7] + ((degree + 4) % 7 === (degree + 4) ? 0 : 12);
  return [mod12(tonicPc + r), mod12(tonicPc + third), mod12(tonicPc + fifth)];
}

const PROG: readonly number[] = [0, 3, 4, 0, 5, 3, 4, 0]; // I IV V I vi IV V I

/** A seeded synthetic song. block=true -> pure triads (for chord match). */
function synthSong(
  tonicPc: number,
  mode: "major" | "minor",
  seed: number,
  block: boolean,
): { project: NormalizedProject; roots: number[] } {
  const rng = createRng(seed);
  const scale = mode === "major" ? MAJOR : MINOR;
  const notes: NormalizedNote[] = [];
  const roots: number[] = [];
  for (let b = 0; b < 32; b++) {
    const degree = PROG[b % PROG.length];
    const pcs = triadPcs(tonicPc, mode, degree);
    roots.push(pcs[0]);
    notes.push(note(pcs[0] + 36, b * BAR_LEN, BAR_LEN)); // bass root
    for (const pc of pcs) notes.push(note(pc + 60, b * BAR_LEN, BAR_LEN)); // voices
    if (!block) {
      // melody: tonic-anchored scale tone (start/end on the tonic)
      const mdeg = b === 0 || b === 31 ? 0 : scale[rng.int(7)];
      notes.push(note(tonicPc + mdeg + 72, b * BAR_LEN, BAR_LEN));
    }
  }
  return { project: project(notes), roots };
}

const WINDOW: AnalysisWindow = { fromTick: 0, toTick: Number.MAX_SAFE_INTEGER };

describe("corpus (a): key-detection accuracy", () => {
  const KEYS: { tonicPc: number; mode: "major" | "minor" }[] = [];
  for (let t = 0; t < 12; t++) {
    KEYS.push({ tonicPc: t, mode: "major" });
    KEYS.push({ tonicPc: t, mode: "minor" });
  }

  it("top-1 >= 85% and top-3 >= 95% across 24 seeded songs", () => {
    let top1 = 0;
    let top3 = 0;
    const misses: string[] = [];
    KEYS.forEach((k, i) => {
      const { project: p } = synthSong(k.tonicPc, k.mode, 1000 + i, false);
      const key = detectKey(p, WINDOW);
      const hit1 = key.candidates[0].tonicPc === k.tonicPc && key.candidates[0].mode === k.mode;
      const hit3 = key.candidates.some((c) => c.tonicPc === k.tonicPc && c.mode === k.mode);
      if (hit1) top1++;
      if (hit3) top3++;
      if (!hit1) {
        misses.push(
          `${k.tonicPc}${k.mode}: got ${key.candidates[0].tonicPc}${key.candidates[0].mode} (r=${key.candidates[0].correlation.toFixed(2)})`,
        );
      }
    });
    const n = KEYS.length;
    // Reported to the developer (engine test file; not scanned by the
    // src no-debug-logs gate). Honest accuracy number.
    console.log(`[compose-corpus] key top-1 ${top1}/${n} (${((top1 / n) * 100).toFixed(0)}%), top-3 ${top3}/${n} (${((top3 / n) * 100).toFixed(0)}%)`);
    if (misses.length) console.log(`[compose-corpus] top-1 misses: ${misses.join(" | ")}`);
    expect(top1 / n).toBeGreaterThanOrEqual(0.85);
    expect(top3 / n).toBeGreaterThanOrEqual(0.95);
  });
});

describe("corpus (a): block-chord root accuracy", () => {
  it("per-bar chord root match >= 80%", () => {
    let match = 0;
    let total = 0;
    for (let t = 0; t < 12; t++) {
      for (const mode of ["major", "minor"] as const) {
        const { project: p, roots } = synthSong(t, mode, 2000 + t + (mode === "minor" ? 50 : 0), true);
        const key = detectKey(p, WINDOW).candidates[0];
        const grid = inferChords(p, segmentGrid(p, WINDOW, 1), key);
        grid.bars.forEach((bar, i) => {
          const cell = bar.slots[0];
          if (cell.isRest) return;
          total++;
          if (cell.rootPc === roots[i]) match++;
        });
      }
    }
    console.log(`[compose-corpus] chord root match ${match}/${total} (${((match / total) * 100).toFixed(0)}%)`);
    expect(match / total).toBeGreaterThanOrEqual(0.8);
  });
});

describe("corpus (b): hand-built edge DTOs", () => {
  function baseDto(over: Partial<MidiJsonLike["header"]> = {}, tracks?: MidiJsonLike["tracks"]): MidiJsonLike {
    return {
      header: {
        ppq: 480,
        name: "",
        format: 1,
        tempos: [{ ticks: 0, bpm: 120 }],
        timeSignatures: [{ ticks: 0, timeSignature: [4, 4] }],
        keySignatures: [],
        ...over,
      },
      tracks: tracks ?? [],
    };
  }

  it("percussion-only -> percussionOnly true, all-rest grid, no throw", () => {
    const dto = baseDto({}, [
      {
        name: "Drums",
        channel: 9,
        instrument: { number: 0 },
        notes: [
          { midi: 36, ticks: 0, durationTicks: 240, velocity: 0.9 },
          { midi: 38, ticks: 480, durationTicks: 240, velocity: 0.9 },
          { midi: 42, ticks: 960, durationTicks: 240, velocity: 0.9 },
        ],
      },
    ]);
    const norm = normalizeMidiJson(dto, "drums.mid");
    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    const a = analyzeProject(norm.value);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.percussionOnly).toBe(true);
    expect(a.value.key.chromaticFallback).toBe(true);
    expect(a.value.grid.bars.every((b) => b.slots.every((c) => c.isRest))).toBe(true);
  });

  it("format 0 + channel-9 subtrack -> percussionOnly true, grid rests", () => {
    // Reviewer regression ask for the relaxed percussion gate: the old
    // format!==0 clause (falsified F6 premise) made a format-0 drum
    // track's "pitches" look like harmonic content. Channel 9 is GM
    // drums for EVERY format now, so this must behave like the
    // format-1 case above.
    const dto = baseDto({ format: 0 }, [
      {
        name: "Drums",
        channel: 9,
        instrument: { number: 0 },
        notes: [
          { midi: 36, ticks: 0, durationTicks: 240, velocity: 0.9 },
          { midi: 38, ticks: 480, durationTicks: 240, velocity: 0.9 },
          { midi: 42, ticks: 960, durationTicks: 240, velocity: 0.9 },
        ],
      },
      { name: "Empty", channel: 0, instrument: { number: 1 }, notes: [] },
    ]);
    const norm = normalizeMidiJson(dto, "f0drums.mid");
    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    expect(norm.value.tracks[0].isPercussion).toBe(true);
    const a = analyzeProject(norm.value);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.percussionOnly).toBe(true);
    expect(a.value.key.chromaticFallback).toBe(true);
    expect(a.value.grid.bars.every((b) => b.slots.every((c) => c.isRest))).toBe(true);
  });

  it("pitch-bend flag survives normalize (REQ-COMP-6 source)", () => {
    const dto = baseDto({}, [
      {
        name: "Lead",
        channel: 0,
        instrument: { number: 40 },
        notes: [{ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 }],
        pitchBends: [{ ticks: 0, value: 0.1 }],
      },
    ]);
    const norm = normalizeMidiJson(dto, "bend.mid");
    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    expect(norm.value.tracks[0].usesPitchBend).toBe(true);
  });

  it("format 2 keeps both parallel clips, tick 0 starts", () => {
    const dto = baseDto({ format: 2 }, [
      { name: "ClipA", channel: 0, instrument: { number: 1 }, notes: [{ midi: 60, ticks: 0, durationTicks: 240, velocity: 0.8 }] },
      { name: "ClipB", channel: 1, instrument: { number: 2 }, notes: [{ midi: 64, ticks: 0, durationTicks: 240, velocity: 0.8 }] },
    ]);
    const norm = normalizeMidiJson(dto, "f2.mid");
    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    expect(norm.value.format).toBe(2);
    expect(norm.value.tracks.length).toBe(2);
    expect(norm.value.tracks[0].notes[0].tick).toBe(0);
    expect(norm.value.tracks[1].notes[0].tick).toBe(0);
  });

  it("> 5-minute file -> truncated true at the default window", () => {
    // 120bpm, ppq480: 240s = 230400 ticks; extend the song past that.
    const notes: NormalizedNote[] = [];
    for (let b = 0; b < 160; b++) {
      notes.push(note(60, b * BAR_LEN, BAR_LEN));
      notes.push(note(64, b * BAR_LEN, BAR_LEN));
      notes.push(note(67, b * BAR_LEN, BAR_LEN));
    }
    const p = project(notes);
    expect(p.endTick).toBeGreaterThan(230400);
    const a = analyzeProject(p);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.window.toTick).toBe(230400);
    expect(a.value.truncated).toBe(true);
  });
});
