/**
 * src/lib/scoreImages.test.ts - PIN-001 for the score image export
 * helpers. Pure string / arithmetic only - node env (no DOM), so NO
 * JSDOM_FILES change is needed. The browser half (buildScoreSvg WASM
 * engraving, svgToPngBlob canvas rasterization) is NOT unit-tested per
 * policy.
 *
 * Pinned laws:
 *   - scoreImageFilename = deriveSlug(title) + "." + normalized ext,
 *     identical stem to the MusicXML ZIP entries (title ?? name ??
 *     "untitled"), "svg" fallback for an unusable extension.
 *   - scoreRasterSize: widthPx overrides scale and preserves the SVG
 *     aspect; otherwise intrinsic size x scale (default 2); ceil to 1px
 *     minimum; longest edge clamped to 8192 with the aspect preserved.
 *   - parseSvgDimensions: width/height attrs, else viewBox, else the
 *     fixed default; always positive finite.
 *   - ensureSvgNamespace: idempotent, injects xmlns when absent.
 */

import { describe, it, expect } from "vitest";
import {
  scoreImageFilename,
  scoreRasterSize,
  parseSvgDimensions,
  ensureSvgNamespace,
} from "./scoreImages";
import type { HarmonicPath } from "./paths";

function makePath(overrides: Partial<HarmonicPath> = {}): HarmonicPath {
  return {
    id: "test-path",
    title: "Star Eyes",
    description: "",
    steps: [],
    ...overrides,
  };
}

describe("scoreImageFilename", () => {
  it("uses the marketplace slug of the title plus the extension", () => {
    expect(scoreImageFilename(makePath(), "svg")).toBe("star-eyes.svg");
    expect(scoreImageFilename(makePath(), "png")).toBe("star-eyes.png");
  });

  it("normalizes the extension (leading dot, case, junk)", () => {
    expect(scoreImageFilename(makePath(), ".PNG")).toBe("star-eyes.png");
    expect(scoreImageFilename(makePath(), "Svg")).toBe("star-eyes.svg");
    expect(scoreImageFilename(makePath(), "")).toBe("star-eyes.svg");
    expect(scoreImageFilename(makePath(), "..")).toBe("star-eyes.svg");
  });

  it("defaults to .svg when no extension is given", () => {
    expect(scoreImageFilename(makePath())).toBe("star-eyes.svg");
  });

  it("keeps the deriveSlug law for punctuation and empty titles", () => {
    expect(
      scoreImageFilename(makePath({ title: "Blue in Green (take 2)!" }), "svg"),
    ).toBe("blue-in-green-take-2.svg");
    expect(scoreImageFilename(makePath({ title: "!!!" }), "png")).toBe(
      "untitled.png",
    );
    expect(scoreImageFilename(makePath({ title: "" }), "svg")).toBe(
      "untitled.svg",
    );
  });

  it("falls back to name when title is missing", () => {
    const path = makePath({ title: undefined, name: "Solar Path" });
    expect(scoreImageFilename(path, "svg")).toBe("solar-path.svg");
  });
});

describe("parseSvgDimensions", () => {
  it("reads declared width and height (either quote style)", () => {
    expect(
      parseSvgDimensions('<svg width="1000" height="500"></svg>'),
    ).toEqual({ width: 1000, height: 500 });
    expect(
      parseSvgDimensions("<svg width='640' height='320'></svg>"),
    ).toEqual({ width: 640, height: 320 });
  });

  it("falls back to the viewBox when width/height are absent", () => {
    expect(
      parseSvgDimensions('<svg viewBox="0 0 600 400"></svg>'),
    ).toEqual({ width: 600, height: 400 });
  });

  it("falls back to the default for unusable or missing sizes", () => {
    expect(parseSvgDimensions("<svg></svg>")).toEqual({
      width: 2100,
      height: 1200,
    });
    expect(parseSvgDimensions('<svg width="0" height="-4"></svg>')).toEqual({
      width: 2100,
      height: 1200,
    });
    expect(parseSvgDimensions("not svg at all")).toEqual({
      width: 2100,
      height: 1200,
    });
  });
});

describe("scoreRasterSize", () => {
  const SVG = '<svg width="1000" height="500"></svg>';

  it("doubles the intrinsic size by default (print sharpness)", () => {
    expect(scoreRasterSize(SVG)).toEqual({ width: 2000, height: 1000 });
  });

  it("applies an explicit scale", () => {
    expect(scoreRasterSize(SVG, { scale: 3 })).toEqual({
      width: 3000,
      height: 1500,
    });
    expect(scoreRasterSize(SVG, { scale: 1.5 })).toEqual({
      width: 1500,
      height: 750,
    });
  });

  it("falls back to the default scale for non-positive or invalid scale", () => {
    expect(scoreRasterSize(SVG, { scale: 0 })).toEqual({
      width: 2000,
      height: 1000,
    });
    expect(scoreRasterSize(SVG, { scale: -2 })).toEqual({
      width: 2000,
      height: 1000,
    });
    expect(scoreRasterSize(SVG, { scale: Number.NaN })).toEqual({
      width: 2000,
      height: 1000,
    });
  });

  it("lets widthPx override scale while preserving the aspect ratio", () => {
    expect(scoreRasterSize(SVG, { widthPx: 800 })).toEqual({
      width: 800,
      height: 400,
    });
    expect(scoreRasterSize(SVG, { widthPx: 800, scale: 4 })).toEqual({
      width: 800,
      height: 400,
    });
    expect(
      scoreRasterSize('<svg width="600" height="900"></svg>', { widthPx: 300 }),
    ).toEqual({ width: 300, height: 450 });
  });

  it("ignores a non-positive widthPx", () => {
    expect(scoreRasterSize(SVG, { widthPx: 0 })).toEqual({
      width: 2000,
      height: 1000,
    });
  });

  it("ceils fractional results and never returns a sub-1px edge", () => {
    expect(
      scoreRasterSize('<svg width="100.4" height="10"></svg>', { scale: 2 }),
    ).toEqual({ width: 201, height: 20 });
    expect(
      scoreRasterSize('<svg width="1000" height="0.2"></svg>', { scale: 1 }),
    ).toEqual({ width: 1000, height: 1 });
  });

  it("clamps the longest edge to 8192 keeping the aspect ratio", () => {
    expect(
      scoreRasterSize('<svg width="6000" height="3000"></svg>', { scale: 2 }),
    ).toEqual({ width: 8192, height: 4096 });
  });
});

describe("ensureSvgNamespace", () => {
  it("injects xmlns when the SVG has none", () => {
    const out = ensureSvgNamespace('<svg width="10" height="5"></svg>');
    expect(out).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('width="10"');
  });

  it("is idempotent for SVGs that already declare xmlns", () => {
    const withNs =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"></svg>';
    expect(ensureSvgNamespace(withNs)).toBe(withNs);
    expect(ensureSvgNamespace(ensureSvgNamespace("<svg></svg>"))).toBe(
      ensureSvgNamespace("<svg></svg>"),
    );
  });
});
