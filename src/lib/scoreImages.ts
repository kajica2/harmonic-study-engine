/**
 * src/lib/scoreImages.ts - engraved score export as SVG / PNG files.
 *
 * The book flow already hands back a PDF (bookPdf) and a MusicXML ZIP
 * (BookSection). This module adds the two formats downstream tools
 * actually want for the web, for print, and for editing: a portable
 * SVG (Verovio glyphs are PATHs, so no music font is needed on the
 * receiving side) and a raster PNG.
 *
 * Two halves, kept apart on purpose:
 *
 *   PURE - node-tested (PIN-001), no DOM / canvas / WASM:
 *     - scoreImageFilename: {slug}.{ext} slug law (marketplace deriveSlug)
 *     - parseSvgDimensions: width/height attrs, then viewBox, then default
 *     - scoreRasterSize: scale / widthPx / aspect math + edge clamp
 *     - ensureSvgNamespace: guarantees xmlns so Image() can load the SVG
 *
 *   BROWSER-ONLY - not unit-tested per policy:
 *     - buildScoreSvg: MusicXML -> Verovio WASM -> SVG string
 *     - svgToPngBlob: Blob URL -> Image -> 2D canvas -> image/png Blob
 *
 * The heavy imports (scoreExport, verovioRenderer) are dynamic so
 * importing this module from a node test stays cheap and side-effect
 * free; only the pure helpers are reachable at module scope.
 */

import { deriveSlug } from "./marketplace";
import { TRANSPOSITIONS, type InstrumentPitch } from "./scoreGenerator";
import type { HarmonicPath } from "./paths";
import type { ArpStyle } from "./arpNotation";

/** Raster size in device pixels. */
export interface ScoreRasterSize {
  readonly width: number;
  readonly height: number;
}

/** Raster scale used when the caller does not pass one (print sharpness). */
const DEFAULT_RASTER_SCALE = 2;

/** Fallback raster geometry when an SVG declares no usable size. */
const DEFAULT_SVG_WIDTH = 2100;
const DEFAULT_SVG_HEIGHT = 1200;

/** Longest canvas edge allowed (browser canvas caps sit near 4k-8k). */
const MAX_RASTER_EDGE = 8192;

/** Options for buildScoreSvg. */
export interface BuildScoreSvgOptions {
  /** Arpeggiation style for the arp voice (toMusicXml default: quarters). */
  arpStyle?: ArpStyle;
  /** Transposition target; mapped through scoreGenerator TRANSPOSITIONS. */
  instrument?: InstrumentPitch;
}

/** Options for svgToPngBlob / scoreRasterSize. */
export interface RasterOptions {
  /** Output width in px; overrides `scale` and keeps the SVG aspect. */
  widthPx?: number;
  /** Multiplier applied to the SVG's intrinsic size (default 2). */
  scale?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (node-tested)
// ---------------------------------------------------------------------------

/**
 * Filename for one exported score: the marketplace slug of the path
 * title plus a normalized extension. Mirrors the MusicXML ZIP naming
 * (`path.title ?? path.name ?? "untitled"` + deriveSlug) so the same
 * exercise keeps the same stem across every archive the book flow
 * produces. An empty or symbol-only title falls back to "untitled";
 * an unusable extension falls back to "svg".
 */
export function scoreImageFilename(path: HarmonicPath, ext = "svg"): string {
  const slug = deriveSlug(path.title ?? path.name ?? "untitled");
  const cleanExt = ext.replace(/^\.+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${slug}.${cleanExt.length > 0 ? cleanExt : "svg"}`;
}

/** Read a numeric attribute (either quote style) off an SVG tag. */
function readSvgNumber(svg: string, attr: string): number {
  const match = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`).exec(svg);
  if (!match) return Number.NaN;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

/** viewBox="minX minY width height" -> the trailing width/height pair. */
function readViewBox(svg: string): { width: number; height: number } | null {
  const match = /\bviewBox\s*=\s*["']([^"']+)["']/.exec(svg);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4) return null;
  const width = parts[2];
  const height = parts[3];
  if (!Number.isFinite(width) || width <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

/**
 * Intrinsic size of an SVG string: declared width/height first (Verovio
 * emits both), then the viewBox, then a fixed default. Always returns
 * positive finite numbers so callers never divide by zero.
 */
export function parseSvgDimensions(svg: string): {
  width: number;
  height: number;
} {
  const width = readSvgNumber(svg, "width");
  const height = readSvgNumber(svg, "height");
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height };
  }
  const fromViewBox = readViewBox(svg);
  if (fromViewBox) return fromViewBox;
  return { width: DEFAULT_SVG_WIDTH, height: DEFAULT_SVG_HEIGHT };
}

/**
 * Raster pixel size for an SVG string.
 *
 * Math (pinned):
 *   - widthPx set: that width, height from the SVG aspect ratio.
 *   - otherwise: intrinsic size x scale (default 2, print sharpness).
 *   - every dimension is ceiled and floored at 1px.
 *   - the longest edge is clamped to MAX_RASTER_EDGE with the aspect
 *     ratio preserved, so a huge scale can never blow the canvas cap.
 *   - non-positive / non-finite scale or widthPx falls back to defaults.
 */
export function scoreRasterSize(
  svg: string,
  opts: RasterOptions = {},
): ScoreRasterSize {
  const intrinsic = parseSvgDimensions(svg);
  const aspect = intrinsic.height / intrinsic.width;

  const scale =
    typeof opts.scale === "number" &&
    Number.isFinite(opts.scale) &&
    opts.scale > 0
      ? opts.scale
      : DEFAULT_RASTER_SCALE;
  const widthPx =
    typeof opts.widthPx === "number" &&
    Number.isFinite(opts.widthPx) &&
    opts.widthPx > 0
      ? opts.widthPx
      : undefined;

  const rawWidth = widthPx ?? intrinsic.width * scale;
  const rawHeight =
    widthPx !== undefined ? widthPx * aspect : intrinsic.height * scale;

  let width = Math.max(1, Math.ceil(rawWidth));
  let height = Math.max(1, Math.ceil(rawHeight));

  const longest = Math.max(width, height);
  if (longest > MAX_RASTER_EDGE) {
    const shrink = MAX_RASTER_EDGE / longest;
    width = Math.max(1, Math.floor(width * shrink));
    height = Math.max(1, Math.floor(height * shrink));
  }
  return { width, height };
}

/**
 * Guarantee the SVG carries an xmlns declaration. An SVG loaded into
 * an <img> without one is treated as a non-SVG document by some
 * engines and fails to paint. Idempotent.
 */
export function ensureSvgNamespace(svg: string): string {
  if (/\bxmlns\s*=/.test(svg)) return svg;
  return svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

// ---------------------------------------------------------------------------
// Browser-only (not unit-tested per policy)
// ---------------------------------------------------------------------------

/**
 * Engrave one exercise as a standalone SVG string.
 *
 * The source is the arpeggiated score (voiceStyle "arp", trimmed to
 * the detected form) - the same pipeline the MusicXML ZIP uses - and
 * the engraving mirrors bookPdf: Verovio at page width 2100 with the
 * page height adjusted to the content so the exported file has no
 * trailing blank page.
 */
export async function buildScoreSvg(
  path: HarmonicPath,
  opts: BuildScoreSvgOptions = {},
): Promise<string> {
  const [{ toMusicXml }, { renderMusicXmlToSvg }] = await Promise.all([
    import("./scoreExport"),
    import("./verovioRenderer"),
  ]);
  const musicXml = toMusicXml(path, {
    voiceStyle: "arp",
    arpStyle: opts.arpStyle,
    transpose: TRANSPOSITIONS[opts.instrument ?? "Concert"],
    trimToForm: true,
  });
  return renderMusicXmlToSvg(musicXml, {
    pageWidth: 2100,
    scale: 100,
    breaks: "auto",
    adjustPageHeight: true,
  });
}

/**
 * Rasterize an engraved SVG to a PNG Blob on an offscreen canvas.
 *
 * The canvas is filled white first: music on a transparent background
 * is unreadable in every viewer that does not composite a backdrop.
 * Output is sized by scoreRasterSize (default 2x for print sharpness)
 * and the object URL is revoked on every exit path, including errors.
 */
export async function svgToPngBlob(
  svg: string,
  opts: RasterOptions = {},
): Promise<Blob> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("SVG to PNG rasterization requires a browser");
  }
  const { width, height } = scoreRasterSize(svg, opts);
  const url = URL.createObjectURL(
    new Blob([ensureSvgNamespace(svg)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return await canvasToPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load an image URL; rejects with a real Error on decode failure. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not rasterize the score SVG"));
    image.src = url;
  });
}

/** canvas.toBlob promise wrapper; null means the encoder failed. */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the score PNG"));
    }, "image/png");
  });
}
