/**
 * src/components/composeFixtures.tsx - PRD-001 Phase 4 Slice 2 TEST
 * FIXTURES ONLY (imported by *.test.tsx files; never by production
 * code, so it never enters the app bundle).
 *
 * Builds tiny deterministic MIDI bytes with @tonejs/midi (the same
 * generator strategy the e2e spec uses, D65 - no committed binaries),
 * plus the synchronous parse+normalize+analyze helpers the component
 * tests need to seed the store directly.
 *
 * The C-major fixture is deliberately engineered so the D58 blend
 * lands in the AUTO tier honestly: no key-signature meta (inferred-
 * only path), 8 bars of C / Dm7 / G7 -> C (diatonic mass 1.0, V-I
 * cadence 1.0, ii-V-I annotations), KS r ~ 0.9.
 */

import { Midi } from "@tonejs/midi";
import { parseMidiBytes } from "../lib/composeMidi";
import { normalizeMidiJson } from "../../engine/compose/normalize";
import { analyzeProject } from "../../engine/compose";
import type { ComposeAnalysis, NormalizedProject } from "../../engine/compose/types";

/** One bar of block chords + 4 quarter-note melody tones an octave up. */
const PROG: readonly { readonly chord: readonly number[]; readonly line: readonly number[] }[] = [
  { chord: [60, 64, 67], line: [72, 76, 79, 72] }, // C
  { chord: [62, 65, 69, 72], line: [74, 77, 81, 74] }, // Dm7
  { chord: [55, 59, 62, 65], line: [79, 74, 71, 67] }, // G7
  { chord: [60, 64, 67], line: [72, 76, 79, 84] }, // C
];
const BAR_TICKS = 1920;

export interface FixtureOptions {
  bars?: number;
  /** Channel 9 only (REQ-COMP-51 fixture). */
  percussionOnly?: boolean;
  /** Even 12-tone sweep (REQ-COMP-52 fallback fixture). */
  atonal?: boolean;
  /** A tail note past the 4-minute default window (REQ-COMP-53). */
  farNote?: boolean;
  /** A pitch-bend event on the chord track (REQ-COMP-6). */
  pitchBend?: boolean;
  /** No tempo meta -> normalize warns "assumed 120 BPM". */
  noTempo?: boolean;
  /** No notes at all (REQ-COMP-50 noNotes arm). */
  empty?: boolean;
}

export function buildMidiBytes(opts: FixtureOptions = {}): Uint8Array {
  const midi = new Midi();
  if (opts.noTempo !== true) midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const bars = opts.bars ?? 8;

  if (opts.empty === true) {
    midi.addTrack();
    return midi.toArray();
  }

  if (opts.percussionOnly === true) {
    const drums = midi.addTrack();
    drums.name = "Drums";
    drums.channel = 9;
    for (let b = 0; b < bars; b++) {
      for (let q = 0; q < 4; q++) {
        drums.addNote({ midi: 36, ticks: b * BAR_TICKS + q * 480, durationTicks: 120, velocity: 0.9 });
      }
    }
    return midi.toArray();
  }

  if (opts.atonal === true) {
    const line = midi.addTrack();
    line.name = "Series";
    line.channel = 0;
    let tick = 0;
    for (let i = 0; i < 24; i++) {
      line.addNote({ midi: 48 + (i % 12), ticks: tick, durationTicks: 240, velocity: 0.8 });
      tick += 240;
    }
    return midi.toArray();
  }

  const chords = midi.addTrack();
  chords.name = "Piano";
  chords.channel = 0;
  chords.instrument.number = 0;
  const melody = midi.addTrack();
  melody.name = "Melody";
  melody.channel = 1;
  melody.instrument.number = 56;
  for (let b = 0; b < bars; b++) {
    const step = PROG[b % PROG.length];
    for (const m of step.chord) {
      chords.addNote({ midi: m, ticks: b * BAR_TICKS, durationTicks: BAR_TICKS, velocity: 0.7 });
    }
    step.line.forEach((m, q) => {
      melody.addNote({ midi: m, ticks: b * BAR_TICKS + q * 480, durationTicks: 440, velocity: 0.8 });
    });
  }
  if (opts.pitchBend === true) chords.addPitchBend({ ticks: 0, value: 0.25 });
  if (opts.farNote === true) {
    // 120 BPM ppq 480: the default window ends at 230400 ticks.
    chords.addNote({ midi: 60, ticks: 300000, durationTicks: 480, velocity: 0.7 });
    melody.addNote({ midi: 72, ticks: 300480, durationTicks: 480, velocity: 0.8 });
  }
  return midi.toArray();
}

export function makeMidiFile(name: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type: "audio/midi" });
}

/** Synchronous parse -> normalize -> analyze (fixture bugs throw). */
export function analyzeFixture(opts: FixtureOptions = {}, fileName = "fixture.mid"): {
  project: NormalizedProject;
  analysis: ComposeAnalysis;
} {
  const bytes = buildMidiBytes(opts);
  const json = parseMidiBytes(bytes.buffer.slice(0) as ArrayBuffer);
  const normalized = normalizeMidiJson(json, fileName);
  if (!normalized.ok) {
    throw new Error(`fixture normalize failed: ${normalized.error.code}`);
  }
  const analyzed = analyzeProject(normalized.value);
  if (!analyzed.ok) {
    throw new Error(`fixture analyze failed: ${analyzed.error.code}`);
  }
  return { project: normalized.value, analysis: analyzed.value };
}
