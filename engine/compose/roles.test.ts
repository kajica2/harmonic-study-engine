/**
 * engine/compose/roles.test.ts - PRD-001 Phase 4 Slice 1 (test plan 3).
 *
 * Synthetic archetype tracks (walking bass, single-line flute, sustained
 * piano blocks, channel-9 drums, format-0 composite) -> expected role +
 * confidence tier; name-regex priors; a low-score tie -> unknown; and a
 * determinism pin (two calls deep-equal).
 */

import { describe, it, expect } from "vitest";
import { classifyRoles, ROLE_THRESHOLDS } from "./roles";
import type { NormalizedNote, NormalizedProject, NormalizedTrack, TrackRole } from "./types";

function note(midi: number, tick: number, durationTicks = 240, velocity = 0.8): NormalizedNote {
  return { midi, tick, durationTicks, velocity };
}

function track(index: number, over: Partial<NormalizedTrack>): NormalizedTrack {
  const notes = (over.notes ?? []) as NormalizedNote[];
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

function proj(tracks: NormalizedTrack[], format: 0 | 1 | 2 = 1): NormalizedProject {
  return {
    version: 1,
    format,
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

function roleOf(p: NormalizedProject, index: number): { role: TrackRole; confidence: number } {
  const a = classifyRoles(p).find((x) => x.trackIndex === index);
  return { role: a!.role, confidence: a!.confidence };
}

describe("classifyRoles archetypes", () => {
  it("walking bass line -> bass", () => {
    const notes = [36, 38, 40, 43, 41, 40, 38, 36].map((m, i) => note(m, i * 480, 480));
    const p = proj([track(0, { name: "Bass", channel: 1, notes })]);
    expect(roleOf(p, 0).role).toBe("bass");
  });

  it("single-line flute melody -> melody", () => {
    const notes = [72, 74, 76, 79, 77, 76, 74, 72].map((m, i) => note(m, i * 240, 240));
    const p = proj([track(0, { name: "Flute", notes })]);
    expect(roleOf(p, 0).role).toBe("melody");
  });

  it("sustained piano block chords -> harmony", () => {
    const chords = [
      [60, 64, 67],
      [62, 65, 69],
      [57, 60, 64],
      [55, 59, 62],
    ];
    const notes: NormalizedNote[] = [];
    chords.forEach((ch, i) => ch.forEach((m) => notes.push(note(m, i * 1920, 1920))));
    const p = proj([track(0, { name: "Piano", notes })]);
    expect(roleOf(p, 0).role).toBe("harmony");
  });

  it("channel-9 drums (format 1) -> percussion @ 0.99", () => {
    const notes = [36, 38, 42].map((m, i) => note(m, i * 240, 120));
    const p = proj([track(0, { name: "", channel: 9, isPercussion: true, notes })]);
    const r = roleOf(p, 0);
    expect(r.role).toBe("percussion");
    expect(r.confidence).toBe(ROLE_THRESHOLDS.percussionConfidence);
  });

  it("format-0 composite -> a valid role, never throws", () => {
    const notes: NormalizedNote[] = [];
    for (let i = 0; i < 24; i++) notes.push(note(48 + (i % 24), i * 120, 120));
    const p = proj([track(0, { name: "Composite", notes })], 0);
    const r = roleOf(p, 0);
    expect(["melody", "bass", "harmony", "unknown"]).toContain(r.role);
  });
});

describe("classifyRoles name priors + unknown", () => {
  it("a 'Bass'-named mid-register monophonic-ish track is pulled to bass", () => {
    // mean ~50 (not <45), maxPoly 2, irregular onsets -> features alone
    // would tie low; the /bass/ prior decides.
    const notes = [50, 52, 50, 53].map((m, i) => note(m, i * 300 + (i % 2) * 60, 90));
    const p = proj([track(0, { name: "Slap Bass", notes })]);
    expect(roleOf(p, 0).role).toBe("bass");
  });

  it("a weak all-round track (short, mid, 2-note overlap) -> unknown", () => {
    const notes = [note(55, 0, 50), note(57, 0, 50)];
    const p = proj([track(0, { name: "", notes })]);
    const r = roleOf(p, 0);
    expect(r.role).toBe("unknown");
    expect(r.confidence).toBeLessThan(ROLE_THRESHOLDS.minScore);
  });

  it("an empty track -> unknown @ 0", () => {
    const p = proj([track(0, { name: "", notes: [] })]);
    const r = roleOf(p, 0);
    expect(r.role).toBe("unknown");
    expect(r.confidence).toBe(0);
  });
});

describe("classifyRoles determinism", () => {
  it("same project -> deep-equal assignments across two calls", () => {
    const notes = [36, 48, 60, 72, 40, 52, 64, 76].map((m, i) => note(m, i * 240, 240));
    const p = proj([track(0, { name: "Mixed", notes }), track(1, { name: "Drums", channel: 9, isPercussion: true, notes: [note(36, 0)] })]);
    expect(classifyRoles(p)).toEqual(classifyRoles(p));
  });
});
