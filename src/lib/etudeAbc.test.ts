/**
 * src/lib/etudeAbc.test.ts - PRD-001 Phase 3 Slice 2 (T3).
 *
 * Node project. Golden mini etude (hand-built, 2 bars, one
 * bar-crossing note) -> EXACT ABC string; barline count === bars + 1;
 * every bar's tokens sum to 8 eighths; tie tokens present iff a note
 * crosses; ASCII-only; transposeShift moves note names but not the
 * concert chord symbols.
 */

import { describe, it, expect } from "vitest";
import { buildEtudeAbc } from "./etudeAbc";
import { DEFAULT_ETUDE_CONSTRAINTS, generateEtudeFor } from "./etudeEngine";
import type { Etude, EtudeChord } from "../../engine/etude/types";
import { asCanonicalId, asInstanceId } from "../../engine/core/ids";

function chord(bar: number, name: string, rootPc: number, notes: number[]): EtudeChord {
  return { bar, numeral: name, rootPc, qualitySymbol: "maj7", name, notes };
}

const MINI: Etude = {
  version: 1,
  canonicalId: asCanonicalId("etu-golden"),
  instanceId: asInstanceId("i-golden-0000"),
  title: "Golden Two",
  tempo: 120,
  styleId: "jazz",
  key: 0,
  mode: "major",
  bars: 2,
  difficulty: 3,
  seed: 1,
  chords: [chord(0, "Cmaj7", 0, [60, 64, 67, 71]), chord(1, "G7", 7, [55, 59, 62, 65])],
  melody: [
    { slot: 0, midi: 60, durationSlots: 2, velocity: 0.85, strongBeat: true, syncopated: false },
    { slot: 2, midi: 62, durationSlots: 8, velocity: 0.65, strongBeat: true, syncopated: false },
    { slot: 10, midi: 64, durationSlots: 6, velocity: 0.85, strongBeat: true, syncopated: false },
  ],
  annotations: [],
  constraints: DEFAULT_ETUDE_CONSTRAINTS,
};

function barLines(abc: string): string[] {
  return abc.split("\n").filter((l) => l.startsWith("| "));
}

function barTokens(line: string): string[] {
  return line
    .replace(/\s"\^[^"]*"/, "") // drop the chord symbol (quoted)
    .replace(/\s*\|\]?\s*$/, "") // drop the closing barline
    .replace(/^\|\s+/, "")
    .split(/\s+/)
    .filter((t) => t !== "");
}

function tokenSlots(t: string): number {
  const core = t.replace(/^-/, "").replace(/-$/, "");
  const m = /\d+$/.exec(core);
  return m ? Number(m[0]) : 1;
}

function crossings(etude: Etude): number {
  return etude.melody.reduce(
    (sum, n) =>
      sum +
      (Math.floor((n.slot + n.durationSlots - 1) / 8) - Math.floor(n.slot / 8)),
    0,
  );
}

describe("buildEtudeAbc golden (2 bars, one bar-crossing note)", () => {
  it("exact ABC string", () => {
    expect(buildEtudeAbc(MINI)).toBe(
      [
        "X:etu-golden",
        "T:Golden Two",
        "M:4/4",
        "L:1/8",
        "Q:1/4=120",
        "K:C",
        '| "^Cmaj7" c2 d6-',
        '| "^G7" -d2 e6 |]',
      ].join("\n"),
    );
  });
});

describe("buildEtudeAbc structural invariants", () => {
  const generated = [4, 8, 16].map(
    (bars) => generateEtudeFor({ ...DEFAULT_ETUDE_CONSTRAINTS, bars, seed: 777 })!,
  );
  const all = [MINI, ...generated];

  it("barline count === bars + 1", () => {
    for (const etude of all) {
      const abc = buildEtudeAbc(etude);
      const pipes = (abc.match(/\|/g) ?? []).length;
      expect(pipes).toBe(etude.bars + 1);
    }
  });

  it("every bar's tokens sum to exactly 8 eighths", () => {
    for (const etude of all) {
      const lines = barLines(buildEtudeAbc(etude));
      expect(lines.length).toBe(etude.bars);
      for (const line of lines) {
        const total = barTokens(line).reduce((s, t) => s + tokenSlots(t), 0);
        expect(total).toBe(8);
      }
    }
  });

  it("tie tokens present iff a note crosses the barline", () => {
    for (const etude of all) {
      const tokens = barLines(buildEtudeAbc(etude)).flatMap(barTokens);
      const starts = tokens.filter((t) => /-$/.test(t)).length;
      const stops = tokens.filter((t) => /^-/.test(t)).length;
      const expected = crossings(etude);
      expect(starts).toBe(expected);
      expect(stops).toBe(expected);
    }
  });

  it("output is ASCII-only", () => {
    for (const etude of all) {
      expect(buildEtudeAbc(etude)).toMatch(/^[\x00-\x7F]*$/);
    }
  });

  it("transposeShift shifts note names; chord symbols stay concert", () => {
    const plain = buildEtudeAbc(MINI);
    const up2 = buildEtudeAbc(MINI, { transposeShift: 2 });
    expect(plain).toContain(" c2 ");
    expect(up2).toContain(" d2 "); // 60 + 2 = 62 -> d
    expect(up2).toContain('"^Cmaj7"'); // concert chord name unchanged
    expect(up2).toContain('"^G7"');
    // Header lines identical (tempo/title/id are pitch-independent).
    expect(up2.split("\n").slice(0, 6)).toEqual(plain.split("\n").slice(0, 6));
  });
});
