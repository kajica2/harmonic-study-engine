/**
 * engine/etude/assemble.test.ts - PRD-001 Phase 3 Slice 1 (test plan 3).
 *
 * Validator accept/reject table, lossless JSON round-trip, canonicalId
 * stability (clock- and key-order-independent), instanceId sensitivity,
 * etudeToSteps shape, and the validate -> feasibility -> RangeError
 * last-resort contract.
 */

import { describe, it, expect } from "vitest";
import { generateEtude, etudeToSteps, feasibilityOf } from "./assemble";
import { validateEtudeConstraints } from "./types";
import type { EtudeConstraints } from "./types";

const CLOCK = { nowMs: 1_700_000_000_000, seq: 1 };

function valid(over: Partial<EtudeConstraints> = {}): EtudeConstraints {
  return {
    version: 1,
    styleId: "jazz",
    key: 0,
    mode: "major",
    difficulty: 3,
    bars: 8,
    tempo: null,
    seed: 42,
    harmony: { allowedQualities: null, allowedNumerals: null, startOn: null, endOn: null, requireChromaticism: false },
    melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: null },
    rhythm: { straightRhythmsOnly: false },
    ...over,
  };
}

describe("validateEtudeConstraints accept/reject table", () => {
  it("accepts a well-formed constraint set", () => {
    expect(validateEtudeConstraints(valid()).ok).toBe(true);
    expect(validateEtudeConstraints(valid({ key: 11, bars: 32, tempo: 120, mode: "minor" })).ok).toBe(true);
    expect(validateEtudeConstraints(
      valid({ harmony: { allowedQualities: ["7", "m7"], allowedNumerals: ["ii7", "bII7"], startOn: "ii7", endOn: "V7", requireChromaticism: true } }),
    ).ok).toBe(true);
  });

  const rejects: Array<[string, Record<string, unknown>]> = [
    ["bad key 12", { key: 12 }],
    ["key -1", { key: -1 }],
    ["bars 33", { bars: 33 }],
    ["bars 3", { bars: 3 }],
    ["bars non-integer", { bars: 8.5 }],
    ["difficulty 0", { difficulty: 0 }],
    ["difficulty 6", { difficulty: 6 }],
    ["unshipped styleId lofi", { styleId: "lofi" }],
    ["bad mode", { mode: "dorian" }],
    ["negative seed", { seed: -1 }],
    ["seed > uint32", { seed: 4294967296 }],
    ["version 2", { version: 2 }],
    ["tempo 400", { tempo: 400 }],
  ];
  for (const [name, over] of rejects) {
    it(`rejects ${name}`, () => {
      const v = validateEtudeConstraints({ ...valid(), ...over });
      expect(v.ok).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    });
  }

  it("rejects an unparseable endOn token with a prefixed error path", () => {
    const v = validateEtudeConstraints(
      valid({ harmony: { allowedQualities: null, allowedNumerals: null, startOn: null, endOn: "W7", requireChromaticism: false } }),
    );
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.startsWith("c.harmony.endOn"))).toBe(true);
  });

  it("rejects non-integer / coercible tempo values (type-hole table, fix round)", () => {
    // [name, tempo, accepted]. The old check used global isFinite,
    // which COERCES: isFinite("120") === true, so string tempos sailed
    // through. Now: null or an integer in (0, 400), nothing else.
    const cases: Array<[string, unknown, boolean]> = [
      ["null (profile fallback)", null, true],
      ["integer 120", 120, true],
      ["integer 1", 1, true],
      ["integer 399", 399, true],
      ["string '120'", "120", false],
      ["empty string", "", false],
      ["NaN", NaN, false],
      ["Infinity", Infinity, false],
      ["1e9 (out of range)", 1e9, false],
      ["-1", -1, false],
      ["0", 0, false],
      ["400 (boundary)", 400, false],
      ["120.5 non-integer", 120.5, false],
      ["undefined", undefined, false],
    ];
    for (const [name, tempo, accepted] of cases) {
      const v = validateEtudeConstraints({ ...valid(), tempo });
      expect(v.ok, `tempo ${name}`).toBe(accepted);
      if (!accepted) expect(v.errors.some((e) => e.startsWith("c.tempo")), `tempo ${name}`).toBe(true);
    }
  });

  it("rejects non-objects and reports prefixed paths", () => {
    expect(validateEtudeConstraints(null).ok).toBe(false);
    expect(validateEtudeConstraints("nope").errors[0]).toBe("c must be an object");
    const v = validateEtudeConstraints(valid({ bars: 99 }));
    expect(v.errors.some((e) => e.startsWith("c.bars"))).toBe(true);
  });
});

describe("generateEtude", () => {
  it("throws RangeError on invalid constraints (validate-first contract)", () => {
    expect(() => generateEtude(valid({ bars: 33 }), CLOCK)).toThrow(RangeError);
  });

  it("JSON round-trips losslessly (Versioned plain data)", () => {
    const { etude } = generateEtude(valid({ seed: 7, bars: 16 }), CLOCK);
    const back = JSON.parse(JSON.stringify(etude));
    expect(back).toEqual(etude);
    expect(back.version).toBe(1);
  });

  it("canonicalId is stable across {nowMs, seq} changes", () => {
    const a = generateEtude(valid({ seed: 99 }), { nowMs: 1, seq: 1 }).etude;
    const b = generateEtude(valid({ seed: 99 }), { nowMs: 999_999, seq: 42 }).etude;
    expect(a.canonicalId).toBe(b.canonicalId);
    expect(a.instanceId).not.toBe(b.instanceId); // instanceId IS clock-sensitive
  });

  it("canonicalId is stable across key-order permutations of constraints", () => {
    const shuffleKeys = <T,>(obj: T): T => {
      if (obj === null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map((x) => shuffleKeys(x)) as unknown as T;
      const src = obj as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).reverse()) out[k] = shuffleKeys(src[k]);
      return out as T;
    };
    const c1 = valid({ seed: 5 });
    const c2 = shuffleKeys(c1); // every object level reordered (canonicalize sorts)
    const c3 = { ...c1, seed: 6 }; // different seed -> different id (sanity)
    const a = generateEtude(c1, CLOCK).etude.canonicalId;
    const b = generateEtude(c2, CLOCK).etude.canonicalId;
    const d = generateEtude(c3, CLOCK).etude.canonicalId;
    expect(b).toBe(a);
    expect(d).not.toBe(a);
  });

  it("carries the constraints verbatim and honors tempo fallback", () => {
    const c = valid({ seed: 3, tempo: null });
    const { etude } = generateEtude(c, CLOCK);
    expect(etude.constraints).toBe(c);
    expect(etude.tempo).toBe(140); // jazz defaultTempo
    const fixed = generateEtude(valid({ tempo: 88 }), CLOCK).etude;
    expect(fixed.tempo).toBe(88);
  });

  it("etude.annotations IS the returned annotations array (single source, D18)", () => {
    const { etude, annotations } = generateEtude(valid({ seed: 42, styleId: "jazz" }), CLOCK);
    expect(annotations.length).toBeGreaterThan(0);
    expect(etude.annotations).toBe(annotations);
  });

  it("etudeToSteps: one step per bar, HarmonicStep-shaped", () => {
    for (const bars of [4, 8, 24]) {
      const { etude } = generateEtude(valid({ bars, seed: 11 }), CLOCK);
      const steps = etudeToSteps(etude);
      expect(steps.length).toBe(bars);
      for (const s of steps) {
        expect(typeof s.name).toBe("string");
        expect(s.name.length).toBeGreaterThan(0);
        expect(Array.isArray(s.notes)).toBe(true);
        expect(typeof s.descriptions).toBe("string");
        expect(s.descriptions.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("feasibilityOf (Slice 2 panel warning contract)", () => {
  it("returns null for satisfiable constraints", () => {
    expect(feasibilityOf(valid())).toBeNull();
  });

  it("warns when the harmony filter empties the material pool", () => {
    const c = valid({ harmony: { allowedQualities: null, allowedNumerals: ["bIII"], startOn: null, endOn: null, requireChromaticism: false } });
    const w = feasibilityOf(c);
    expect(w).not.toBeNull();
    expect(w).toMatch(/exclude/);
  });

  it("warns when requireChromaticism cannot be satisfied", () => {
    const c = valid({ harmony: { allowedQualities: null, allowedNumerals: ["ii7", "V7", "Imaj7"], startOn: null, endOn: null, requireChromaticism: true } });
    const w = feasibilityOf(c);
    expect(w).not.toBeNull();
    expect(w).toMatch(/requireChromaticism/);
  });

  it("surfaces validation errors instead of throwing", () => {
    const w = feasibilityOf(valid({ bars: 99 }));
    expect(w).not.toBeNull();
    expect(w).toMatch(/Invalid constraints/);
  });
});

describe("feasibilityOf invariant: null => generateEtude NEVER throws (fix round)", () => {
  // The mirror break: the OLD check treated requireChromaticism as
  // feasible when EITHER fallback token passed the filter, but the
  // generator's bII7 branch only fires when the REALIZED final chord is
  // tonic-family - a seed-dependent outcome. Shapes with bII7 allowed,
  // bVII7 filtered out, and non-tonic template endings threw
  // RangeError on ~1/3 of seeds while feasibilityOf said "feasible".
  // The check is now conservative-sound: bVII7 (bar 1, always
  // reachable for validated bars >= 4) must pass. These tests pin BOTH
  // halves: the lying shape now warns (and genuinely dead-ends, so the
  // warning is not vacuous), and every feasible shape survives a
  // 300-seed sweep without a single throw.
  const SWEEP_SEEDS = 300;

  it("regression: bII7-allowed / bVII7-filtered + requireChromaticism WARNS, and some seeds really throw", () => {
    const c = valid({
      harmony: { allowedQualities: null, allowedNumerals: ["ii7", "V7", "Imaj7", "bII7"], startOn: null, endOn: null, requireChromaticism: true },
    });
    const w = feasibilityOf(c);
    expect(w).not.toBeNull();
    expect(w).toMatch(/requireChromaticism/);
    // Non-vacuous: the warning must correspond to a REAL dead-end -
    // at least one seed throws (the historical ~109/300 failure class).
    let throws = 0;
    for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
      try {
        generateEtude({ ...c, seed }, CLOCK);
      } catch (e) {
        expect(e).toBeInstanceOf(RangeError);
        throws++;
      }
    }
    expect(throws).toBeGreaterThan(0);
  });

  it("feasible => never throws: 300-seed sweep over a constraint-shape matrix", () => {
    const NUM_SETS: (readonly string[] | null)[] = [
      null,
      ["ii7", "V7", "Imaj7", "bII7"], // bII7 WITHOUT bVII7: the historical lie class - must be WARNED OUT of this sweep (regression test pins the warning)
      ["ii7", "V7", "Imaj7", "bII7", "bVII7"],
      ["ii7", "V7", "Imaj7", "bVII7"],
      ["ii7", "V7", "ii7(b5)", "bVII7", "V7alt"],
    ];
    const QUAL_SETS: (readonly string[] | null)[] = [
      null,
      ["maj7", "m7", "7"],
      ["m7", "7", "7alt"],
    ];
    let feasibleShapes = 0;
    const failures: string[] = [];
    for (const styleId of ["jazz", "pop", "classical"] as const) {
      for (const mode of ["major", "minor"] as const) {
        for (const requireChromaticism of [false, true]) {
          for (const allowedNumerals of NUM_SETS) {
            for (const allowedQualities of QUAL_SETS) {
              const c = valid({
                styleId,
                mode,
                harmony: { allowedQualities, allowedNumerals, startOn: null, endOn: null, requireChromaticism },
              });
              if (feasibilityOf(c) !== null) continue; // warned shapes are excluded from the sweep
              feasibleShapes++;
              const shape = `${styleId}/${mode}/rc=${requireChromaticism}/${JSON.stringify(allowedNumerals)}/${JSON.stringify(allowedQualities)}`;
              for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
                try {
                  generateEtude({ ...c, seed }, CLOCK);
                } catch (e) {
                  if (failures.length < 5) failures.push(`${shape}/seed=${seed}: ${(e as Error).message}`);
                }
              }
            }
          }
        }
      }
    }
    expect(feasibleShapes).toBeGreaterThanOrEqual(20); // sweep really covered the space
    expect(failures, `feasible shapes must NEVER throw; first failures:\n${failures.join("\n")}`).toEqual([]);
  });
});

describe("feasibilityOf: contradictory startOn/endOn overrides are LOUD (fix round)", () => {
  // The override may still win (REQ-ETU-13), but a startOn/endOn token
  // that the allowedNumerals/allowedQualities filter would reject must
  // produce a warning - never a silent filter-violating chord.

  it("startOn violating allowedNumerals: warns, override still wins", () => {
    const c = valid({
      harmony: { allowedQualities: null, allowedNumerals: ["ii7", "V7", "Imaj7"], startOn: "IV", endOn: null, requireChromaticism: false },
    });
    const w = feasibilityOf(c);
    expect(w).not.toBeNull();
    expect(w).toMatch(/startOn 'IV'/);
    expect(w).toMatch(/violates/);
    const { etude } = generateEtude(c, CLOCK); // generation still succeeds (loud, not fatal)
    expect(etude.chords[0].numeral).toBe("IV"); // the override won
  });

  it("endOn violating allowedQualities: warns, override still wins", () => {
    const c = valid({
      harmony: { allowedQualities: ["m7", "7"], allowedNumerals: null, startOn: null, endOn: "Imaj7", requireChromaticism: false },
    });
    const w = feasibilityOf(c);
    expect(w).not.toBeNull();
    expect(w).toMatch(/endOn 'Imaj7'/);
    const { etude } = generateEtude(c, CLOCK);
    expect(etude.chords[etude.chords.length - 1].numeral).toBe("Imaj7");
  });

  it("consistent overrides (tokens inside the filters) stay silent", () => {
    const c = valid({
      harmony: { allowedQualities: ["maj7", "m7", "7"], allowedNumerals: ["ii7", "V7", "Imaj7"], startOn: "ii7", endOn: "Imaj7", requireChromaticism: false },
    });
    expect(feasibilityOf(c)).toBeNull();
  });
});
