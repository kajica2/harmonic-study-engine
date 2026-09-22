/**
 * formPeriod tests -- synthetic padding cases + one real-data pin.
 *
 * detectFormPeriod is the WAV-export form guard (W2'): the renderer
 * must output the whole song form EXACTLY ONCE even though live
 * paths arrive padded by cycling (padPath). These tests pin the
 * period detection on the exact padding shapes the app produces.
 */

import { describe, it, expect } from "vitest";
import { detectFormPeriod } from "./formPeriod";
import { STUDIES_PATHS } from "./paths";

const chord = (name: string, notes: number[]) => ({ name, notes });

describe("detectFormPeriod", () => {
  it("finds a 4-step phrase padded x24 (96 steps) -> 4", () => {
    const form = [
      chord("Cmaj7", [60, 64, 67, 71]),
      chord("Dm7", [62, 65, 69, 72]),
      chord("Em7", [64, 67, 71, 74]),
      chord("Fmaj7", [65, 69, 72, 76]),
    ];
    const padded = Array.from({ length: 96 }, (_, i) => form[i % 4]);
    expect(detectFormPeriod(padded)).toBe(4);
  });

  it("finds a 40-step form padded by prefix-slicing to 96 -> 40", () => {
    // padPath cycles with `steps.concat(steps.slice(0, need))`, so a
    // 40-step form becomes 40 + 40 + 16 = 96 (a prefix, not a whole
    // extra pass). The period must still be 40 even though 96 % 40
    // !== 0.
    const form = Array.from({ length: 40 }, (_, i) => chord(`c${i}`, [48 + i]));
    const padded = Array.from({ length: 96 }, (_, i) => form[i % 40]);
    expect(detectFormPeriod(padded)).toBe(40);
  });

  it("returns steps.length for a non-repeating 8-step sequence -> 8", () => {
    const steps = Array.from({ length: 8 }, (_, i) => chord(`x${i}`, [60 + i]));
    expect(detectFormPeriod(steps)).toBe(8);
  });

  it("returns 0 for the empty array and 1 for a single step", () => {
    expect(detectFormPeriod([])).toBe(0);
    expect(detectFormPeriod([chord("Cmaj7", [60, 64, 67, 71])])).toBe(1);
  });

  it("returns 16 for an AABA 16-bar form with a distinct B (not 8)", () => {
    // A = 4 distinct bars, B = 4 bars entirely outside A, and the
    // final A carries a one-bar tag variant (as real heads do). The
    // tag matters: with byte-identical A sections the smallest
    // matching p is 12 (the trailing A always prefix-matches at
    // p = 12), so the export would clip the last 4 bars. The tag
    // variant forces the honest 16-bar form.
    const A = [
      chord("a1", [60]), chord("a2", [62]), chord("a3", [64]), chord("a4", [65]),
    ];
    const B = [
      chord("b1", [67]), chord("b2", [69]), chord("b3", [71]), chord("b4", [72]),
    ];
    const Atag = [
      chord("a1", [60]), chord("a2", [62]), chord("a3", [64]), chord("a4tag", [53]),
    ];
    const aaba = [...A, ...A, ...B, ...Atag];
    expect(detectFormPeriod(aaba)).toBe(16);
  });

  it("compares the pitch set order-insensitively (same chord, different order)", () => {
    const form = [chord("Cmaj7", [60, 64, 67, 71]), chord("G7", [59, 62, 65, 69])];
    const padded = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0
        ? chord("Cmaj7", [71, 60, 67, 64]) // shuffled, same set
        : form[1],
    );
    expect(detectFormPeriod(padded)).toBe(2);
  });

  it("REAL DATA PIN: study-star-eyes is padded to 96 steps with a 32-bar form", () => {
    const starEyes = STUDIES_PATHS.find((p) => p.id === "study-star-eyes");
    expect(starEyes, "study-star-eyes must exist in STUDIES_PATHS").toBeDefined();
    expect(starEyes!.steps.length).toBe(96);
    // 32-bar ballad form cycled by padPath to the 24-bar minimum
    // policy (24 * 4 = 96 steps). The export must render 32 bars.
    expect(detectFormPeriod(starEyes!.steps)).toBe(32);
  });
});
