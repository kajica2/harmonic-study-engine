/**
 * src/lib/etudeUrl.test.ts - PRD-001 Phase 3 Slice 2 (T2).
 *
 * Node project (pure, URLSearchParams needs no DOM). Pins the D28
 * scheme: serialize->parse round-trip identity, the golden query
 * string, compactness (defaults omitted), warn-and-drop shapes
 * (partial core, garbage seed, unknown style), and the user-facing
 * REQ-ETU-15 contract: SAME URL => byte-identical etude.
 */

import { describe, it, expect } from "vitest";
import {
  ETUDE_URL_CORE_KEYS,
  serializeEtudeConstraints,
  parseEtudeParams,
  hasEtudeParams,
} from "./etudeUrl";
import {
  DEFAULT_ETUDE_CONSTRAINTS,
  generateEtudeFor,
} from "./etudeEngine";
import { generateEtude } from "../../engine/etude/assemble";
import type { EtudeConstraints } from "../../engine/etude/types";

function c(over: Partial<EtudeConstraints> = {}): EtudeConstraints {
  return { ...DEFAULT_ETUDE_CONSTRAINTS, ...over };
}

function fullHarmony(over: Partial<EtudeConstraints["harmony"]> = {}) {
  return {
    allowedQualities: null,
    allowedNumerals: null,
    startOn: null,
    endOn: null,
    requireChromaticism: false,
    ...over,
  };
}

/** Apply a serialize record to fresh params exactly like the App
 *  writer does: set for values, delete for null. */
function toParams(rec: Record<string, string | null>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(rec)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  return p;
}

const MATRIX: Array<[string, EtudeConstraints]> = [
  ["defaults", c()],
  ["Eb minor, pop, d5, 32 bars, tempo 144", c({ styleId: "pop", key: 3, mode: "minor", difficulty: 5, bars: 32, tempo: 144, seed: 4294967295 })],
  ["classical, all advanced ON", c({
    styleId: "classical",
    key: 7,
    mode: "minor",
    difficulty: 1,
    bars: 4,
    tempo: 96,
    seed: 0,
    harmony: fullHarmony({ startOn: "ii7", endOn: "V7", requireChromaticism: true }),
    melody: { maxIntervalSemitones: 12, chordTonesOnStrongBeats: true, range: null },
    rhythm: { straightRhythmsOnly: true },
  })],
  ["advanced partial: start only", c({ harmony: fullHarmony({ startOn: "bII7" }) })],
  ["advanced partial: maxint only", c({ melody: { maxIntervalSemitones: 5, chordTonesOnStrongBeats: false, range: null } })],
  ["jazz major seed 7 chromatic", c({ seed: 7, harmony: fullHarmony({ requireChromaticism: true }) })],
];

describe("serialize -> parse round-trip (REQ-ETU-3)", () => {
  for (const [name, constraints] of MATRIX) {
    it(`identity for ${name}`, () => {
      const parsed = parseEtudeParams(toParams(serializeEtudeConstraints(constraints)));
      expect(parsed).toEqual(constraints);
    });
  }
});

describe("golden query string", () => {
  it("exact string for a known constraint set", () => {
    const qs = toParams(
      serializeEtudeConstraints(
        c({ key: 3, bars: 8, difficulty: 3, seed: 42 }),
      ),
    ).toString();
    expect(qs).toBe("style=jazz&key=Eb&tmode=major&diff=3&bars=8&seed=42");
  });

  it("advanced-on golden carries every optional key in order", () => {
    const qs = toParams(
      serializeEtudeConstraints({
        ...c({ styleId: "jazz", key: 0, mode: "minor", difficulty: 5, bars: 32, tempo: 144, seed: 4294967295 }),
        harmony: fullHarmony({ startOn: "ii7", endOn: "V7", requireChromaticism: true }),
        melody: { maxIntervalSemitones: 12, chordTonesOnStrongBeats: true, range: null },
        rhythm: { straightRhythmsOnly: true },
      }),
    ).toString();
    expect(qs).toBe(
      "style=jazz&key=C&tmode=minor&diff=5&bars=32&tempo=144&seed=4294967295" +
        "&start=ii7&end=V7&chrom=1&straight=1&cts=1&maxint=12",
    );
  });
});

describe("compactness (defaults omitted)", () => {
  it("serializing DEFAULT yields exactly the six core keys", () => {
    const rec = serializeEtudeConstraints(c());
    const present = Object.keys(rec).filter((k) => rec[k] !== null);
    expect(present.sort()).toEqual([...ETUDE_URL_CORE_KEYS].sort());
    expect(rec.tempo).toBeNull();
    expect(rec.start).toBeNull();
    expect(rec.end).toBeNull();
    expect(rec.chrom).toBeNull();
    expect(rec.straight).toBeNull();
    expect(rec.cts).toBeNull();
    expect(rec.maxint).toBeNull();
  });

  it("null constraints delete every etude key", () => {
    const rec = serializeEtudeConstraints(null);
    expect(Object.values(rec).every((v) => v === null)).toBe(true);
    expect(Object.keys(rec).length).toBeGreaterThan(ETUDE_URL_CORE_KEYS.length);
  });
});

describe("warn-and-drop shapes (malformed -> null)", () => {
  const golden = toParams(serializeEtudeConstraints(c({ key: 3, seed: 42 })));

  it("each missing core key parses to null", () => {
    for (const key of ETUDE_URL_CORE_KEYS) {
      const p = new URLSearchParams(golden);
      p.delete(key);
      expect(parseEtudeParams(p), `missing ${key}`).toBeNull();
    }
  });

  it("garbage seeds parse to null", () => {
    for (const bad of ["abc", "-1", "99999999999", "1.5", ""]) {
      const p = new URLSearchParams(golden);
      p.set("seed", bad);
      expect(parseEtudeParams(p), `seed=${bad}`).toBeNull();
    }
  });

  it("unknown / unshipped styles parse to null", () => {
    for (const bad of ["rock", "lofi", ""]) {
      const p = new URLSearchParams(golden);
      p.set("style", bad);
      expect(parseEtudeParams(p), `style=${bad}`).toBeNull();
    }
  });

  it("bad tmode / key / diff / bars / flags / tokens parse to null", () => {
    const cases: Array<[string, string]> = [
      ["tmode", "dorian"],
      ["key", "H"],
      ["diff", "0"],
      ["diff", "6"],
      ["bars", "3"],
      ["bars", "33"],
      ["chrom", "2"],
      ["start", "not-a-numeral"],
      ["maxint", "0"],
      ["tempo", "abc"],
    ];
    for (const [k, v] of cases) {
      const p = new URLSearchParams(golden);
      p.set(k, v);
      expect(parseEtudeParams(p), `${k}=${v}`).toBeNull();
    }
  });

  it("hasEtudeParams separates absent from malformed", () => {
    expect(hasEtudeParams(new URLSearchParams(""))).toBe(false);
    expect(hasEtudeParams(new URLSearchParams("mode=etude&transpose=2"))).toBe(false);
    expect(hasEtudeParams(golden)).toBe(true);
    expect(hasEtudeParams(new URLSearchParams("chrom=1"))).toBe(true);
  });

  it("an empty URL parses to null (no etude)", () => {
    expect(parseEtudeParams(new URLSearchParams(""))).toBeNull();
  });
});

describe("END-TO-END determinism: same URL => same etude (REQ-ETU-15)", () => {
  it("parse -> generate twice + via re-serialized URL = byte-identical", () => {
    const goldenQs =
      "style=jazz&key=Eb&tmode=minor&diff=4&bars=16&tempo=138&seed=31337";
    const a = generateEtudeFor(parseEtudeParams(new URLSearchParams(goldenQs))!);
    const b = generateEtudeFor(parseEtudeParams(new URLSearchParams(goldenQs))!);
    expect(a).not.toBeNull();
    expect(a).toBe(b); // memo identity

    // Third pass through a full serialize -> parse cycle of the URL.
    const roundTripQs = toParams(
      serializeEtudeConstraints(parseEtudeParams(new URLSearchParams(goldenQs))),
    ).toString();
    expect(roundTripQs).toBe(goldenQs);
    const e = generateEtudeFor(parseEtudeParams(new URLSearchParams(roundTripQs))!);
    expect(JSON.stringify(e)).toBe(JSON.stringify(a));

    // Beyond the memo: a fresh engine call with a fixed clock matches
    // everything except the clock-derived instanceId.
    const fresh = generateEtude(a!.constraints, {
      nowMs: 1_700_000_000_000,
      seq: 1,
    }).etude;
    expect(JSON.stringify({ ...fresh, instanceId: a!.instanceId })).toBe(
      JSON.stringify(a),
    );
  });
});
