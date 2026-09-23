/**
 * engine/compose/patterns.test.ts - PRD-001 Phase 4 Slice 3 (test plan
 * 1, D66). STRUCTURE pins for the authored pattern library: the tables
 * in docs/PHASE-4-S3-ACCOMPANIMENT.md D66 ARE the spec, so this file
 * verifies the transcription (entry counts, ids, hit counts, ranks,
 * accents, feel lists, labels), the data-integrity invariants (step <
 * divisions, ranks 0..5, nextApproach only on walking), the SHIPPED-
 * PROFILE AFFINITY PIN, the meter-tiling table, and the velocity tier
 * bounds. Musical regressions are human-gated (RK6, listen check).
 */

import { describe, it, expect } from "vitest";
import {
  allPatterns,
  bassPattern,
  chordPattern,
  tiledHits,
  PATTERN_VELOCITY,
  PAD_PATTERN_ID,
  type PatternEntry,
} from "./patterns";
import { allStyleProfiles } from "../styles/index";
import type { BassPatternId, ChordPatternId, FeelId } from "../styles/types";

const ASCII_RE = /^[\x20-\x7E]+$/;

describe("library shape (D66)", () => {
  it("ships exactly 14 entries: 8 chord + 6 bass, ids unique", () => {
    const all = allPatterns();
    expect(all).toHaveLength(14);
    expect(all.filter((p) => p.kind === "chord")).toHaveLength(8);
    expect(all.filter((p) => p.kind === "bass")).toHaveLength(6);
    const ids = all.map((p) => p.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("ids are EXACTLY the two style-type unions (8 + 6)", () => {
    const chordIds = allPatterns()
      .filter((p) => p.kind === "chord")
      .map((p) => p.id)
      .sort();
    const bassIds = allPatterns()
      .filter((p) => p.kind === "bass")
      .map((p) => p.id)
      .sort();
    expect(chordIds).toEqual(
      ["alberti", "block", "charleston", "freddieGreen", "lazy", "offbeat", "pulse", "sustain"],
    );
    expect(bassIds).toEqual(
      ["drone", "eighthPulse", "rootFifth", "shuffleBoogie", "twoFeel", "walking"],
    );
    // Accessors resolve every id and null for a foreign kind.
    for (const id of chordIds) {
      expect(chordPattern(id as ChordPatternId)).not.toBeNull();
      expect(bassPattern(id as BassPatternId)).toBeNull();
    }
    for (const id of bassIds) {
      expect(bassPattern(id as BassPatternId)).not.toBeNull();
      expect(chordPattern(id as ChordPatternId)).toBeNull();
    }
  });

  it("verbatim hit counts per entry (the D66 tables transcribed)", () => {
    const counts: Record<string, number> = {
      freddieGreen: 4,
      charleston: 2,
      block: 4,
      pulse: 8,
      offbeat: 4,
      lazy: 4,
      sustain: 1,
      alberti: 8,
      walking: 4,
      twoFeel: 2,
      rootFifth: 4,
      eighthPulse: 8,
      shuffleBoogie: 12,
      drone: 1,
    };
    for (const [id, n] of Object.entries(counts)) {
      const entry =
        chordPattern(id as ChordPatternId) ?? bassPattern(id as BassPatternId);
      expect(entry, id).not.toBeNull();
      expect(entry.hits, id).toHaveLength(n);
    }
    let total = 0;
    for (const p of allPatterns()) total += p.hits.length;
    expect(total).toBe(66); // 35 chord + 31 bass, verbatim from D66
  });

  it("every hit: step < divisions, rank 0..5, accent in {0,1,2}, span != 0", () => {
    for (const p of allPatterns()) {
      for (const h of p.hits) {
        expect(h.step, `${p.id} step`).toBeLessThan(p.divisions);
        expect(h.step, `${p.id} step`).toBeGreaterThanOrEqual(0);
        expect(h.beat, `${p.id} beat`).toBeLessThan(p.repeat);
        expect(h.beat, `${p.id} beat`).toBeGreaterThanOrEqual(0);
        expect(h.rank, `${p.id} rank`).toBeGreaterThanOrEqual(0);
        expect(h.rank, `${p.id} rank`).toBeLessThanOrEqual(5);
        expect([0, 1, 2]).toContain(h.accent);
        expect(h.span, `${p.id} span`).not.toBe(0);
        if (p.kind === "chord" && p.toneMode === "cycle") {
          expect(h.voice, `${p.id} cycle voice`).toBeTypeOf("number");
        }
        if (p.kind === "bass") {
          expect(h.tone, `${p.id} bass tone`).toBeTypeOf("string");
        }
      }
    }
  });

  it("labels are ASCII + non-empty; feels are a subset of the FeelId enum", () => {
    const FEELS: readonly FeelId[] = [
      "straight",
      "lightSwing",
      "mediumSwing",
      "hardSwing",
      "shuffle",
    ];
    for (const p of allPatterns()) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.label, p.id).toMatch(ASCII_RE);
      expect(p.feel.length, p.id).toBeGreaterThan(0);
      for (const f of p.feel) expect(FEELS, `${p.id} feel`).toContain(f);
    }
  });

  it("honesty data pins: nextApproach ONLY on walking; freddieGreen caps at rank 2", () => {
    const approach = allPatterns().flatMap((p) =>
      p.hits.filter((h) => h.tone === "nextApproach").map(() => p.id),
    );
    expect(approach).toEqual(["walking"]);
    const freddie = chordPattern("freddieGreen");
    expect(freddie).not.toBeNull();
    expect(Math.max(...freddie.hits.map((h) => h.rank))).toBe(2);
  });

  it("every entry has >= 1 rank-0 anchor hit (density 0 is never silent on a sounding cell)", () => {
    for (const p of allPatterns()) {
      expect(p.hits.some((h) => h.rank === 0), p.id).toBe(true);
    }
  });

  it("PAD_PATTERN_ID is the sustain entry (the only pad-labeled pattern)", () => {
    expect(PAD_PATTERN_ID).toBe("sustain");
    const pad = chordPattern(PAD_PATTERN_ID);
    expect(pad).not.toBeNull();
    expect(pad.label).toContain("pad");
    expect(pad.feel).toHaveLength(5); // all five feels
  });
});

describe("SHIPPED-PROFILE AFFINITY PIN (D66 data integrity)", () => {
  it("every shipped profile's defaultFeel is in its bass+chord patterns' feel lists", () => {
    for (const profile of allStyleProfiles()) {
      const bass = bassPattern(profile.rhythm.bassPattern);
      const chords = chordPattern(profile.rhythm.chordPattern);
      expect(bass, `${profile.id} bass ${profile.rhythm.bassPattern}`).not.toBeNull();
      expect(chords, `${profile.id} chords ${profile.rhythm.chordPattern}`).not.toBeNull();
      expect(bass.feel, `${profile.id} bass feel`).toContain(profile.rhythm.defaultFeel);
      expect(chords.feel, `${profile.id} chords feel`).toContain(profile.rhythm.defaultFeel);
      // The pad pattern must also carry the profile's feel (it ships
      // with all five - this catches a future re-authoring mistake).
      const pad = chordPattern(PAD_PATTERN_ID);
      expect(pad.feel, `${profile.id} pad feel`).toContain(profile.rhythm.defaultFeel);
    }
  });
});

describe("meter tiling table (D66)", () => {
  const freddie = chordPattern("freddieGreen") as PatternEntry;
  const walking = bassPattern("walking") as PatternEntry;

  // B = floor(cellTicks / beatTicks), beatTicks = ppq quarters.
  const beatsFor = (ppq: number, num: number, den: number): number =>
    Math.floor(Math.round((num * ppq * 4) / den) / ppq);

  it("4/4 identity: every authored beat fires once", () => {
    expect(beatsFor(480, 4, 4)).toBe(4);
    const tiled = tiledHits(freddie, 4);
    expect(tiled).toHaveLength(4);
    expect(tiled.map((h) => h.beat).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("3/4 drops the beat-3 hits", () => {
    expect(beatsFor(480, 3, 4)).toBe(3);
    const tiled = tiledHits(freddie, 3);
    expect(tiled.map((h) => h.beat)).not.toContain(3);
    expect(tiled).toHaveLength(3);
  });

  it("5/4 tiles beat 0 out to beat 4 (repeat 4)", () => {
    expect(beatsFor(480, 5, 4)).toBe(5);
    const tiled = tiledHits(freddie, 5);
    const beats = tiled.map((h) => h.beat).sort((a, b) => a - b);
    expect(beats).toEqual([0, 1, 2, 3, 4]); // the beat-0 copy lands at 4
    const w = tiledHits(walking, 5);
    expect(w.some((h) => h.beat === 4 && h.tone === "root")).toBe(true);
  });

  it("6/8 = 3 quarter-beats", () => {
    expect(beatsFor(480, 6, 8)).toBe(3);
    const tiled = tiledHits(freddie, 3);
    expect(tiled.map((h) => h.beat).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("7/8 = 3 beats (floor of 3.5); the half-beat tail clamps at realization", () => {
    expect(beatsFor(480, 7, 8)).toBe(3); // round(1680)/480 floor = 3
    const tiled = tiledHits(freddie, 3);
    expect(tiled.some((h) => h.beat >= 3)).toBe(false);
  });

  it("tiling preserves authored hit order (hit-major, D69 alignment contract)", () => {
    const tiled = tiledHits(freddie, 8);
    // authored order is beats [0,2,1,3]; two tiles -> [0,4],[2,6],[1,5],[3,7]
    expect(tiled.map((h) => h.beat)).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
  });

  it("sustain/drone (span -1) survive tiling as a single anchor per cell", () => {
    const sus = chordPattern("sustain") as PatternEntry;
    expect(tiledHits(sus, 4)).toHaveLength(1);
    expect(tiledHits(sus, 4)[0].span).toBe(-1);
    const drone = bassPattern("drone") as PatternEntry;
    expect(tiledHits(drone, 5)).toHaveLength(1);
  });
});

describe("velocity tiers (D66)", () => {
  it("three tiers per role, all in (0, 1], monotone by accent", () => {
    for (const role of ["bass", "chords", "pad"] as const) {
      const tiers = PATTERN_VELOCITY[role];
      expect(tiers).toHaveLength(3);
      for (const v of tiers) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(tiers[0]).toBeLessThan(tiers[1]);
      expect(tiers[1]).toBeLessThan(tiers[2]);
    }
  });

  it("exact authored values (velocity is DATA, not a formula)", () => {
    expect([...PATTERN_VELOCITY.bass]).toEqual([0.7, 0.85, 0.95]);
    expect([...PATTERN_VELOCITY.chords]).toEqual([0.62, 0.78, 0.92]);
    expect([...PATTERN_VELOCITY.pad]).toEqual([0.5, 0.58, 0.65]);
  });
});
