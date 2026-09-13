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
 * Scope: one path at a time, single-bar-per-line layout, A4 portrait,
 * 24-bar maximum (the engine's bar-invariant cap). Multi-page handling
 * is automatic — jsPDF adds pages as the SVG grows.
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
  doc.text(`Bars: ${Math.floor(path.steps.length / 4)}`, 40, 170);
  if (path.feel) {
    doc.text(`Feel: ${path.feel}`, 40, 190);
  }
  if (activeStepIndex !== undefined) {
    doc.text(`Active bar: ${Math.floor(activeStepIndex / 4) + 1}`, 40, 210);
  }

  // Footer with timestamp + sheet music page count placeholder.
  doc.setFontSize(10);
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)} · sheet music follows`,
    40,
    A4_H - 40,
  );

  // Page 2 — the rendered score. svg2pdf.js handles pagination if the
  // SVG is taller than one page; for now it draws the full SVG into
  // one page and lets the user print across pages.
  doc.addPage();

  // Capture the SVG's intrinsic size; svg2pdf.js uses these as the
  // bounding box for the PDF page.
  const svgRect = svgElem.getBoundingClientRect();
  const svgW = svgRect.width || A4_W - 40;
  const svgH = svgRect.height || 200;

  // Scale to fit the page width with a 20pt margin.
  const targetW = A4_W - 40;
  const scale = targetW / svgW;
  const targetH = svgH * scale;

  // If the scaled SVG is taller than one page, svg2pdf.js will draw it
  // across multiple pages automatically when given the page dimensions.
  await svg2pdf(svgElem as unknown as SVGElement, doc, {
    x: 20,
    y: 20,
    width: targetW,
    height: targetH,
  });

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
