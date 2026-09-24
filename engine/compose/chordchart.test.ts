/**
 * engine/compose/chordchart.test.ts - PRD-001 Phase 4 Slice 4 (D83,
 * test plan 2). The chart-paste grammar, end to end, in the node env:
 * directives x4 (valid + every bad-value arm -> warning + null),
 * whitespace-token bars, `|` stripping, `%` repeat (mid + leading),
 * rest tokens, the 512-bar cap, the SLASH RULE all three arms
 * (RK-S4-4), non-fatal warnings with exact copy, the error arms,
 * buildChartSession shape (the D53 synthetic project + the Phase 5
 * ChordGrid seam), and DETERMINISM (double-run JSON byte-equality).
 */

import { describe, it, expect } from "vitest";
import { parseChordChart, buildChartSession, CHART_MAX_BARS, CHART_PPQ } from "./chordchart";
import type { ChordChart } from "./chordchart";
import { generateAccompaniment, gridFingerprint } from "./accompany";
import type { AccompanimentRequest, ChordGrid } from "./types";

function okChart(text: string): ChordChart {
  const out = parseChordChart(text);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}: ${out.error.message}`);
  return out.value;
}

function cellAt(chart: ChordChart, bar: number, slot: number) {
  return chart.grid.bars[bar].slots[slot];
}

describe("directives (REQ-IO-10)", () => {
  it("{key: C} -> major candidate, correlation 1 (a directive is certain)", () => {
    const c = okChart("{key: C}\nC F G");
    expect(c.directives.key).toEqual({ tonicPc: 0, mode: "major", correlation: 1 });
  });

  it("{key: Bb} / {key: F# minor} / {key: Cm} all honor the shared parseKey", () => {
    expect(okChart("{key: Bb}\nBb Eb").directives.key?.tonicPc).toBe(10);
    expect(okChart("{key: F# minor}\nF#m").directives.key?.mode).toBe("minor");
    expect(okChart("{key: Cm}\nCm").directives.key?.mode).toBe("minor"); // bare-m honor
  });

  it("directive names are case-insensitive; whitespace around the colon is legal", () => {
    const c = okChart("{KEY: Eb}\n{Tempo : 120}\nEb Bb7");
    expect(c.directives.key?.tonicPc).toBe(3);
    expect(c.directives.tempoBpm).toBe(120);
  });

  it("bad key value -> warning + null key (never fatal)", () => {
    const c = okChart("{key: banana}\nC F");
    expect(c.directives.key).toBeNull();
    expect(c.warnings.some((w) => w.includes("{key:}") && w.includes("banana"))).toBe(true);
  });

  it("modal key value is rejected (major/minor only)", () => {
    const c = okChart("{key: C lydian}\nC F");
    expect(c.directives.key).toBeNull();
    expect(c.warnings.length).toBe(1);
  });

  it("tempo: valid, out-of-range arms, and non-numeric all pinned", () => {
    expect(okChart("{tempo: 118}\nC").directives.tempoBpm).toBe(118);
    expect(okChart("{tempo: 19}\nC").directives.tempoBpm).toBeNull(); // < 20
    expect(okChart("{tempo: 301}\nC").directives.tempoBpm).toBeNull(); // > 300
    const bad = okChart("{tempo: allegro}\nC");
    expect(bad.directives.tempoBpm).toBeNull();
    expect(bad.warnings.some((w) => w.includes("{tempo:}"))).toBe(true);
  });

  it("time: 6/8 accepted; non-power-of-2 den and out-of-range num rejected", () => {
    expect(okChart("{time: 6/8}\nC D E F").directives.timeSignature).toEqual([6, 8]);
    expect(okChart("{time: 7/8}\nC").directives.timeSignature).toEqual([7, 8]);
    expect(okChart("{time: 5/5}\nC").directives.timeSignature).toBeNull();
    expect(okChart("{time: 0/4}\nC").directives.timeSignature).toBeNull();
    expect(okChart("{time: 4/3}\nC").directives.timeSignature).toBeNull();
  });

  it("time: two-digit denominators 16/32 parse (LOW-002 - the single-digit regex made VALID_DENOMS 16/32 dead)", () => {
    expect(okChart("{time: 4/16}\nC").directives.timeSignature).toEqual([4, 16]);
    expect(okChart("{time: 4/32}\nC").directives.timeSignature).toEqual([4, 32]);
    expect(okChart("{time: 4/12}\nC").directives.timeSignature).toBeNull(); // not power-of-2
    expect(okChart("{time: 4/64}\nC").directives.timeSignature).toBeNull(); // not in the list
  });

  it("style: shippedStyleIds membership ONLY", () => {
    expect(okChart("{style: jazz}\nC").directives.styleId).toBe("jazz");
    expect(okChart("{style: bossa}\nC").directives.styleId).toBeNull();
    expect(okChart("{style: bossa}\nC").warnings.some((w) => w.includes("shipped style"))).toBe(true);
  });

  it("unknown directive name -> warning, other directives survive", () => {
    const c = okChart("{groove: swing}\n{tempo: 90}\nC");
    expect(c.directives.tempoBpm).toBe(90);
    expect(c.warnings).toContain("unknown directive '{groove:}' ignored");
  });
});

describe("body tokens -> bars (REQ-IO-11/13)", () => {
  it("whitespace tokens are bars; newlines are whitespace", () => {
    const c = okChart("C Am\nF G");
    expect(c.bars).toBe(4);
    expect(c.grid.bars.map((b) => b.bar)).toEqual([0, 1, 2, 3]);
    expect(c.grid.slotsPerBar).toBe(1);
  });

  it("attached pipes '|C|Am|' strip to tokens C, Am (REQ-IO-13)", () => {
    const c = okChart("|C|Am|");
    expect(c.bars).toBe(2);
    expect(cellAt(c, 0, 0).name).toBe("C");
    expect(cellAt(c, 1, 0).name).toBe("Am");
  });

  it("bare pipes as separators '| C Am | F G' work identically", () => {
    const a = okChart("| C Am | F G |");
    expect(a.bars).toBe(4);
    expect(a.warnings).toEqual([]);
  });

  it("bar timing tiles at 4/4 ppq 480 (1920 ticks) and honors {time: 6/8} (1440)", () => {
    const four = okChart("C D E F");
    expect(four.grid.bars[2].startTick).toBe(2 * 1920);
    expect(four.grid.bars[2].endTick).toBe(3 * 1920);
    const six = okChart("{time: 6/8}\nC D E F");
    expect(six.grid.bars[3].endTick).toBe(4 * 1440);
  });

  it("512-bar cap -> unsupported 'chart too long' arm", () => {
    const tooLong = new Array(CHART_MAX_BARS + 1).fill("C").join(" ");
    const out = parseChordChart(tooLong);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("unsupported");
      expect(out.error.message).toContain("chart too long");
    }
    expect(parseChordChart(new Array(CHART_MAX_BARS).fill("C").join(" ")).ok).toBe(true);
  });
});

describe("% repeat + rest tokens (REQ-IO-12)", () => {
  it("'%' repeats the PREVIOUS bar's cells VERBATIM (incl. a 2-cell bar)", () => {
    const c = okChart("C/Am % F");
    expect(c.bars).toBe(3);
    expect(c.grid.bars[1].slots.length).toBe(2);
    expect(cellAt(c, 1, 0).name).toBe("C");
    expect(cellAt(c, 1, 1).name).toBe("Am");
    expect(c.warnings).toEqual([]);
  });

  it("leading '%' -> rest bar + warning (no previous)", () => {
    const c = okChart("% C");
    expect(c.grid.bars[0].slots[0].isRest).toBe(true);
    expect(c.warnings).toContain("bar 1: '%' repeat has no previous bar - rest used");
  });

  it("rest tokens - 0 r (case-insensitive) all yield restCell", () => {
    const c = okChart("- 0 R C");
    expect(c.bars).toBe(4);
    for (const b of [0, 1, 2]) expect(c.grid.bars[b].slots[0].isRest).toBe(true);
    expect(c.warnings).toEqual([]);
  });
});

describe("SLASH RULE - the deterministic whole-token-first arms (RK-S4-4)", () => {
  it("'C/G' parses WHOLE -> ONE cell with slash bass (chord tone honored)", () => {
    const c = okChart("C/G");
    expect(c.bars).toBe(1);
    expect(c.grid.bars[0].slots.length).toBe(1);
    expect(cellAt(c, 0, 0).rootPc).toBe(0);
    expect(cellAt(c, 0, 0).bassPc).toBe(7);
    expect(c.warnings).toEqual([]);
  });

  it("'C/Am' fails whole -> SPLITS into TWO cells; slotsPerBar becomes 2", () => {
    const c = okChart("C/Am F");
    expect(c.grid.bars[0].slots.length).toBe(2);
    expect(cellAt(c, 0, 0).rootPc).toBe(0);
    expect(cellAt(c, 0, 1).rootPc).toBe(9); // A minor
    expect(c.grid.slotsPerBar).toBe(2);
    expect(c.warnings).toEqual([]);
  });

  it("'Em7/A' - the doc-example erratum: A is NOT an Em7 chord tone, so the D61 grammar rejects it whole and the split rule lands TWO cells", () => {
    const c = okChart("Em7/A");
    expect(c.grid.bars[0].slots.length).toBe(2);
    expect(cellAt(c, 0, 0).rootPc).toBe(4); // Em7
    expect(cellAt(c, 0, 1).rootPc).toBe(9); // A minor
    expect(c.warnings).toEqual([]);
  });

  it("one-sided split 'C/junk' -> the parsing side LANDS + warning for the failing side (non-fatal)", () => {
    const c = okChart("C/junk");
    expect(c.grid.bars[0].slots.length).toBe(1);
    expect(cellAt(c, 0, 0).rootPc).toBe(0);
    expect(c.warnings).toContain("bar 1: 'junk' is not a chord symbol");
  });

  it("three-sided 'C/E/G' -> non-chord token (exactly-two-sides rule)", () => {
    const c = okChart("C/E/G D");
    expect(c.grid.bars[0].slots[0].isRest).toBe(true);
    expect(c.warnings).toContain("bar 1: 'C/E/G' is not a chord symbol");
  });

  it("slash-bass cells REACH the fingerprint (D89's justification, end-to-end)", () => {
    const c = okChart("C/G C");
    expect(gridFingerprint(c.grid)).toContain("0.maj/7");
  });
});

describe("non-chord tokens -> warnings, never errors (REQ-IO-15)", () => {
  it("junk lands a rest + the EXACT warning copy (1-based bar numbers)", () => {
    const c = okChart("C junk F");
    expect(c.bars).toBe(3);
    expect(c.grid.bars[1].slots[0].isRest).toBe(true);
    expect(c.warnings).toEqual(["bar 2: 'junk' is not a chord symbol"]);
  });

  it("non-ASCII token -> rejected with a warning that never echoes the bytes", () => {
    const c = okChart("C C\u2603 F"); // snowman
    expect(c.grid.bars[1].slots[0].isRest).toBe(true);
    expect(c.warnings).toEqual(["bar 2: non-ASCII token rejected"]);
  });

  it("EMPTY chart -> unsupported 'no chord symbols found'", () => {
    const out = parseChordChart("   \n\n  |  |  \n ");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toBe("no chord symbols found");
  });

  it("ALL-junk -> unsupported arm too (nothing sounding after parsing)", () => {
    const out = parseChordChart("junk nope - 0");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toBe("no chord symbols found");
  });

  it("a rest-heavy chart WITH one chord is LEGAL (warnings survive)", () => {
    const c = okChart("- junk C %");
    expect(c.bars).toBe(4);
    expect(c.warnings.length).toBe(1);
  });
});

describe("buildChartSession (D83/D53) - the synthetic project + analysis", () => {
  const chart = okChart("{key: Bb}\n{tempo: 132}\n{time: 6/8}\nBbmaj7 Gm7 Ebmaj7 Ab7");

  it("project: ppq 480, ONE tempo/meter from directives, tracks [], endTick = bars x ticksPerBar", () => {
    const { project } = buildChartSession(chart);
    expect(project.ppq).toBe(CHART_PPQ);
    expect(project.tempos).toEqual([{ tick: 0, bpm: 132 }]);
    expect(project.timeSignatures).toEqual([{ tick: 0, numerator: 6, denominator: 8 }]);
    expect(project.tracks).toEqual([]);
    expect(project.endTick).toBe(4 * 1440);
    expect(project.version).toBe(1);
    expect(project.durationSec).toBeGreaterThan(0);
  });

  it("defaults without directives: 120 BPM, 4/4, empty keySignatures", () => {
    const { project } = buildChartSession(okChart("C F"));
    expect(project.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(project.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
    expect(project.keySignatures).toEqual([]);
    expect(project.endTick).toBe(2 * 1920);
  });

  it("key directive -> keySignatures + candidates[0] correlation 1; NO directive -> chromaticFallback true", () => {
    const withKey = buildChartSession(chart);
    expect(withKey.analysis.key.candidates[0]).toEqual({ tonicPc: 10, mode: "major", correlation: 1 });
    expect(withKey.analysis.key.chromaticFallback).toBe(false);
    expect(withKey.project.keySignatures).toEqual([{ tick: 0, tonicPc: 10, mode: "major" }]);
    const noKey = buildChartSession(okChart("C F"));
    expect(noKey.analysis.key.chromaticFallback).toBe(true);
    expect(noKey.analysis.key.candidates).toEqual([]);
  });

  it("analysis shape: roles [], melody empty+synthesized, window = whole, honest chart annotation", () => {
    const { analysis } = buildChartSession(chart);
    expect(analysis.roles).toEqual([]);
    expect(analysis.melody.notes).toEqual([]);
    expect(analysis.melody.synthesized).toBe(true);
    expect(analysis.window).toEqual({ fromTick: 0, toTick: 4 * 1440 });
    expect(analysis.truncated).toBe(false);
    expect(analysis.annotations[0].text).toBe("Pasted chart: 4 bars in Bb major.");
  });

  it("THE SEAM (REQ-IO-16): the chart grid flows UNCHANGED into generateAccompaniment", () => {
    const { project, analysis } = buildChartSession(chart);
    const req: AccompanimentRequest = {
      version: 1,
      styleId: "jazz",
      roles: ["bass", "chords"],
      density: 3,
      seed: 42,
    };
    const out = generateAccompaniment(req, analysis.grid, project.ppq, analysis.key.candidates[0]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.meta.gridFingerprint).toBe(gridFingerprint(analysis.grid));
      expect(out.value.meta.bars).toBe(4);
    }
  });

  it("grid SHAPE compat (Phase 5): ChordChart.grid IS a ChordGrid - structural, no adapter", () => {
    const grid: ChordGrid = chart.grid; // compile-time assignment = shape proof
    expect(grid.bars.length).toBe(4);
    expect(grid.bars.every((b) => b.slots.length >= 1)).toBe(true);
  });
});

describe("determinism (HARD CONSTRAINT: chart-paste -> grid -> accompaniment seed-deterministic)", () => {
  const text = "{key: Eb}\n{tempo: 100}\nEbmaj7 Cm7 Fm7 Bb7 % Eb/Ab junk";

  it("parse double-run: JSON byte-equality", () => {
    const a = parseChordChart(text);
    const b = parseChordChart(text);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
  });

  it("session double-run: JSON byte-equality", () => {
    const chart = okChart(text);
    expect(JSON.stringify(buildChartSession(chart))).toBe(JSON.stringify(buildChartSession(chart)));
  });

  it("end-to-end: same chart + same seed -> IDENTICAL generated notes; different seed -> different", () => {
    const { project, analysis } = buildChartSession(okChart(text));
    const req = (seed: number): AccompanimentRequest => ({
      version: 1,
      styleId: "jazz",
      roles: ["bass", "chords", "pad"],
      density: 3,
      seed,
    });
    const gen = (seed: number) => {
      const out = generateAccompaniment(req(seed), analysis.grid, project.ppq, analysis.key.candidates[0]);
      if (!out.ok) throw new Error("generate failed");
      return JSON.stringify(out.value.generated);
    };
    expect(gen(7)).toBe(gen(7));
    expect(gen(7)).not.toBe(gen(8));
  });
});
