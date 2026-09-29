import { describe, it, expect } from "vitest";
import {
  chordPitchClasses,
  degreeToPitchClass,
} from "../src/lib/trumpetStage";

describe("trumpetStage helpers", () => {
  it("chordPitchClasses: Cmaj7 -> C E G B", () => {
    expect(chordPitchClasses("C", "maj7")).toEqual(["C", "E", "G", "B"]);
  });
  it("chordPitchClasses: Bb7 -> Bb D F Ab", () => {
    expect(chordPitchClasses("Bb", "7")).toEqual(["Bb", "D", "F", "Ab"]);
  });
  it("degreeToPitchClass: 1,3,5,9 over Cmaj7", () => {
    expect(degreeToPitchClass("C", "maj7", "1")).toBe("C");
    expect(degreeToPitchClass("C", "maj7", "3")).toBe("E");
    expect(degreeToPitchClass("C", "maj7", "5")).toBe("G");
    expect(degreeToPitchClass("C", "maj7", "9")).toBe("D");
  });
  it("degreeToPitchClass: b3 over Cm7 -> Eb", () => {
    expect(degreeToPitchClass("C", "m7", "b3")).toBe("Eb");
  });
});