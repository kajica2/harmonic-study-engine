import { describe, expect, it } from "vitest";
import {
  arpHitAt,
  arpTickMs,
  beatUnitQuarters,
  styleRhythmPreset,
  templateMeter,
} from "./arpRhythm";

describe("arpTickMs beat unit", () => {
  it("5/4 subdivision 2 is an eighth (quarter beat / 2)", () => {
    expect(beatUnitQuarters("5/4")).toBe(1);
    expect(arpTickMs(120, "5/4", 2)).toBe(250);
  });

  it("7/8 subdivision 2 is a 16th (eighth beat / 2)", () => {
    expect(beatUnitQuarters("7/8")).toBe(0.5);
    expect(arpTickMs(120, "7/8", 2)).toBe(125);
  });

  it("3/4 subdivision 2 is an eighth", () => {
    expect(arpTickMs(120, "3/4", 2)).toBe(250);
  });

  it("4/4 rate 4 stays a 16th (legacy)", () => {
    expect(arpTickMs(120, "4/4", 4)).toBe(125);
  });
});

describe("arpHitAt", () => {
  it("straight + sync off plays every slot with no offset", () => {
    const hit = arpHitAt({
      step: 1,
      beats: 4,
      rhythm: "straight",
      syncopation: false,
    });
    expect(hit.play).toBe(true);
    expect(hit.offsetSteps).toBe(0);
  });

  it("syncopation delays on-beat hits by half a tick", () => {
    const on = arpHitAt({
      step: 0,
      beats: 5,
      rhythm: "straight",
      syncopation: true,
    });
    const off = arpHitAt({
      step: 1,
      beats: 5,
      rhythm: "straight",
      syncopation: true,
    });
    expect(on.offsetSteps).toBe(0.5);
    expect(off.offsetSteps).toBe(0);
  });

  it("offbeat rests the downbeat in 7/8", () => {
    expect(
      arpHitAt({ step: 0, beats: 7, rhythm: "offbeat", syncopation: false })
        .play,
    ).toBe(false);
    expect(
      arpHitAt({ step: 1, beats: 7, rhythm: "offbeat", syncopation: false })
        .play,
    ).toBe(true);
  });

  it("charleston hits beat 0 and the off of beat 1 in 3/4", () => {
    const plays = [0, 1, 2, 3, 4, 5].map(
      (step) =>
        arpHitAt({ step, beats: 3, rhythm: "charleston", syncopation: false })
          .play,
    );
    expect(plays).toEqual([true, false, false, true, true, false]);
  });
});

describe("template and style presets", () => {
  it("templates apply distinct odd meters", () => {
    expect(templateMeter("aaba")).toBe("4/4");
    expect(templateMeter("abac")).toBe("3/4");
    expect(templateMeter("theme-vars")).toBe("5/4");
    expect(templateMeter("through-composed")).toBe("7/8");
  });

  it("style packs set meter, variety, and syncopation", () => {
    expect(styleRhythmPreset("jazz")).toEqual({
      meter: "4/4",
      rhythm: "charleston",
      syncopation: true,
    });
    expect(styleRhythmPreset("common-practice")?.syncopation).toBe(false);
    expect(styleRhythmPreset("post-tonal")?.meter).toBe("7/8");
    expect(styleRhythmPreset("nope")).toBeNull();
  });
});
