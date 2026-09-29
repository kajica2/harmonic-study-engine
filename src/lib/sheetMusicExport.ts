/**
 * src/lib/sheetMusicExport.ts — turn the currently-active path into a
 * sheet-music PDF. Bridges the existing `renderLeadSheet` (abcjs → SVG)
 * and the existing `RecordingModal` pattern (jsPDF + svg2pdf.js).
 *
 * Why this exists: the engine already produces a PDF via the recording
 * modal, but that flow is gated behind recording a take. Users want to
 * print the practice path they're working on right now. This module
 * exposes that path directly.
 *
 * Multi-page handling: jsPDF clips content outside the page bounds,
 * so we draw the full score SVG into one `svg2pdf()` call per page
 * with the SVG shifted up by `offsetY * scale` on each successive
 * page. Page breaks snap to the Y coordinate of the next staff
 * system group (`<g transform="translate(x, y)">`) so we never slice
 * a staff mid-line. This produces real multi-page output where the
 * legacy "Multi-page handling is automatic" claim was wishful — that
 * implementation simply drew the full score into one page and let
 * the user print across pages.
 *
 * Scope: one path at a time, single-bar-per-line layout (one ABC bar
 * per HarmonicStep), A4 portrait. The cover page (page 1) and the
 * rendered score (page 2+) are produced here; the landscape PDF
 * export in `RecordingModal` is a separate flow and untouched.
 *
 * The output:
 *   - Page 1: title, composer, key, form, total bars
 *   - Page 2+: rendered sheet music (abcjs SVG → jsPDF via svg2pdf.js)
 *
 * Usage:
 *   const blob = await exportSheetMusicPDF(path, instrument, composerName);
 *   // blob is a Blob (PDF) — trigger a download in the UI.
 *
 * Browser-only: depends on document.createElement, abcjs, jsPDF, svg2pdf.js.
 */

import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { buildLeadSheetAbc } from "./leadSheet";
import type { HarmonicPath } from "./paths";
import type { InstrumentPitch } from "./scoreGenerator";
import abcjs from "abcjs";
// F3 (D110, blast-table #15): the cover page counts TRUE form bars.
import { detectFormPeriod } from "./formPeriod";
import { barOfStep, totalFormBars } from "../../engine/practice/windows";

export interface SheetMusicExportArgs {
  /** The path to render. */
  path: HarmonicPath;
  /** Instrument pitch context (used for transposition + voicing). */
  instrument: InstrumentPitch;
  /** Composer name (shown on the cover page). */
  composerName?: string;
  /** Active step index — optional highlight marker (future). */
  activeStepIndex?: number;
}

/** A4 portrait in points — 595.28 × 841.89 */
const A4_W = 595.28;
const A4_H = 841.89;

/** Top/bottom margins (pts) — both 20pt, leaving A4_H - 40 usable. */
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 20;

/**
 * Compute the SVG-space Y offsets where each successive score page
 * should start. The first page is always at offset 0; subsequent pages
 * snap to the largest candidate staff-system Y that's <= the raw fold
 * line `(i + 1) * usableH / scale`, falling back to the raw fold when
 * no candidate is available.
 *
 * Exported for direct unit pinning. Pure DOM operation: it reads the
 * `<g transform="translate(x, y)">` attributes abcjs emits for each
 * staff system — no rendering, no mutation.
 */
export function pageBreakOffsets(
  svg: Element,
  scale: number,
  usableH: number,
  targetH: number,
): number[] {
  const candidates: number[] = [];
  for (const child of Array.from(svg.children)) {
    if (!(child instanceof Element)) continue;
    const transform = child.getAttribute("transform");
    if (!transform) continue;
    const match = transform.match(/translate\(\s*[-\d.]+\s*,\s*([-\d.]+)/);
    if (!match) continue;
    const y = parseFloat(match[1]);
    if (Number.isFinite(y)) candidates.push(y);
  }
  candidates.sort((a, b) => a - b);

  const offsets: number[] = [0];
  const usableSvg = usableH / scale;
  const stopAt = targetH / scale;
  let i = 1;
  let lastOffset = 0;
  while (true) {
    const rawFold = i * usableSvg;
    // Largest candidate <= rawFold (or 0 if none).
    let snap = 0;
    for (const c of candidates) {
      if (c <= rawFold) snap = c;
      else break;
    }
    // If no candidate was <= rawFold, snap = rawFold (legacy fallback).
    const offset = snap > 0 ? snap : rawFold;
    // Stop when we've reached the bottom of the SVG OR when we can't
    // make further progress (offset didn't advance).
    if (offset >= stopAt) break;
    if (offset <= lastOffset) break;
    offsets.push(offset);
    lastOffset = offset;
    i++;
  }
  return offsets;
}

/**
 * Render a HarmonicPath to a PDF Blob.
 *
 * Returns a Promise<Blob> resolving to an application/pdf Blob.
 * Throws if the path is empty or if the SVG render fails.
 */
export async function exportSheetMusicPDF(
  args: SheetMusicExportArgs,
): Promise<Blob> {
  const { path, instrument, composerName, activeStepIndex } = args;

  if (!path.steps || path.steps.length === 0) {
    throw new Error("Cannot export an empty path");
  }

  // Build the ABC notation from the existing lead-sheet helper — same
  // data shape as the in-app LeadSheet component, so the PDF matches
  // what the user is seeing on screen.
  const abc = buildLeadSheetAbc(path, instrument);

  // Render to a detached div. We can't use document.body directly
  // because the user would see a flash of unstyled SVG. The div is
  // removed after the SVG is captured.
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-99999px";
  host.style.width = `${A4_W}pt`;
  document.body.appendChild(host);

  let svgElem: Element | null = null;
  try {
    abcjs.renderAbc(host, abc, {
      responsive: "resize",
      staffwidth: A4_W - 40, // ~40pt margin (20pt each side)
      add_classes: true,
    });
    svgElem = host.querySelector("svg");
    if (!svgElem) {
      throw new Error("abcjs.renderAbc did not produce an <svg> element");
    }
  } finally {
    // Detach the host div even if renderAbc throws.
    document.body.removeChild(host);
  }

  // Build the PDF: cover page first, then the rendered score.
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  // Page 1 — cover.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(path.title ?? path.name ?? "Untitled", 40, 80);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  if (composerName) {
    doc.text(`Composer: ${composerName}`, 40, 110);
  }
  if (path.composer) {
    doc.text(`Composer tag: ${path.composer}`, 40, 130);
  }
  if (path.key) {
    doc.text(`Key: ${path.key}`, 40, 150);
  }
  // F3 (#15): 1 step = 1 bar of audio truth; the cover shows the
  // FORM (padded repeats of the same bars are not extra bars).
  const formLen = totalFormBars(detectFormPeriod(path.steps));
  doc.text(`Bars: ${formLen}`, 40, 170);
  if (path.feel) {
    doc.text(`Feel: ${path.feel}`, 40, 190);
  }
  if (activeStepIndex !== undefined) {
    doc.text(`Active bar: ${barOfStep(activeStepIndex, formLen) + 1}`, 40, 210);
  }

  // Footer with timestamp + sheet music page count placeholder.
  doc.setFontSize(10);
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)} · sheet music follows`,
    40,
    A4_H - 40,
  );

  // Capture the SVG's intrinsic size; svg2pdf.js uses these as the
  // bounding box for the PDF page.
  const svgRect = svgElem.getBoundingClientRect();
  const svgW = svgRect.width || A4_W - 40;
  const svgH = svgRect.height || 200;

  // Scale to fit the page width with a 20pt margin.
  const targetW = A4_W - 40;
  const scale = targetW / svgW;
  const targetH = svgH * scale;
  const usableH = A4_H - MARGIN_TOP - MARGIN_BOTTOM;

  // Compute page-tile offsets. Each tile is the full SVG shifted up
  // so the visible window on the PDF page falls on the next system.
  const offsets = pageBreakOffsets(svgElem, scale, usableH, targetH);

  // Page 2 — the rendered score. svg2pdf.js draws the full SVG into
  // the page; we shift Y by `-offset * scale` to bring the next page's
  // portion into view. jsPDF clips off-page SVG content automatically.
  for (let i = 0; i < offsets.length; i++) {
    doc.addPage();
    await svg2pdf(svgElem as unknown as SVGElement, doc, {
      x: MARGIN_TOP,
      y: MARGIN_TOP - offsets[i] * scale,
      width: targetW,
      height: targetH,
    });
  }

  return doc.output("blob");
}

/**
 * Browser download trigger for the generated PDF. Returns the filename
 * used (caller can show this in the UI as "Downloaded <filename>").
 */
export function downloadSheetMusicPDF(
  blob: Blob,
  pathTitle: string,
): string {
  const slug = (pathTitle ?? "sheet-music")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const filename = `${slug || "sheet-music"}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}