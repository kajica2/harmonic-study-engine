/**
 * src/lib/verovioRenderer.ts - browser-side Verovio (WASM) engraving.
 *
 * Verovio renders MusicXML into publication-quality engraved SVG. This
 * module is the thin browser-only bridge: it owns the WASM module
 * lifecycle (one module-level singleton, loaded lazily on first use)
 * and exposes two render helpers:
 *
 *   - renderMusicXmlToSvg: MusicXML -> engraved SVG string
 *   - renderMusicXmlToPdf: MusicXML -> single-page A4 PDF Blob
 *     (SVG -> svg2pdf.js -> jsPDF, the same pipeline sheetMusicExport
 *     uses for abcjs output)
 *
 * The toolkit is a singleton because instantiating the WASM module is
 * expensive; setOptions is called before every loadData so concurrent
 * callers cannot leak options between renders. Browser-only (WASM +
 * DOMParser + jsPDF): NOT unit-tested per policy.
 */

import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { VerovioOptions, VerovioToolkit } from "verovio/esm";

/** A4 portrait in points - 595.28 x 841.89 */
const A4_W = 595.28;
const A4_H = 841.89;

/** Page margin (pts). */
const MARGIN = 40;

/** Verovio's default page width in internal units (2100). */
const DEFAULT_PAGE_WIDTH = 2100;

/** Verovio's default render scale in percent (100). */
const DEFAULT_SCALE = 100;

export interface VerovioRenderOptions {
  /** Page width in Verovio internal units (default 2100). */
  pageWidth?: number;
  /** Render scale in percent (default 100). */
  scale?: number;
  /** Layout breaks: "auto" | "line" | "none". */
  breaks?: string;
  /** Spacing between staves (internal units). */
  spacingStaff?: number;
  /** Spacing between systems (internal units). */
  spacingSystem?: number;
  /** Font family override. */
  font?: string;
  /** Shrink the page height to fit the content. */
  adjustPageHeight?: boolean;
}

let toolkitPromise: Promise<VerovioToolkit> | null = null;

/**
 * Lazily instantiate the Verovio toolkit. The WASM module is fetched
 * and compiled once; subsequent calls resolve the same instance.
 */
export function loadVerovio(): Promise<VerovioToolkit> {
  if (toolkitPromise === null) {
    toolkitPromise = (async () => {
      const [{ default: createVerovioModule }, { VerovioToolkit }] =
        await Promise.all([import("verovio/wasm"), import("verovio/esm")]);
      const module = await createVerovioModule();
      return new VerovioToolkit(module);
    })();
  }
  return toolkitPromise;
}

/** Normalize render options onto Verovio's option surface. */
function toVerovioOptions(opts: VerovioRenderOptions): VerovioOptions {
  return {
    pageWidth: opts.pageWidth ?? DEFAULT_PAGE_WIDTH,
    scale: opts.scale ?? DEFAULT_SCALE,
    breaks: opts.breaks ?? "auto",
    ...(opts.spacingStaff !== undefined && { spacingStaff: opts.spacingStaff }),
    ...(opts.spacingSystem !== undefined && { spacingSystem: opts.spacingSystem }),
    ...(opts.font !== undefined && { font: opts.font }),
    ...(opts.adjustPageHeight !== undefined && {
      adjustPageHeight: opts.adjustPageHeight,
    }),
  };
}

/**
 * Render a MusicXML score to an engraved SVG string via Verovio.
 * Options are applied before loadData so each render is independent.
 */
export async function renderMusicXmlToSvg(
  musicXml: string,
  opts: VerovioRenderOptions = {},
): Promise<string> {
  if (!musicXml || musicXml.trim().length === 0) {
    throw new Error("Cannot engrave empty MusicXML");
  }
  const toolkit = await loadVerovio();
  toolkit.setOptions(toVerovioOptions(opts));
  const ok = toolkit.loadData(musicXml);
  if (!ok) {
    throw new Error("Verovio failed to parse the MusicXML score");
  }
  return toolkit.renderToSVG(1);
}

/**
 * Render a MusicXML score to a single-page A4 PDF Blob. The engraved
 * SVG is parsed into a detached SVGElement and drawn onto the page via
 * svg2pdf.js, scaled to fit the printable width (same pipeline as the
 * abcjs sheet-music export).
 */
export async function renderMusicXmlToPdf(
  musicXml: string,
  opts: VerovioRenderOptions = {},
): Promise<Blob> {
  const svgString = await renderMusicXmlToSvg(musicXml, opts);
  const svgElem = parseSvgString(svgString);

  const svgW = parseFloat(svgElem.getAttribute("width") ?? "") || A4_W - 2 * MARGIN;
  const svgH = parseFloat(svgElem.getAttribute("height") ?? "") || 200;

  const targetW = A4_W - 2 * MARGIN;
  const scale = targetW / svgW;
  const targetH = svgH * scale;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });
  await svg2pdf(svgElem, doc, {
    x: MARGIN,
    y: MARGIN,
    width: targetW,
    height: targetH,
  });
  return doc.output("blob");
}

/**
 * Parse an SVG string into a detached SVGElement (browser-only).
 * Exported so bookPdf can draw the engraved SVG with a header via
 * svg2pdf.js without re-parsing.
 */
export function parseSvgString(svgString: string): SVGElement {
  const parsed = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const svg = parsed.querySelector("svg");
  if (!svg) {
    throw new Error("Verovio did not produce an <svg> element");
  }
  return svg;
}