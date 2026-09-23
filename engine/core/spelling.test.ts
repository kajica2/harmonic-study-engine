/**
 * engine/core/spelling.test.ts - PRD-001 Phase 2 (D11) pin suite.
 *
 * Covers: the 12x2 tonic tables incl. the tie-goes-flat cases, the
 * literal-accidental precedence, all 21 catalog key strings parsing
 * without throwing, drift endpoints shifted independently, slash /
 * parenthetical handling, the +/-12 identity, the first/last-chord
 * heuristic for key-less studies paths, and advanceKeyCycle wrap.
 */

import { describe, it, expect } from "vitest";
import {
  parseKey,
  spellTonic,
  effectiveKeyLabel,
  advanceKeyCycle,
} from "./spelling";

/** U+2192 written as an escape so this file stays ASCII. */
const ARROW = "\u2192";

describe("spellTonic - 12x2 tables", () => {
  const MAJOR = [
    "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
  ];
  const MINOR = [
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
  ];

  it("major table: fewest accidentals, ties flat", () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(spellTonic(pc, "major", "")).toBe(MAJOR[pc]);
    }
  });

  it("minor table: fewest accidentals with the minor sharp-wins", () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(spellTonic(pc, "minor", "")).toBe(MINOR[pc]);
    }
  });

  it("tie-goes-flat cases are pinned explicitly", () => {
    expect(spellTonic(6, "major", "")).toBe("Gb"); // pc6 major -> Gb
    expect(spellTonic(1, "minor", "")).toBe("C#"); // C#m not Dbm
    expect(spellTonic(6, "minor", "")).toBe("F#"); // F#m not Gbm
    expect(spellTonic(8, "minor", "")).toBe("G#"); // G#m not Abm
    expect(spellTonic(3, "minor", "")).toBe("Eb"); // Ebm not D#m
  });

  it("author's literal accidental wins when the pc matches", () => {
    expect(spellTonic(6, "major", "F#")).toBe("F#");
    expect(spellTonic(6, "major", "Gb")).toBe("Gb");
    expect(spellTonic(1, "minor", "Db")).toBe("Db");
  });

  it("literal is ignored when it names a different pc", () => {
    expect(spellTonic(2, "major", "F#")).toBe("D");
  });

  it("modal / unknown modes spell the tonic via the major table", () => {
    expect(spellTonic(2, "Dorian", "")).toBe("D");
    expect(spellTonic(6, "whole-tone", "")).toBe("Gb");
  });
});

describe("parseKey - catalog coverage", () => {
  const CATALOG_KEYS = [
    "C",
    "C major",
    "C# minor",
    "C Lydian",
    "C minor",
    "C minor (modal)",
    "C whole-tone",
    "C major (axis = F#/Gb, pc 6)",
    `C major ${ARROW} Bb major (cycle)`,
    `C major ${ARROW} Eb major (cycle)`,
    "D Dorian",
    `D Dorian ${ARROW} Eb Dorian`,
    "D Dorian / G Mixolydian",
    "D minor",
    `D minor ${ARROW} C major`,
    "Bb major",
    "Bb major (blues)",
    "Bb minor",
    "B major (tonal center)",
    "F minor",
    `F minor ${ARROW} Ab major`,
  ];

  it("all 21 catalog key strings parse without throwing", () => {
    expect(CATALOG_KEYS).toHaveLength(21);
    for (const raw of CATALOG_KEYS) {
      expect(() => parseKey(raw)).not.toThrow();
      expect(parseKey(raw)).not.toBeNull();
    }
  });

  it("parses tonic pc + normalized mode + literal", () => {
    expect(parseKey("Bb minor")).toEqual({ tonicPc: 10, mode: "minor", literal: "Bb" });
    expect(parseKey("C")).toEqual({ tonicPc: 0, mode: "major", literal: "C" });
    expect(parseKey("C major")).toEqual({ tonicPc: 0, mode: "major", literal: "C" });
  });

  it("parentheticals are stripped before parsing", () => {
    expect(parseKey("B major (tonal center)")).toEqual({
      tonicPc: 11,
      mode: "major",
      literal: "B",
    });
    expect(parseKey("C major (axis = F#/Gb, pc 6)")).toEqual({
      tonicPc: 0,
      mode: "major",
      literal: "C",
    });
  });

  it("slash form keeps the first endpoint", () => {
    expect(parseKey("D Dorian / G Mixolydian")).toEqual({
      tonicPc: 2,
      mode: "Dorian",
      literal: "D",
    });
  });

  it("modal suffix survives verbatim; plain qualities normalize", () => {
    expect(parseKey("C Lydian")?.mode).toBe("Lydian");
    expect(parseKey("Eb maj")?.mode).toBe("major");
    expect(parseKey("F#m")?.mode).toBe("minor");
  });

  it("garbage returns null (never throws)", () => {
    expect(parseKey("")).toBeNull();
    expect(parseKey("Halsey")).toBeNull();
    expect(parseKey("7/8")).toBeNull();
  });
});

describe("effectiveKeyLabel", () => {
  it("shifts a major key with tie-flat spelling", () => {
    expect(effectiveKeyLabel("F major", 1)).toBe("Gb major");
  });

  it("drift shifts each endpoint independently, rendered X -> Y", () => {
    expect(effectiveKeyLabel(`D minor ${ARROW} C major`, 1)).toBe(
      "Eb minor -> Db major",
    );
    expect(effectiveKeyLabel(`C major ${ARROW} Bb major (cycle)`, 2)).toBe(
      "D major -> C major",
    );
  });

  it("parenthetical + slash sources render cleanly", () => {
    expect(effectiveKeyLabel("B major (tonal center)", 0)).toBe("B major");
    expect(effectiveKeyLabel("D Dorian / G Mixolydian", 2)).toBe("E Dorian");
    expect(effectiveKeyLabel("C whole-tone", 1)).toBe("Db whole-tone");
  });

  it("literal precedence: author's accidental survives shift 0", () => {
    expect(effectiveKeyLabel("F# minor", 0)).toBe("F# minor");
    expect(effectiveKeyLabel("Db major", 0)).toBe("Db major");
  });

  it("+/-12 identity: same label at octave shifts", () => {
    for (const key of ["Eb major", "C# minor", "D Dorian", "Bb major (blues)"]) {
      expect(effectiveKeyLabel(key, 12)).toBe(effectiveKeyLabel(key, 0));
      expect(effectiveKeyLabel(key, -12)).toBe(effectiveKeyLabel(key, 0));
    }
  });

  it("unparseable source key -> null (no false claims)", () => {
    expect(effectiveKeyLabel("something else entirely", 3)).toBeNull();
  });

  it("first/last-chord heuristic: Fmaj7...Fmaj7 -> F major", () => {
    expect(effectiveKeyLabel(undefined, 0, "Fmaj7", "Fmaj7")).toBe("F major");
    expect(effectiveKeyLabel(undefined, 1, "Fmaj7", "Fmaj7")).toBe("Gb major");
    expect(effectiveKeyLabel(undefined, 0, "Bbm7", "Bbm7")).toBe("Bb minor");
  });

  it("first/last-chord heuristic rejects mismatched or non-plain pairs", () => {
    expect(effectiveKeyLabel(undefined, 0, "Gm7", "Cmaj7")).toBeNull();
    expect(effectiveKeyLabel(undefined, 0, "Fmaj7", "Fm7")).toBeNull();
    expect(effectiveKeyLabel(undefined, 0, "Fmaj7", "Gm7 C7")).toBeNull();
    expect(effectiveKeyLabel(undefined, 0, "F7#9", "F7#9")).toBeNull();
    expect(effectiveKeyLabel(undefined, 0)).toBeNull();
  });
});

describe("advanceKeyCycle", () => {
  it("advances +1 mod 12 and wraps at 11", () => {
    expect(advanceKeyCycle(0)).toBe(1);
    expect(advanceKeyCycle(10)).toBe(11);
    expect(advanceKeyCycle(11)).toBe(0);
  });

  it("negative offsets stay inside the 0..11 rotation", () => {
    expect(advanceKeyCycle(-1)).toBe(0);
    expect(advanceKeyCycle(-5)).toBe(8);
  });
});
