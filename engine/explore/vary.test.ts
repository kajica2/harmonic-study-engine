/**
 * engine/explore/vary.test.ts - PRD-001 Phase 5 (checklist 3).
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { varyMelody } from "./vary";

describe("varyMelody", () => {
  it("retrograde is an involution", () => {
    const line = [60, 64, 67, 72];
    expect(varyMelody(line, "retrograde", createRng(1))).toEqual([72, 67, 64, 60]);
    expect(
      varyMelody(varyMelody(line, "retrograde", createRng(1)), "retrograde", createRng(2)),
    ).toEqual(line);
  });

  it("inversion mirrors around the first pitch (involution mid-range)", () => {
    const line = [60, 64, 67, 72];
    expect(varyMelody(line, "inversion", createRng(1))).toEqual([60, 56, 53, 48]);
    expect(
      varyMelody(varyMelody(line, "inversion", createRng(1)), "inversion", createRng(2)),
    ).toEqual(line);
  });

  it("displacement rotates left, length-preserved, seeded k pinned", () => {
    const line = [60, 62, 64, 65, 67];
    const a = varyMelody(line, "displacement", createRng(11));
    expect(a).toHaveLength(line.length);
    expect([...a].sort((x, y) => x - y)).toEqual([...line].sort((x, y) => x - y));
    // Same seed, same rotation (draw-order pin).
    expect(varyMelody(line, "displacement", createRng(11))).toEqual(a);
    // Rotation is a genuine rotation of the input.
    const doubled = [...line, ...line];
    expect(doubled.slice(0, line.length)).not.toEqual(a);
    const joined = doubled.join(",");
    expect((joined + "," + joined).includes(a.join(","))).toBe(true);
  });

  it("ornamentation caps at 2x length, clamps 0..127", () => {
    const line = [40, 60, 80, 100];
    for (let seed = 0; seed < 50; seed++) {
      const out = varyMelody(line, "ornamentation", createRng(seed));
      expect(out.length).toBeLessThanOrEqual(2 * line.length);
      for (const n of out) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
      }
      // Original pitches survive in order (ornaments only insert).
      let cursor = 0;
      for (const n of line) {
        const at = out.indexOf(n, cursor);
        expect(at).toBeGreaterThanOrEqual(cursor);
        cursor = at + 1;
      }
    }
  });

  it("empty / singleton inputs are no-ops (never throw)", () => {
    expect(varyMelody([], "retrograde", createRng(1))).toEqual([]);
    expect(varyMelody([], "ornamentation", createRng(1))).toEqual([]);
    expect(varyMelody([64], "displacement", createRng(1))).toEqual([64]);
    expect(varyMelody([64], "inversion", createRng(1))).toEqual([64]);
  });

  it("300-seed determinism spot (no throw, byte-stable per seed)", () => {
    const line = [60, 64, 67, 72, 76];
    for (let seed = 0; seed < 300; seed++) {
      const a = varyMelody(line, "ornamentation", createRng(seed));
      const b = varyMelody(line, "ornamentation", createRng(seed));
      expect(a).toEqual(b);
      const c = varyMelody(line, "displacement", createRng(seed));
      const d = varyMelody(line, "displacement", createRng(seed));
      expect(c).toEqual(d);
    }
  });
});
