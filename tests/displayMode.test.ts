import { describe, it, expect } from "vitest";
import {
  nextMode,
  isZoomMode,
  allScoreModes,
  SCORE_MODE_LABEL,
  SCORE_MODE_HINT,
} from "../src/lib/displayMode";

/**
 * displayMode — pure score-display mode selection.
 *
 * Tests pin the small data layer (cycle, predicate, label map,
 * hint map, list of all modes). The rendering changes that
 * consume these helpers are visual and tested by build + browser.
 */

describe("nextMode", () => {
  it("cycles full → zoom → full", () => {
    expect(nextMode("full")).toBe("zoom");
    expect(nextMode("zoom")).toBe("full");
  });
});

describe("isZoomMode", () => {
  it("returns true only for 'zoom'", () => {
    expect(isZoomMode("zoom")).toBe(true);
    expect(isZoomMode("full")).toBe(false);
  });
});

describe("allScoreModes", () => {
  it("returns the two modes in display order", () => {
    expect(allScoreModes()).toEqual(["full", "zoom"]);
  });
});

describe("SCORE_MODE_LABEL", () => {
  it("has a label for every mode", () => {
    for (const m of allScoreModes()) {
      expect(SCORE_MODE_LABEL[m]).toBeTruthy();
    }
  });
});

describe("SCORE_MODE_HINT", () => {
  it("has a hint for every mode", () => {
    for (const m of allScoreModes()) {
      expect(SCORE_MODE_HINT[m]).toBeTruthy();
      expect(SCORE_MODE_HINT[m].length).toBeGreaterThan(20);
    }
  });
});
