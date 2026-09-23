/**
 * src/lib/etudeEngine.test.ts - PRD-001 Phase 3 Slice 2 (T1).
 *
 * Node project (pure logic, no DOM). Pins the adapter contracts of
 * D24: non-throwing generation, memo identity, copy-not-cast at the
 * readonly boundary, whole-cycle padding (seamless-loop proof via
 * detectFormPeriod), and the "G minor"-style key round-trip.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_ETUDE_CONSTRAINTS,
  etudeActiveBarFor,
  etudePathId,
  etudeToHarmonicPath,
  generateEtudeFor,
  planEtudeRestore,
} from "./etudeEngine";
import { etudeToSteps, feasibilityOf } from "../../engine/etude/assemble";
import { validateEtudeConstraints } from "../../engine/etude/types";
import type { EtudeConstraints } from "../../engine/etude/types";
import { parseKey } from "../../engine/core/spelling";
import { detectFormPeriod } from "./formPeriod";

function constraints(
  over: Partial<EtudeConstraints> = {},
): EtudeConstraints {
  return { ...DEFAULT_ETUDE_CONSTRAINTS, ...over };
}

describe("DEFAULT_ETUDE_CONSTRAINTS", () => {
  it("passes validateEtudeConstraints and is feasible (null warning)", () => {
    expect(validateEtudeConstraints(DEFAULT_ETUDE_CONSTRAINTS).ok).toBe(true);
    expect(feasibilityOf(DEFAULT_ETUDE_CONSTRAINTS)).toBeNull();
  });
});

describe("generateEtudeFor (REQ-NFR-5 null contract)", () => {
  it("returns null (never throws) on invalid constraints", () => {
    const bad: EtudeConstraints[] = [
      constraints({ bars: 99 }),
      constraints({ seed: -1 }),
      constraints({ styleId: "lofi" }), // valid StyleId, NOT a shipped style
      constraints({ mode: "dorian" as EtudeConstraints["mode"] }),
    ];
    for (const c of bad) {
      expect(() => generateEtudeFor(c)).not.toThrow();
      expect(generateEtudeFor(c)).toBeNull();
    }
  });

  it("returns null on feasible=false constraints (warning gate)", () => {
    // Empty material pool - feasibilityOf warns, adapter must not call
    // the throwing generateEtude path at all.
    const c = constraints({
      harmony: {
        allowedQualities: null,
        allowedNumerals: ["bIII"],
        startOn: null,
        endOn: null,
        requireChromaticism: false,
      },
    });
    expect(feasibilityOf(c)).not.toBeNull();
    expect(generateEtudeFor(c)).toBeNull();
  });

  it("returns the SAME object identity on repeat (memo)", () => {
    const c = constraints({ seed: 101, bars: 8 });
    const a = generateEtudeFor(c);
    const b = generateEtudeFor(c);
    expect(a).not.toBeNull();
    expect(a).toBe(b); // reference equality - the memo
  });

  it("is byte-identical across a fresh constraints literal (REQ-ETU-15)", () => {
    const a = generateEtudeFor(constraints({ seed: 202, bars: 16 }));
    const b = generateEtudeFor(constraints({ seed: 202, bars: 16 }));
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("etudeToHarmonicPath (D24 adapter)", () => {
  it("maps id/title/name and keeps the pre-pad step count === bars", () => {
    const etude = generateEtudeFor(constraints({ seed: 303, bars: 12 }))!;
    expect(etudeToSteps(etude).length).toBe(etude.bars); // one step per BAR
    const path = etudeToHarmonicPath(etude);
    expect(path.id).toBe(`etu-${etude.canonicalId}`);
    expect(path.id).toBe(etudePathId(etude));
    expect(path.title).toBe(etude.title);
    expect(path.name).toBe(etude.title);
    expect(path.description).toContain("12 bars");
    expect(path.description).toContain("seed 303");
  });

  it("whole-cycle padding: >= 96 steps, seamless (length % bars === 0), honest period", () => {
    for (const bars of [4, 5, 7, 8, 16, 31, 32]) {
      const etude = generateEtudeFor(constraints({ seed: 404, bars }))!;
      const path = etudeToHarmonicPath(etude);
      expect(path.steps.length).toBeGreaterThanOrEqual(96);
      expect(path.steps.length % bars).toBe(0);
      const period = detectFormPeriod(path.steps);
      expect(period).toBeLessThanOrEqual(bars);
      expect(path.steps.length % period).toBe(0);
    }
  });

  it("copies notes: mutating a path step cannot touch the etude (copy-not-cast)", () => {
    const etude = generateEtudeFor(constraints({ seed: 505 }))!;
    const path = etudeToHarmonicPath(etude);
    const before = [...etude.chords[0].notes];
    path.steps[0].notes.push(999);
    path.steps[0].notes[0] = -1;
    expect([...etude.chords[0].notes]).toEqual(before);
    // Padded passes are independent copies too.
    const bars = etude.bars;
    path.steps[bars].notes.push(123);
    expect(path.steps[0].notes).not.toContain(123);
  });

  it("key round-trips through parseKey for major AND minor", () => {
    const major = generateEtudeFor(constraints({ seed: 606, key: 3, mode: "major" }))!;
    const mPath = etudeToHarmonicPath(major);
    const mKey = parseKey(mPath.key as string);
    expect(mKey).not.toBeNull();
    expect(mKey?.tonicPc).toBe(3);
    expect(mKey?.mode).toBe("major");

    const minor = generateEtudeFor(constraints({ seed: 707, key: 3, mode: "minor" }))!;
    const nPath = etudeToHarmonicPath(minor);
    expect(nPath.key).toBe("Eb minor");
    const nKey = parseKey(nPath.key);
    expect(nKey).not.toBeNull();
    expect(nKey?.tonicPc).toBe(3);
    expect(nKey?.mode).toBe("minor");
  });
});

// ---------------------------------------------------------------------------
// Fix round (REVIEWER HIGH-001): the boot-restore prepend decision.
// App's boot effect is untestable React; the DECISION is extracted to
// planEtudeRestore and pinned here.
// ---------------------------------------------------------------------------

describe("planEtudeRestore (HIGH-001 boot-restore prepend decision)", () => {
  const PID = "etu-etu-jazz-8-1";

  it("absent pid => prepend AND indexShift 1 (active-path identity survives)", () => {
    const plan = planEtudeRestore([{ id: "path-1" }, { id: "autumn-leaves" }], PID);
    expect(plan).toEqual({ prepend: true, indexShift: 1 });
    // The identity-preservation property: index 0 (path-1) becomes
    // index 1 - still path-1. On a FRESH browser (persisted index 0)
    // the +1 shift is exactly what keeps the prepended etude from
    // being silently ACTIVATED.
    const before = 0;
    const after = before + plan.indexShift;
    const pathsAfterPrepend = [{ id: PID }, { id: "path-1" }, { id: "autumn-leaves" }];
    expect(pathsAfterPrepend[after].id).toBe("path-1");
  });

  it("present pid => NO prepend, NO shift (dedupe; persisted session untouched)", () => {
    const plan = planEtudeRestore([{ id: PID }, { id: "path-1" }], PID);
    expect(plan).toEqual({ prepend: false, indexShift: 0 });
  });

  it("empty paths (degenerate) => prepend + shift 1, never a negative index", () => {
    const plan = planEtudeRestore([], PID);
    expect(plan).toEqual({ prepend: true, indexShift: 1 });
  });

  it("shift is 1 iff prepend - the two terms can NEVER drift apart", () => {
    for (const paths of [[], [{ id: PID }], [{ id: "x" }], [{ id: "x" }, { id: PID }]] as const) {
      const plan = planEtudeRestore(paths, PID);
      expect(plan.indexShift).toBe(plan.prepend ? 1 : 0);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix round (DOCS-CATCH): the roll highlight mapping for one-step-per-bar
// etude paths (slice-1 finding 4). The legacy floor(step / STEPS_PER_BAR)
// formula contradicts the adapter's shape; etudeActiveBarFor is the pin.
// ---------------------------------------------------------------------------

describe("etudeActiveBarFor (DOCS-CATCH one-step-per-bar highlight)", () => {
  const EIGHT = generateEtudeFor(constraints({ bars: 8, seed: 13 }))!;
  const PATH8 = etudeToHarmonicPath(EIGHT);

  it("first pass: bar === stepIndex (step-index-as-bar, NOT /4)", () => {
    expect(etudeActiveBarFor(EIGHT, 0)).toBe(0);
    for (let s = 1; s < 8; s++) {
      expect(etudeActiveBarFor(EIGHT, s)).toBe(s);
      // The legacy formula would have lagged: floor(s/4) < s for all
      // s in 1..7 - the 1/4-speed advance this fix kills.
      expect(Math.floor(s / 4)).toBeLessThan(s);
    }
  });

  it("padded loop: wraps mod bars - highlight NEVER leaves the roll", () => {
    // PATH8 repeats the 8-bar form in whole passes (steps.length % 8 === 0).
    expect(PATH8.steps.length % EIGHT.bars).toBe(0);
    for (let s = 0; s < PATH8.steps.length; s++) {
      const bar = etudeActiveBarFor(EIGHT, s);
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThan(EIGHT.bars);
      expect(bar).toBe(s % EIGHT.bars);
    }
    // Contrast: the legacy formula exits the roll's range at step 32
    // (floor(32/4) === 8 === bars -> the EtudePianoRoll guard drops
    // the highlight for the final two thirds of the loop).
    expect(Math.floor(32 / 4)).toBeGreaterThanOrEqual(EIGHT.bars);
    expect(etudeActiveBarFor(EIGHT, 32)).toBe(0);
  });

  it("defensive: negative steps fold into range; non-finite => 0", () => {
    expect(etudeActiveBarFor(EIGHT, -1)).toBe(7);
    expect(etudeActiveBarFor(EIGHT, Number.NaN)).toBe(0);
    expect(etudeActiveBarFor(EIGHT, Infinity)).toBe(0);
  });
});
