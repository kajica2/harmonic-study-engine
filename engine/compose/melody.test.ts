/**
 * engine/compose/melody.test.ts - PRD-001 Phase 4 Slice 1 (test plan 5).
 *
 * Covers both branches of REQ-COMP-11: the confident-melody-track path
 * and the top-line synthesis path (flute above piano comping wins), the
 * 16th-alternation hysteresis (no trill jump), the no-overlap invariant,
 * and window clipping.
 */

import { describe, it, expect } from "vitest";
import { extractMelody } from "./melody";
import type {
  AnalysisWindow,
  NormalizedNote,
  NormalizedProject,
  NormalizedTrack,
  TrackRoleAssignment,
} from "./types";

function note(midi: number, tick: number, durationTicks: number, velocity = 0.8): NormalizedNote {
  return { midi, tick, durationTicks, velocity };
}

function track(index: number, notes: NormalizedNote[], over: Partial<NormalizedTrack> = {}): NormalizedTrack {
  let endTick = 0;
  for (const n of notes) endTick = Math.max(endTick, n.tick + n.durationTicks);
  return {
    index,
    name: "",
    channel: 0,
    program: 0,
    isPercussion: false,
    notes,
    endTick,
    usesPitchBend: false,
    ...over,
  };
}

function proj(tracks: NormalizedTrack[]): NormalizedProject {
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "t",
    fileName: "t.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks,
    endTick: tracks.reduce((m, t) => Math.max(m, t.endTick), 0),
    durationSec: 1,
    warnings: [],
  };
}

const FULL: AnalysisWindow = { fromTick: 0, toTick: Number.MAX_SAFE_INTEGER };

describe("extractMelody - melody-track path", () => {
  it("returns the confident melody track's notes, not synthesized", () => {
    const melodyNotes = [note(76, 0, 240), note(77, 240, 240), note(79, 480, 240)];
    const p = proj([track(0, [note(60, 0, 480)]), track(1, melodyNotes)]);
    const roles: TrackRoleAssignment[] = [
      { trackIndex: 0, role: "harmony", confidence: 0.6 },
      { trackIndex: 1, role: "melody", confidence: 0.9 },
    ];
    const r = extractMelody(p, roles, FULL);
    expect(r.synthesized).toBe(false);
    expect(r.sourceTrackIndex).toBe(1);
    expect(r.notes.map((n) => n.midi)).toEqual([76, 77, 79]);
  });

  it("picks the HIGHEST-confidence melody track when several are tagged", () => {
    const p = proj([track(0, [note(72, 0, 240)]), track(1, [note(84, 0, 240)])]);
    const roles: TrackRoleAssignment[] = [
      { trackIndex: 0, role: "melody", confidence: 0.5 },
      { trackIndex: 1, role: "melody", confidence: 0.8 },
    ];
    expect(extractMelody(p, roles, FULL).sourceTrackIndex).toBe(1);
  });
});

describe("extractMelody - top-line synthesis", () => {
  it("flute above piano comping -> the flute line wins", () => {
    const piano = [note(60, 0, 480), note(62, 480, 480), note(64, 960, 480)];
    const flute = [note(84, 0, 240), note(86, 240, 240), note(88, 480, 240), note(89, 720, 240)];
    const p = proj([track(0, piano), track(1, flute)]);
    const roles: TrackRoleAssignment[] = [
      { trackIndex: 0, role: "harmony", confidence: 0.6 },
      { trackIndex: 1, role: "unknown", confidence: 0.2 },
    ];
    const r = extractMelody(p, roles, FULL);
    expect(r.synthesized).toBe(true);
    expect(r.sourceTrackIndex).toBeNull();
    const fluteSet = new Set(flute.map((n) => n.midi));
    expect(r.notes.length).toBeGreaterThan(0);
    expect(r.notes.every((n) => fluteSet.has(n.midi))).toBe(true);
  });

  it("hysteresis: a same-track 16th blip does NOT create a trill jump", () => {
    // One track: a sustained C5 (72) plus brief higher D5 (74) blips that
    // arrive inside the first eighth -> the line must stay on C5.
    const notes = [note(72, 0, 4000), note(74, 120, 60), note(74, 180, 40)];
    const p = proj([track(0, notes)]);
    const roles: TrackRoleAssignment[] = [{ trackIndex: 0, role: "unknown", confidence: 0.2 }];
    const r = extractMelody(p, roles, FULL);
    expect(r.synthesized).toBe(true);
    expect(r.notes.some((n) => n.midi === 74)).toBe(false);
    expect(r.notes[0].midi).toBe(72);
  });
});

describe("extractMelody - tester adversarial cases (fix round)", () => {
  it("descending C-major scale extracts as N notes, NOT one fused held note", () => {
    // v1 was a monotonic pitch tracker: the scale fused into 72@0/3840.
    const scale = [72, 71, 69, 67, 65, 63, 62, 60];
    const notes = scale.map((m, i) => note(m, i * 240, 240));
    const p = proj([track(0, notes)]);
    const r = extractMelody(p, [{ trackIndex: 0, role: "unknown", confidence: 0.2 }], FULL);
    expect(r.synthesized).toBe(true);
    expect(r.notes.length).toBe(8);
    expect(r.notes.map((n) => n.midi)).toEqual(scale);
    expect(r.notes.every((n) => n.durationTicks === 240)).toBe(true);
  });

  it("crossing bass: line may lose the crossing bar but RETURNS after it", () => {
    // Melody (track 0) sustains C5 while the bass (track 1) crosses
    // ABOVE it for one bar, then drops back. v1 jumped to the crossing
    // voice and never returned (monotonic tracker).
    const melody = [note(72, 0, 1920), note(70, 1920, 480), note(68, 2400, 480), note(67, 2880, 960)];
    const bass = [note(50, 0, 960), note(74, 960, 960), note(48, 1920, 960)];
    const p = proj([track(0, melody), track(1, bass)]);
    const roles: TrackRoleAssignment[] = [
      { trackIndex: 0, role: "unknown", confidence: 0.2 },
      { trackIndex: 1, role: "bass", confidence: 0.5 },
    ];
    const r = extractMelody(p, roles, FULL);
    expect(r.synthesized).toBe(true);
    const midis = r.notes.map((n) => n.midi);
    // line started on the melody
    expect(r.notes[0].midi).toBe(72);
    // ...and RETURNED to the melody after the crossing (never stuck on 74)
    expect(midis).toContain(70);
    expect(midis).toContain(68);
    expect(midis).toContain(67);
    const lastReturnIdx = midis.lastIndexOf(67);
    const crossingIdx = midis.indexOf(74);
    expect(crossingIdx).toBeGreaterThanOrEqual(0); // crossing bar may be lost TO the bass
    expect(lastReturnIdx).toBeGreaterThan(crossingIdx); // but must be returned from
    // every note after the return is a melody pitch
    expect(midis.slice(lastReturnIdx).every((m) => [72, 70, 68, 67].includes(m))).toBe(true);
  });

  it("cross-track 16th ornament does NOT hijack the line forever", () => {
    // v1: trackChange bypassed the metric gate, so a 16th flourish on
    // another track dethroned the sustained line at a metric position
    // and the line never came back.
    const line = [note(72, 0, 480), note(72, 480, 480), note(74, 960, 480)];
    const ornament = [note(84, 240, 120), note(86, 360, 120), note(84, 480, 120), note(86, 720, 120)];
    const p = proj([track(0, line), track(1, ornament)]);
    const r = extractMelody(p, [{ trackIndex: 0, role: "unknown", confidence: 0.2 }], FULL);
    const midis = r.notes.map((n) => n.midi);
    expect(midis.every((m) => [72, 74].includes(m))).toBe(true); // no 84/86 hijack
    expect(midis).toEqual([72, 72, 74]);
  });
});

describe("extractMelody - invariants", () => {
  it("output is ascending and non-overlapping", () => {
    const flute = [note(84, 0, 240), note(86, 240, 240), note(88, 480, 240), note(89, 720, 240)];
    const piano = [note(60, 0, 960), note(62, 960, 960)];
    const p = proj([track(0, piano), track(1, flute)]);
    const r = extractMelody(p, [{ trackIndex: 0, role: "harmony", confidence: 0.6 }], FULL);
    for (let i = 1; i < r.notes.length; i++) {
      expect(r.notes[i].tick).toBeGreaterThanOrEqual(r.notes[i - 1].tick);
      expect(r.notes[i - 1].tick + r.notes[i - 1].durationTicks).toBeLessThanOrEqual(r.notes[i].tick);
    }
  });

  it("respects the analysis window", () => {
    const notes = [note(72, 0, 240), note(74, 240, 240), note(76, 480, 240)];
    const p = proj([track(0, notes)]);
    const r = extractMelody(p, [{ trackIndex: 0, role: "unknown", confidence: 0.2 }], { fromTick: 0, toTick: 480 });
    expect(r.notes.every((n) => n.tick < 480)).toBe(true);
  });
});
