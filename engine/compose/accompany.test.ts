/**
 * engine/compose/accompany.test.ts - PRD-001 Phase 4 Slice 3 (test
 * plan 4, THE CONTRACT FILE).
 *
 * a. DETERMINISM MATRIX: 3 styles x 6 densities x 3 seeds x role-sets
 *    {bass, chords+pad, all}, each generated TWICE -> JSON.stringify
 *    byte-equality (etude precedent).
 * b. THINNING PROPERTIES (REQ-COMP-33): the density-d note set is a
 *    SUBSET (by exact tuple) of the d+1 set; pitches and positions
 *    NEVER change with density ("thins, NOT reshapes").
 * c. TD-043 PIN: variable-length bars (1,2,1,3,1 slots) read per-bar;
 *    cells tile exactly; every note lands inside its cell region.
 * d. SWING MAP: 0.5 identity; ppq 480 gd 4 ratio 0.64 -> slot 1 = 154
 *    (exact integer pin); monotone onsets over [0.5, 0.75].
 * e. REGISTER/COLLISION: every note inside its role register; no
 *    melody-role notes; the chords/pad/melody overlap band is by
 *    DESIGN (documented, not asserted away).
 * f. NOTE INVARIANTS: midi 0..127, tick >= 0, durationTicks >= 1,
 *    velocity 0..1, ascending within role, monophonic bass never
 *    overlaps.
 * g. TRANSPOSE: +12 shifts registers AND pitches exactly; the
 *    generator never sees original tracks (result shape proves it).
 * h. EDGE: all-rest grid -> ok arm, zero notes, honest annotation;
 *    empty roles -> unsupported; density 5 on freddieGreen == 2
 *    (pattern ceiling no-op).
 */

import { describe, it, expect } from "vitest";
import {
  cellGeometry,
  generateAccompaniment,
  gridFingerprint,
  planAccompaniment,
  realizePlan,
  swingOnsets,
} from "./accompany";
import { EMPTY_OVERRIDES, mergeAnalysis, restCell } from "./types";
import type { ComposeAnalysis } from "./types";
import type {
  AccompRole,
  AccompanimentRequest,
  ChordCell,
  ChordGrid,
  KeyCandidate,
  NormalizedNote,
} from "./types";

const PPQ = 480;
const BAR = 1920;
const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 0.9 };

function cell(rootPc: number, qualitySymbol: string, bassPc: number | null = null): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: `${rootPc}:${qualitySymbol}`,
    bassPc,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

/** 8 bars of the jazz ii-V-I corpus (single-slot bars). */
function iiVIGrid(bars = 8): ChordGrid {
  const prog: readonly ChordCell[] = [
    cell(0, "maj7"),
    cell(2, "m7"),
    cell(7, "dom7"),
    cell(0, "maj7"),
    cell(4, "dom7", 9),
    cell(5, "m7"),
    cell(9, "dom7"),
    cell(0, "maj7"),
  ];
  return {
    slotsPerBar: 1,
    bars: Array.from({ length: bars }, (_, b) => ({
      bar: b,
      startTick: b * BAR,
      endTick: (b + 1) * BAR,
      slots: [prog[b % prog.length]],
    })),
  };
}

/** Variable-length bars (1,2,1,3,1 slots) - the TD-043 shape the D60
 *  merge produces. */
function variableBarGrid(): ChordGrid {
  const slots: readonly (readonly ChordCell[])[] = [
    [cell(0, "maj7")],
    [cell(2, "m7"), cell(7, "dom7")],
    [cell(0, "maj7")],
    [cell(5, "m7"), cell(9, "dom7"), cell(0, "maj")],
    [cell(2, "m7")],
  ];
  return {
    slotsPerBar: 1,
    bars: slots.map((s, b) => ({
      bar: b,
      startTick: b * BAR,
      endTick: (b + 1) * BAR,
      slots: s,
    })),
  };
}

function req(
  over: Partial<AccompanimentRequest> & { roles: readonly AccompRole[] },
): AccompanimentRequest {
  return { version: 1, styleId: "jazz", density: 3, seed: 42, ...over };
}

function okResult(
  request: AccompanimentRequest,
  grid: ChordGrid = iiVIGrid(),
  key: KeyCandidate | null = C_MAJOR,
) {
  const out = generateAccompaniment(request, grid, PPQ, key);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}: ${out.error.message}`);
  return out.value;
}

function allNotes(result: ReturnType<typeof okResult>) {
  return [...result.generated.bass, ...result.generated.chords, ...result.generated.pad];
}

const STYLE_IDS = ["jazz", "pop", "classical"] as const;
const DENSITIES = [0, 1, 2, 3, 4, 5];
const SEEDS = [7, 42, 123456789];
const ROLE_SETS: readonly (readonly AccompRole[])[] = [
  ["bass"],
  ["chords", "pad"],
  ["bass", "chords", "pad"],
];

describe("a. DETERMINISM MATRIX (REQ-FND-3)", () => {
  it("3 styles x 6 densities x 3 seeds x 3 role-sets: byte-identical across double generation", () => {
    let cases = 0;
    for (const styleId of STYLE_IDS) {
      for (const density of DENSITIES) {
        for (const seed of SEEDS) {
          for (const roles of ROLE_SETS) {
            const r = req({ styleId, density, seed, roles });
            const a = JSON.stringify(okResult(r));
            const b = JSON.stringify(okResult(r));
            expect(a, `${styleId}/d${density}/s${seed}/${roles.join("+")}`).toBe(b);
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(162);
  });

  it("plan + realize split: realizing the SAME plan twice is byte-identical (zero rng in realize)", () => {
    const p1 = planAccompaniment(req({ roles: ["bass", "chords", "pad"] }), iiVIGrid(), PPQ, C_MAJOR);
    const p2 = planAccompaniment(req({ roles: ["bass", "chords", "pad"] }), iiVIGrid(), PPQ, C_MAJOR);
    expect(p1.ok).toBe(true);
    expect(p2.ok).toBe(true);
    if (p1.ok && p2.ok) {
      expect(JSON.stringify(p1.value)).toBe(JSON.stringify(p2.value));
      const a = JSON.stringify(realizePlan(p1.value));
      const b = JSON.stringify(realizePlan(p1.value));
      expect(a).toBe(b);
    }
  });

  it("drawCount is density-INDEPENDENT (D67: density never enters draw order)", () => {
    for (const styleId of STYLE_IDS) {
      const counts = DENSITIES.map((density) => {
        const p = planAccompaniment(
          req({ styleId, density, roles: ["bass", "chords"] }),
          iiVIGrid(),
          PPQ,
          C_MAJOR,
        );
        if (!p.ok) throw new Error("plan failed");
        return p.value.drawCount;
      });
      expect(new Set(counts).size, styleId).toBe(1);
    }
    // The jazz grid really draws (rootless bools + approach picks).
    const jazz = planAccompaniment(req({ styleId: "jazz", roles: ["bass", "chords"] }), iiVIGrid(), PPQ, C_MAJOR);
    expect(jazz.ok && jazz.value.drawCount).toBeGreaterThan(0);
  });

  it("different seeds change the realized output (approach picks differ)", () => {
    const a = okResult(req({ seed: 7, roles: ["bass"] }));
    const b = okResult(req({ seed: 8, roles: ["bass"] }));
    expect(JSON.stringify(a.generated)).not.toBe(JSON.stringify(b.generated));
  });
});

describe("b. THINNING PROPERTIES (REQ-COMP-33: thins, never reshapes)", () => {
  const grids: readonly { name: string; grid: ChordGrid }[] = [
    { name: "ii-V-I", grid: iiVIGrid() },
    {
      name: "with rests",
      grid: {
        slotsPerBar: 1,
        bars: [0, 1, 2, 3, 4, 5].map((b) => ({
          bar: b,
          startTick: b * BAR,
          endTick: (b + 1) * BAR,
          slots: [b === 2 ? restCell() : cell([0, 2, 5, 7, 9, 0][b], "m7")],
        })),
      },
    },
    { name: "variable bars", grid: variableBarGrid() },
  ];

  for (const { name, grid } of grids) {
    it(`${name}: density d notes are an EXACT-TUPLE SUBSET of density d+1, for every style x role-set`, () => {
      for (const styleId of STYLE_IDS) {
        for (const roles of ROLE_SETS) {
          for (let d = 0; d < 5; d++) {
            const lo = okResult(req({ styleId, density: d, roles }), grid);
            const hi = okResult(req({ styleId, density: d + 1, roles }), grid);
            for (const role of roles) {
              const loNotes = lo.generated[role];
              const hiSet = new Set(
                hi.generated[role].map((n) => `${n.tick}|${n.midi}|${n.durationTicks}|${n.velocity}`),
              );
              for (const n of loNotes) {
                expect(
                  hiSet.has(`${n.tick}|${n.midi}|${n.durationTicks}|${n.velocity}`),
                  `${styleId}/${role}/d${d}`,
                ).toBe(true);
              }
              expect(loNotes.length, `${styleId}/${role} monotone`).toBeLessThanOrEqual(
                hi.generated[role].length,
              );
            }
          }
        }
      }
    });
  }

  it("SUBSET PROPERTY ACROSS THE WHOLE LIBRARY x 0-5 (two-level plan swap, D67): every authored pattern - shipped or not - thins monotonically", () => {
    const base = planAccompaniment(req({ roles: ["bass", "chords", "pad"] }), iiVIGrid(), PPQ, C_MAJOR);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const all = [
      // 8 chord + 6 bass entries from the library (patterns.ts)
      ...(["freddieGreen", "charleston", "block", "pulse", "offbeat", "lazy", "sustain", "alberti"] as const),
    ];
    const bassIds = ["walking", "twoFeel", "rootFifth", "eighthPulse", "shuffleBoogie", "drone"] as const;
    const byTuple = (notes: readonly { tick: number; midi: number; durationTicks: number; velocity: number }[]) =>
      new Set(notes.map((n) => `${n.tick}|${n.midi}|${n.durationTicks}|${n.velocity}`));
    for (const chords of all) {
      for (const bass of bassIds) {
        for (let d = 0; d < 5; d++) {
          const plan = {
            ...base.value,
            density: d,
            patternIds: { bass, chords, pad: chords },
          };
          const lo = realizePlan(plan);
          const hi = realizePlan({ ...plan, density: d + 1 });
          for (const role of ["bass", "chords", "pad"] as const) {
            const hiSet = byTuple(hi.generated[role]);
            for (const n of lo.generated[role]) {
              expect(
                hiSet.has(`${n.tick}|${n.midi}|${n.durationTicks}|${n.velocity}`),
                `${chords}/${bass} d${d}->d${d + 1} ${role}`,
              ).toBe(true);
            }
            expect(lo.generated[role].length).toBeLessThanOrEqual(hi.generated[role].length);
          }
        }
      }
    }
  });

  it("pitches NEVER change with density (same (tick,midi) pairs, subset only grows)", () => {
    const base = okResult(req({ density: 5, roles: ["bass", "chords", "pad"] }));
    for (const d of [0, 1, 2, 3, 4]) {
      const thin = okResult(req({ density: d, roles: ["bass", "chords", "pad"] }));
      for (const role of ["bass", "chords", "pad"] as const) {
        const baseSet = new Set(base.generated[role].map((n) => `${n.tick}|${n.midi}`));
        for (const n of thin.generated[role]) {
          expect(baseSet.has(`${n.tick}|${n.midi}`), `d${d} ${role}`).toBe(true);
        }
      }
    }
  });
});

describe("c. TD-043 PIN (variable-length bars from the D60 append)", () => {
  const grid = variableBarGrid();

  it("per-bar slots are read (NOT grid.slotsPerBar)", () => {
    expect(grid.bars.map((b) => b.slots.length)).toEqual([1, 2, 1, 3, 1]);
    const geo = cellGeometry(grid, PPQ);
    expect(geo.map((b) => b.length)).toEqual([1, 2, 1, 3, 1]);
  });

  it("cells tile EXACTLY: no gaps, no overlaps, boundaries match the region", () => {
    for (const region of grid.bars) {
      const cells = cellGeometry(grid, PPQ)[region.bar];
      expect(cells[0].startTick).toBe(region.startTick);
      expect(cells[cells.length - 1].endTick).toBe(region.endTick);
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i].startTick).toBe(cells[i - 1].endTick);
        expect(cells[i].endTick).toBeGreaterThan(cells[i].startTick);
      }
    }
  });

  it("every generated note lands inside its own cell region", () => {
    const result = okResult(req({ roles: ["bass", "chords", "pad"] }), grid);
    const geo = cellGeometry(grid, PPQ);
    for (const role of ["bass", "chords", "pad"] as const) {
      for (const n of result.generated[role]) {
        const cellGeo = geo[n.bar][n.slot];
        expect(cellGeo, `${role} ${n.bar}:${n.slot}`).toBeDefined();
        expect(n.tick, `${role} bar ${n.bar} slot ${n.slot}`).toBeGreaterThanOrEqual(
          cellGeo.startTick,
        );
        expect(n.tick + n.durationTicks).toBeLessThanOrEqual(cellGeo.endTick);
      }
    }
  });

  it("a mergeGrid-APPENDED bar (D60 flow via mergeAnalysis) generates + stays byte-deterministic", () => {
    const base: ComposeAnalysis = {
      version: 1,
      roles: [],
      key: { candidates: [C_MAJOR], declared: null, chromaticFallback: false },
      melody: { sourceTrackIndex: null, synthesized: true, notes: [] },
      grid: iiVIGrid(4),
      window: { fromTick: 0, toTick: 4 * BAR },
      truncated: false,
      percussionOnly: false,
      annotations: [],
    };
    const patched = mergeAnalysis(base, {
      ...EMPTY_OVERRIDES,
      chordCells: { "1:1": cell(9, "dom7"), "1:2": cell(0, "maj") },
    }).grid;
    expect(patched.bars[1].slots.length).toBe(3); // appended past the 1-slot bar
    const r = req({ roles: ["bass", "chords", "pad"] });
    expect(JSON.stringify(okResult(r, patched))).toBe(JSON.stringify(okResult(r, patched)));
  });

  it("byte-deterministic across runs on the variable grid", () => {
    const r = req({ roles: ["bass", "chords", "pad"] });
    expect(JSON.stringify(okResult(r, grid))).toBe(JSON.stringify(okResult(r, grid)));
  });
});

describe("d. SWING MAP (first real consumer of swingRatio/gridDivisions)", () => {
  it("swingRatio 0.5 is the EXACT straight identity (pinned)", () => {
    const rmap = swingOnsets(4, 4, PPQ, 0.5, 4 * PPQ);
    for (let g = 0; g <= 16; g++) {
      expect(rmap[g], `g${g}`).toBe(g * (PPQ / 4));
    }
    const rmap2 = swingOnsets(4, 2, PPQ, 0.5, 4 * PPQ);
    for (let g = 0; g <= 8; g++) expect(rmap2[g]).toBe(g * (PPQ / 2));
  });

  it("ppq 480, gd 4, ratio 0.64 -> slot 1 = 154 (exact integer pin)", () => {
    const rmap = swingOnsets(4, 4, 480, 0.64, 1920);
    expect(rmap[1]).toBe(154); // round(0.64 * 240) = 154
    expect(rmap[0]).toBe(0);
    expect(rmap[2]).toBe(240);
    expect(rmap[3]).toBe(394); // 240 + 154
    expect(rmap[4]).toBe(480); // next beat lands straight
    expect(rmap[16]).toBe(1920); // tail = cell end
  });

  it("monotone onset map over the validator range [0.5, 0.75] (odd ppq included)", () => {
    for (const ppq of [91, 96, 192, 480]) {
      for (const gd of [2, 4]) {
        for (const ratio of [0.5, 0.58, 0.64, 0.7, 0.75]) {
          const rmap = swingOnsets(3, gd, ppq, ratio, 3 * ppq);
          for (let g = 1; g < rmap.length; g++) {
            expect(rmap[g], `ppq${ppq} gd${gd} r${ratio} g${g}`).toBeGreaterThanOrEqual(rmap[g - 1]);
          }
        }
      }
    }
  });

  it("gridDivisions upscales finer-grid patterns: pop (gd 4) realizes the div-2 block pattern at beat-aligned slots with span scaled", () => {
    const grid: ChordGrid = {
      slotsPerBar: 1,
      bars: [{ bar: 0, startTick: 0, endTick: BAR, slots: [cell(2, "m7")] }],
    };
    const pop = okResult(req({ styleId: "pop", density: 5, roles: ["chords"] }), grid);
    // block (divisions 2) under gridDivisions 4: hits at beats 0,1,2,3 ->
    // slots beat*4 + step*2; positions stay beat-aligned, durations scale.
    const ticks = pop.generated.chords.map((n) => n.tick);
    for (const t of ticks) expect(t % 480).toBe(0);
    expect(new Set(ticks).size).toBe(4); // four distinct beats fire
  });

  it("swingRatio reaches the meta (swingRatioApplied) - the field is consumed, not decorative", () => {
    const jazz = okResult(req({ styleId: "jazz", roles: ["chords"] }));
    const pop = okResult(req({ styleId: "pop", roles: ["chords"] }));
    expect(jazz.meta.swingRatioApplied).toBe(0.64);
    expect(pop.meta.swingRatioApplied).toBe(0.5);
    expect(jazz.meta.gridDivisions).toBe(2);
    expect(pop.meta.gridDivisions).toBe(4);
  });
});

describe("e. REGISTER / COLLISION (task item 10, D71)", () => {
  it("every generated note is inside its role's (post-offset) register - property over the matrix", () => {
    for (const styleId of STYLE_IDS) {
      for (const seed of SEEDS) {
        const result = okResult(req({ styleId, seed, roles: ["bass", "chords", "pad"] }));
        for (const role of ["bass", "chords", "pad"] as const) {
          const [lo, hi] = result.meta.registersUsed[role];
          for (const n of result.generated[role]) {
            expect(n.midi, `${styleId}/${role}`).toBeGreaterThanOrEqual(lo);
            expect(n.midi, `${styleId}/${role}`).toBeLessThanOrEqual(hi);
          }
        }
      }
    }
  });

  it("the generator never emits a melody-role note; exactly 3 role buckets", () => {
    const result = okResult(req({ roles: ["bass", "chords", "pad"] }));
    expect(Object.keys(result.generated).sort()).toEqual(["bass", "chords", "pad"]);
    expect(Object.keys(result.meta.noteCounts).sort()).toEqual(["bass", "chords", "pad"]);
    for (const n of allNotes(result)) {
      expect(["bass", "chords", "pad"]).toContain(n.role);
    }
  });

  it("register collision policy (DOCUMENTED, by design): chords [48,72] and pad [60,84] overlap the melody band [60,86]; S3 has NO dynamic melody-avoidance (S4's mixer handles masking).", () => {
    const result = okResult(req({ roles: ["chords", "pad"] }));
    const melodyBand: [number, number] = [60, 86];
    const inBand = allNotes(result).filter(
      (n) => n.midi >= melodyBand[0] && n.midi <= melodyBand[1],
    );
    expect(inBand.length).toBeGreaterThan(0); // overlap is EXPECTED, not a violation
  });
});

describe("f. NOTE INVARIANTS", () => {
  it("midi 0..127, tick >= 0, durationTicks >= 1, velocity 0..1, ascending within role", () => {
    for (const styleId of STYLE_IDS) {
      for (const density of [0, 3, 5]) {
        const result = okResult(req({ styleId, density, roles: ["bass", "chords", "pad"] }));
        for (const role of ["bass", "chords", "pad"] as const) {
          const notes = result.generated[role];
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            expect(n.midi).toBeGreaterThanOrEqual(0);
            expect(n.midi).toBeLessThanOrEqual(127);
            expect(n.tick).toBeGreaterThanOrEqual(0);
            expect(n.durationTicks).toBeGreaterThanOrEqual(1);
            expect(n.velocity).toBeGreaterThan(0);
            expect(n.velocity).toBeLessThanOrEqual(1);
            if (i > 0) {
              expect(n.tick * 128 + n.midi).toBeGreaterThanOrEqual(
                notes[i - 1].tick * 128 + notes[i - 1].midi,
              ); // (tick, midi) ascending
            }
          }
        }
      }
    }
  });

  it("monophonic bass never overlaps (shipped bass patterns x meters x densities)", () => {
    for (const meters of [[4, 4], [3, 4], [5, 4], [6, 8], [7, 8]] as const) {
      const barTicks = Math.round((meters[0] * PPQ * 4) / meters[1]);
      const grid: ChordGrid = {
        slotsPerBar: 1,
        bars: Array.from({ length: 6 }, (_, b) => ({
          bar: b,
          startTick: b * barTicks,
          endTick: (b + 1) * barTicks,
          slots: [cell([2, 7, 0, 5, 9, 0][b], b % 2 === 0 ? "m7" : "dom7")],
        })),
      };
      for (const styleId of STYLE_IDS) {
        for (const density of [0, 2, 5]) {
          const result = okResult(req({ styleId, density, roles: ["bass"] }), grid);
          const notes = result.generated.bass;
          for (let i = 1; i < notes.length; i++) {
            expect(
              notes[i].tick,
              `${styleId} ${meters.join("/")} d${density} overlap`,
            ).toBeGreaterThanOrEqual(notes[i - 1].tick + notes[i - 1].durationTicks);
          }
        }
      }
    }
  });
});

describe("g. TRANSPOSE (REQ-TRANS-3)", () => {
  it("+12 shifts registers AND pitches exactly", () => {
    const plain = okResult(req({ roles: ["bass", "chords", "pad"], transposeAccompaniment: 0 }));
    const up = okResult(req({ roles: ["bass", "chords", "pad"], transposeAccompaniment: 12 }));
    for (const role of ["bass", "chords", "pad"] as const) {
      expect(up.meta.registersUsed[role][0]).toBe(plain.meta.registersUsed[role][0] + 12);
      expect(up.meta.registersUsed[role][1]).toBe(plain.meta.registersUsed[role][1] + 12);
      expect(up.generated[role].map((n) => n.midi - 12)).toEqual(
        plain.generated[role].map((n) => n.midi),
      );
      expect(up.generated[role].map((n) => n.tick)).toEqual(plain.generated[role].map((n) => n.tick));
    }
    expect(up.meta.transpose).toBe(12);
  });

  it("the generator never sees original tracks: the result carries NO melody/original field", () => {
    const result = okResult(req({ roles: ["bass", "chords", "pad"] }));
    expect(Object.keys(result).sort()).toEqual(["annotations", "generated", "meta", "version"]);
    expect("original" in result).toBe(false); // PRD 11.1 deviation (D71): fingerprint, not embedding
    expect(result.meta.gridFingerprint).toBe(gridFingerprint(iiVIGrid()));
  });
});

describe("h. EDGE ARMS", () => {
  it("all-rest grid -> ok arm, zero notes, honest annotation (never an error)", () => {
    const grid: ChordGrid = {
      slotsPerBar: 1,
      bars: [0, 1, 2].map((b) => ({
        bar: b,
        startTick: b * BAR,
        endTick: (b + 1) * BAR,
        slots: [restCell()],
      })),
    };
    const out = generateAccompaniment(req({ roles: ["bass", "chords", "pad"] }), grid, PPQ, C_MAJOR);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(allNotes(out.value)).toEqual([]);
    const dead = out.value.annotations.find((a) => a.id === "ann-acc-empty-0");
    expect(dead).toBeDefined();
    expect(dead!.text).toContain("No chords to accompany yet - enter chords first.");
    expect(dead!.target.kind).toBe("melody");
  });

  it("zero-bar grid -> ok with zero notes + honest annotation", () => {
    const out = generateAccompaniment(
      req({ roles: ["chords"] }),
      { slotsPerBar: 1, bars: [] },
      PPQ,
      C_MAJOR,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(allNotes(out.value)).toEqual([]);
    expect(out.value.annotations.some((a) => a.id === "ann-acc-empty-0")).toBe(true);
  });

  it("empty roles -> unsupported arm (validated, never throws)", () => {
    const out = generateAccompaniment(req({ roles: [] }), iiVIGrid(), PPQ, C_MAJOR);
    expect(!out.ok && out.error.code).toBe("unsupported");
  });

  it("bad density / seed / unshipped style -> unsupported arms", () => {
    expect(generateAccompaniment(req({ roles: ["bass"], density: 6 }), iiVIGrid(), PPQ, null).ok).toBe(false);
    expect(generateAccompaniment(req({ roles: ["bass"], seed: -1 }), iiVIGrid(), PPQ, null).ok).toBe(false);
    const lofi = generateAccompaniment(
      req({ roles: ["bass"], styleId: "lofi" as never }),
      iiVIGrid(),
      PPQ,
      null,
    );
    expect(!lofi.ok && lofi.error.code).toBe("unsupported");
  });

  it("density 5 on freddieGreen == density 2 (pattern ceiling no-op)", () => {
    const d2 = okResult(req({ styleId: "jazz", density: 2, roles: ["chords"] }));
    const d5 = okResult(req({ styleId: "jazz", density: 5, roles: ["chords"] }));
    expect(d2.meta.patternIds.chords).toBe("freddieGreen");
    expect(JSON.stringify(d2.generated)).toBe(JSON.stringify(d5.generated));
  });

  it("unknown quality cells are silent + counted (defensive, D68 rule 7)", () => {
    const grid: ChordGrid = {
      slotsPerBar: 1,
      bars: [0, 1].map((b) => ({
        bar: b,
        startTick: b * BAR,
        endTick: (b + 1) * BAR,
        slots: [b === 0 ? cell(0, "made-up") : cell(2, "m7")],
      })),
    };
    const result = okResult(req({ roles: ["bass", "chords"] }), grid);
    expect(result.meta.unknownQualityCount).toBe(1);
    for (const n of allNotes(result)) expect(n.bar).toBe(1); // bar 0 silent everywhere
  });

  it("fingerprint staleness: one cell edit changes it (gridFingerprint sensitivity + stability)", () => {
    const a = gridFingerprint(iiVIGrid());
    const edited: ChordGrid = {
      slotsPerBar: 1,
      bars: iiVIGrid().bars.map((r, i) => (i === 3 ? { ...r, slots: [cell(5, "m7")] } : r)),
    };
    expect(gridFingerprint(edited)).not.toBe(a);
    expect(gridFingerprint(iiVIGrid())).toBe(a);
  });

  // D89 (TD-044 CLOSED): chart paste makes slash-bass cells REACHABLE
  // ("Em7/A"), so a bassPc-only edit MUST invalidate the chip.
  it("fingerprint honors bassPc: a slash-bass-only edit changes it (D89)", () => {
    const a = gridFingerprint(iiVIGrid());
    const slashed: ChordGrid = {
      slotsPerBar: 1,
      bars: iiVIGrid().bars.map((r, i) => (i === 2 ? { ...r, slots: [cell(4, "maj7", 9)] } : r)),
    };
    expect(gridFingerprint(slashed)).not.toBe(a);
    // The bassPc serializes into the tuple with the documented "/pc" form.
    expect(gridFingerprint(slashed)).toContain("4.maj7/9");
    // Stability: the SAME slashed grid yields the SAME string.
    expect(gridFingerprint(slashed)).toBe(gridFingerprint(slashed));
    // bassPc null stays un-suffixed (no "/null" drift on plain cells).
    const plain: ChordGrid = {
      slotsPerBar: 1,
      bars: [{ bar: 0, startTick: 0, endTick: 1920, slots: [cell(0, "maj7")] }],
    };
    expect(gridFingerprint(plain)).toBe("0:0.maj7");
  });

  it("fingerprint: rest cells ignore bassPc noise (rests serialize as 'rest')", () => {
    const rested: ChordGrid = {
      slotsPerBar: 1,
      bars: [{ bar: 0, startTick: 0, endTick: 1920, slots: [cell(0, "maj7", 5)] }],
    };
    const restedSame: ChordGrid = {
      slotsPerBar: 1,
      bars: [{ bar: 0, startTick: 0, endTick: 1920, slots: [{ ...restCell(), bassPc: 7 }] }],
    };
    expect(gridFingerprint(rested)).toContain("0.maj7/5");
    expect(gridFingerprint(restedSame)).toBe("0:rest");
  });
});

describe("annotations truthfulness (D74 negatives)", () => {
  it("pop request: NO annotation mentions walking or swing", () => {
    const result = okResult(req({ styleId: "pop", density: 5, roles: ["bass", "chords", "pad"] }));
    for (const a of result.annotations) {
      expect(a.text.toLowerCase(), a.id).not.toContain("walking");
      expect(a.text.toLowerCase(), a.id).not.toContain("swing");
    }
  });

  it("bass role off -> zero rootless annotations", () => {
    const result = okResult(req({ styleId: "jazz", density: 3, roles: ["chords", "pad"] }));
    expect(result.annotations.filter((a) => a.id.startsWith("ann-acc-rootless"))).toEqual([]);
  });

  // MED-4: the two rootless guards (bass-role ON + realized pitches
  // exclude the root) were only ever exercised TOGETHER by real plans
  // (a real plan never sets rootlessFlags with bass off, and a real
  // rootless flag always excludes the root) - removing EITHER guard
  // survived the old suite. Hand-built realizePlan fixtures pin each
  // guard ALONE; the positive control proves the fixtures are not
  // vacuous.
  const oneBarDm7: ChordGrid = {
    slotsPerBar: 1,
    bars: [{ bar: 0, startTick: 0, endTick: BAR, slots: [cell(2, "m7")] }],
  };
  const NO_ROOT = [[[53, 57, 60, 65]]]; // bar0/slot0: F A C G - Dm7 rootless (no D)
  const WITH_ROOT = [[[50, 53, 57, 60]]]; // bar0/slot0: D F A C - root IS heard

  function rootlessAnnotationsOf(plan: Parameters<typeof realizePlan>[0]) {
    return realizePlan(plan).annotations.filter((a) => a.id.startsWith("ann-acc-rootless"));
  }

  it("MED-4 control: bass ON + flag true + root absent -> annotation DOES fire", () => {
    const base = planAccompaniment(req({ roles: ["bass", "chords"] }), oneBarDm7, PPQ, C_MAJOR);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const plan = { ...base.value, rootlessFlags: [[true]], voicings: { chords: NO_ROOT, pad: [] } };
    const anns = rootlessAnnotationsOf(plan);
    expect(anns).toHaveLength(1);
    expect(anns[0].text).toContain("Rootless voicing");
    expect(anns[0].text).toContain("bass covers the root");
  });

  it("MED-4 guard A ALONE: bass role OFF + flag TRUE + root absent -> still zero annotations", () => {
    // Only the role guard stands between this plan and a false claim
    // (flags true, realized pitches exclude the root - guard B passes).
    const base = planAccompaniment(req({ roles: ["chords"] }), oneBarDm7, PPQ, C_MAJOR);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const plan = { ...base.value, rootlessFlags: [[true]], voicings: { chords: NO_ROOT, pad: [] } };
    expect(rootlessAnnotationsOf(plan)).toEqual([]);
  });

  it("MED-4 guard B ALONE: bass ON + flag TRUE + root PRESENT -> zero annotations", () => {
    // Only the realized-root guard stands between this plan and a
    // claim contradicted by the heard pitches (root IS in the voicing).
    const base = planAccompaniment(req({ roles: ["bass", "chords"] }), oneBarDm7, PPQ, C_MAJOR);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const plan = { ...base.value, rootlessFlags: [[true]], voicings: { chords: WITH_ROOT, pad: [] } };
    expect(rootlessAnnotationsOf(plan)).toEqual([]);
  });

  it("keyless: 'Stepwise approach' never appears (chromatic-only set)", () => {
    const result = okResult(req({ roles: ["bass"] }), iiVIGrid(), null);
    for (const a of result.annotations) {
      expect(a.text, a.id).not.toContain("Stepwise");
    }
  });

  it("density-0 freddieGreen annotation says anchor-only when the note count proves it", () => {
    const result = okResult(req({ styleId: "jazz", density: 0, roles: ["chords"] }));
    const line = result.annotations.find((a) => a.id === "ann-acc-pattern-chords-0");
    expect(line).toBeDefined();
    expect(line!.text).toContain("anchor hits only");
    const bars = new Set(result.generated.chords.map((n) => n.bar));
    expect(bars.size).toBe(8); // every bar fires exactly its anchor
  });

  it("walking concept link only when the realized bass IS walking (>= 3 distinct pitches/bar)", () => {
    const full = okResult(req({ styleId: "jazz", density: 2, roles: ["bass"] }));
    const line = full.annotations.find((a) => a.id === "ann-acc-pattern-bass-0");
    expect(line!.conceptId).toBe("walking-bass"); // density 2 fires root+third+fifth
    const thin = okResult(req({ styleId: "jazz", density: 0, roles: ["bass"] }));
    const tline = thin.annotations.find((a) => a.id === "ann-acc-pattern-bass-0");
    expect(tline!.conceptId).toBeNull();
    expect(tline!.text).toContain("not a full walking line");
  });

  it("MED-1 REGRESSION: density-5 on a rests grid NEVER claims 'thinned' (rests are not hit positions)", () => {
    // The thinning DENOMINATOR (fullHits) counts only SOUNDING cells.
    // Pre-fix, rest-cell hits inflated it, so a fully-fired density-5
    // pass over a grid with rests falsely claimed "thinned to 16/24".
    const grid: ChordGrid = {
      slotsPerBar: 1,
      bars: [0, 1, 2, 3, 4, 5].map((b) => ({
        bar: b,
        startTick: b * BAR,
        endTick: (b + 1) * BAR,
        slots: [b === 2 || b === 5 ? restCell() : cell(2, "m7")],
      })),
    };
    const result = okResult(
      req({ styleId: "jazz", density: 5, roles: ["bass", "chords", "pad"] }),
      grid,
    );
    // Non-vacuity: the grid really carries 2 rest bars and notes fired.
    expect(grid.bars.filter((r) => r.slots.some((c) => c.isRest))).toHaveLength(2);
    expect(result.meta.noteCounts.chords).toBeGreaterThan(0);
    for (const a of result.annotations) {
      expect(a.text, a.id).not.toContain("thinned");
    }
  });

  it("MED-1 companion: GENUINE thinning (density below the pattern ceiling) still claims it", () => {
    // freddieGreen ranks 0,1,2,2 on an ALL-SOUNDING 8-bar grid:
    // density 1 fires 16 of 32 hit positions - the claim must appear
    // with the exact data-derived fraction.
    const result = okResult(req({ styleId: "jazz", density: 1, roles: ["chords"] }));
    const line = result.annotations.find((a) => a.id === "ann-acc-pattern-chords-0");
    expect(line).toBeDefined();
    const m = line!.text.match(/thinned to (\d+)\/(\d+) hit positions/);
    expect(m, line!.text).not.toBeNull();
    expect(Number(m![2])).toBe(32); // 8 bars x 4 authored hits, zero rests
    expect(Number(m![1])).toBe(16); // ranks 0+1 fire at density 1
  });

  it("MED-2 (D74 #5) POSITIVE: quartalFallbackCount > 0 -> honest progression-level annotation", () => {
    // No shipped profile is quartal, so the branch is pinned via a
    // HAND-BUILT plan (base jazz plan + count override). The plan
    // carries only the COUNT (voicing.ts never records which cells
    // fell back), so the target is progression-level - honest N,
    // never silent.
    const base = planAccompaniment(req({ roles: ["chords"] }), iiVIGrid(), PPQ, C_MAJOR);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const plan = { ...base.value, quartalFallbackCount: 3 };
    const { annotations } = realizePlan(plan);
    const line = annotations.find((a) => a.id === "ann-acc-quartal-0");
    expect(line).toBeDefined();
    expect(line!.text).toBe("Quartal stack unavailable on 3 bars - close voicing used.");
    expect(line!.target).toEqual({ kind: "progression", fromBar: 0, toBar: 7 });
    expect(line!.label.length).toBeLessThanOrEqual(40);
  });

  it("MED-2 (D74 #5) NEGATIVE: count 0 -> annotation absent (all shipped styles included)", () => {
    for (const styleId of STYLE_IDS) {
      const result = okResult(req({ styleId, roles: ["bass", "chords", "pad"] }));
      expect(result.meta.quartalFallbackCount, styleId).toBe(0);
      expect(
        result.annotations.filter((a) => a.id.startsWith("ann-acc-quartal")),
        styleId,
      ).toEqual([]);
    }
  });

  it("every emitted conceptId resolves in the registry", async () => {
    const { getConcept } = await import("../pedagogy/concepts");
    for (const styleId of STYLE_IDS) {
      for (const density of [0, 2, 5]) {
        const result = okResult(req({ styleId, density, roles: ["bass", "chords", "pad"] }));
        for (const a of result.annotations) {
          if (a.conceptId !== null) {
            expect(getConcept(a.conceptId), `${styleId}/d${density} ${a.id}`).not.toBeNull();
          }
        }
      }
    }
  });

  it("annotation ids are unique + pattern-shaped; labels fit the 40-char chip budget", () => {
    const result = okResult(req({ roles: ["bass", "chords", "pad"] }));
    const ids = result.annotations.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of result.annotations) {
      expect(a.id).toMatch(/^ann-acc-[a-z0-9-]+$/);
      expect(a.label.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("result shape (D71)", () => {
  it("GeneratedNote IS a NormalizedNote + role/bar/slot provenance", () => {
    const result = okResult(req({ roles: ["bass", "chords"] }));
    const n = result.generated.chords[0];
    const asNormalized: NormalizedNote = {
      midi: n.midi,
      tick: n.tick,
      durationTicks: n.durationTicks,
      velocity: n.velocity,
    };
    expect(asNormalized.midi).toBe(n.midi);
    expect(typeof n.bar).toBe("number");
    expect(typeof n.slot).toBe("number");
    expect(n.role).toBe("chords");
  });

  it("version literals: request/plan/result/meta all version 1", () => {
    const r = req({ roles: ["chords"] });
    const result = okResult(r);
    expect(r.version).toBe(1);
    expect(result.version).toBe(1);
    expect(result.meta.version).toBe(1);
    const p = planAccompaniment(r, iiVIGrid(), PPQ, C_MAJOR);
    expect(p.ok && p.value.version).toBe(1);
  });
});
