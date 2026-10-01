/**
 * src/lib/bookPdf.ts - browser-side composition of the print-ready
 * practice book PDF. Thin orchestration over jsPDF + svg2pdf.js; all
 * content derivation lives in src/lib/bookGenerator.ts (node-tested).
 *
 * Page plan:
 *   1. Cover (title, author, exercise count, card count)
 *   2. Table of contents (rendered last, moved to page 2)
 *   3. Per exercise: score page(s) (abcjs -> svg2pdf via the shared
 *      renderPathToSvg helper), chord chart, practice notes
 *   4. Memory cards: front pages (2x2 grid, dashed cut lines, card
 *      numbers) followed by back pages in the SAME grid positions so
 *      double-sided printing aligns.
 *
 * Browser-only: depends on document.createElement, abcjs, jsPDF,
 * svg2pdf.js. Not unit-tested per policy (verified by manual build).
 */

import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { renderPathToSvg, pageBreakOffsets } from "./sheetMusicExport";
import { toMusicXml } from "./scoreExport";
import { renderMusicXmlToSvg, parseSvgString } from "./verovioRenderer";
import type { HarmonicPath } from "./paths";
import type { InstrumentPitch } from "./scoreGenerator";
import {
  cardGridLayout,
  type BookExercise,
  type MemoryCard,
} from "./bookGenerator";

/** A4 portrait in points - 595.28 x 841.89 */
const A4_W = 595.28;
const A4_H = 841.89;

/** Page margin (pts). */
const MARGIN = 40;

/** Vertical space reserved for the exercise header above each score. */
const SCORE_HEADER_H = 36;

export interface BookPdfArgs {
  exercises: BookExercise[];
  /** HarmonicPaths aligned by index with exercises (score rendering). */
  paths: HarmonicPath[];
  cards: MemoryCard[];
  title: string;
  author: string;
  instrument?: InstrumentPitch;
  /** Score engraver: abcjs (default, frozen) or Verovio (WASM). */
  engraver?: "abcjs" | "verovio";
}

/**
 * Compile the book into a single print-ready PDF Blob.
 *
 * The TOC is rendered last (page numbers are only known after the
 * exercises are laid out) and then moved to page 2 via jsPDF's
 * movePage. Every recorded exercise page shifts down by 1 once the
 * TOC occupies page 2, so the TOC displays `page + 1`.
 */
export async function exportBookPdf(args: BookPdfArgs): Promise<Blob> {
  const {
    exercises,
    paths,
    cards,
    title,
    author,
    instrument = "Concert",
    engraver = "abcjs",
  } = args;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  // Page 1: cover.
  renderCover(doc, title, author, exercises.length, cards.length);

  // Track where each exercise starts for the TOC.
  const tocEntries: { title: string; page: number }[] = [];

  // Per-exercise pages.
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const path = paths[i];
    tocEntries.push({ title: ex.title, page: doc.getNumberOfPages() + 1 });

    await renderScorePages(doc, ex, path, instrument, i, engraver);
    renderChordChart(doc, ex, path, i);
    renderPracticeNotes(doc, ex, i);
  }

  // Memory cards: front pages then back pages (same grid positions).
  const layout = cardGridLayout(cards.length);
  const cardStartPage = doc.getNumberOfPages() + 1;
  for (let p = 0; p < layout.pages; p++) {
    doc.addPage();
    renderCardGrid(doc, cards, p, layout.cardsPerPage, "front");
  }
  for (let p = 0; p < layout.pages; p++) {
    doc.addPage();
    renderCardGrid(doc, cards, p, layout.cardsPerPage, "back");
  }

  // TOC: render last, then move to page 2.
  const tocPage = doc.getNumberOfPages() + 1;
  doc.addPage();
  renderToc(doc, title, tocEntries, cardStartPage);
  doc.movePage(tocPage, 2);

  return doc.output("blob");
}

function renderCover(
  doc: jsPDF,
  title: string,
  author: string,
  exerciseCount: number,
  cardCount: number,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(title, MARGIN, 120);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  if (author) {
    doc.text(`by ${author}`, MARGIN, 150);
  }

  doc.setFontSize(11);
  doc.text(`${exerciseCount} exercises`, MARGIN, 190);
  doc.text(`${cardCount} memory cards`, MARGIN, 210);
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)}`,
    MARGIN,
    A4_H - MARGIN,
  );
}

async function renderScorePages(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  instrument: InstrumentPitch,
  exerciseIndex: number,
  engraver: "abcjs" | "verovio",
): Promise<void> {
  if (engraver === "verovio") {
    await renderVerovioScorePages(doc, ex, path, exerciseIndex);
    return;
  }
  const svgElem = renderPathToSvg(path, instrument);
  const svgRect = svgElem.getBoundingClientRect();
  const svgW = svgRect.width || A4_W - 2 * MARGIN;
  const svgH = svgRect.height || 200;

  const targetW = A4_W - 2 * MARGIN;
  const scale = targetW / svgW;
  const targetH = svgH * scale;
  const usableH = A4_H - MARGIN - SCORE_HEADER_H - MARGIN;
  const offsets = pageBreakOffsets(svgElem, scale, usableH, targetH);

  for (let i = 0; i < offsets.length; i++) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, MARGIN, MARGIN + 14);
    await svg2pdf(svgElem as unknown as SVGElement, doc, {
      x: MARGIN,
      y: MARGIN + SCORE_HEADER_H - offsets[i] * scale,
      width: targetW,
      height: targetH,
    });
  }
}

/**
 * Verovio score pages: engrave the path's MusicXML (arp voice, form
 * trimmed) via the WASM renderer and draw the single-page SVG onto the
 * PDF with the same exercise header as the abcjs path. Verovio's
 * adjustPageHeight fits the whole form on one engraved page, so no
 * page-break tiling is needed.
 */
async function renderVerovioScorePages(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  exerciseIndex: number,
): Promise<void> {
  const musicXml = toMusicXml(path, { voiceStyle: "arp", trimToForm: true });
  const svgString = await renderMusicXmlToSvg(musicXml, {
    pageWidth: 2100,
    scale: 100,
    breaks: "auto",
    adjustPageHeight: true,
  });
  const svgElem = parseSvgString(svgString);

  const svgW = parseFloat(svgElem.getAttribute("width") ?? "") || A4_W - 2 * MARGIN;
  const svgH = parseFloat(svgElem.getAttribute("height") ?? "") || 200;

  const targetW = A4_W - 2 * MARGIN;
  const scale = targetW / svgW;
  const targetH = svgH * scale;

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, MARGIN, MARGIN + 14);
  await svg2pdf(svgElem, doc, {
    x: MARGIN,
    y: MARGIN + SCORE_HEADER_H,
    width: targetW,
    height: targetH,
  });
}

function renderChordChart(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  exerciseIndex: number,
): void {
  const steps = path.steps;
  const cellW = (A4_W - 2 * MARGIN) / 4;
  const cellH = 44;
  const rowsPerPage = Math.floor((A4_H - 130 - MARGIN) / cellH);
  const perPage = rowsPerPage * 4;

  for (let start = 0; start < steps.length; start += perPage) {
    if (start > 0) doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, MARGIN, 60);
    doc.setFontSize(11);
    doc.text("Chord Chart", MARGIN, 80);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const meta = [
      ex.key ? `Key: ${ex.key}` : "",
      ex.tempo > 0 ? `Tempo: ${ex.tempo} BPM` : "",
      ex.feel ? `Feel: ${ex.feel}` : "",
      ex.bars > 0 ? `Bars: ${ex.bars}` : "",
    ]
      .filter(Boolean)
      .join("  |  ");
    if (meta) doc.text(meta, MARGIN, 100);

    const chunk = steps.slice(start, start + perPage);
    chunk.forEach((step, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = MARGIN + col * cellW;
      const cy = 130 + row * cellH;
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`b${start + i + 1}`, x + 4, cy + 12);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(step.name, x + 4, cy + 30);
      doc.setFont("helvetica", "normal");
    });
  }
}

function renderPracticeNotes(
  doc: jsPDF,
  ex: BookExercise,
  exerciseIndex: number,
): void {
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, MARGIN, 60);
  doc.setFontSize(11);
  doc.text("Practice Notes", MARGIN, 80);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 110;
  const notes =
    ex.practiceNotes.length > 0 ? ex.practiceNotes : ["No practice notes yet."];
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, A4_W - 2 * MARGIN - 20);
    doc.text(`- ${lines[0]}`, MARGIN, y);
    y += 16;
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i], MARGIN + 12, y);
      y += 16;
    }
    y += 8;
  }

  if (ex.tags.length > 0) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Tags:", MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(ex.tags.join(", "), MARGIN + 44, y);
  }
}

function renderCardGrid(
  doc: jsPDF,
  cards: MemoryCard[],
  pageIndex: number,
  cardsPerPage: number,
  side: "front" | "back",
): void {
  const cols = 2;
  const rows = 2;
  const gap = 24;
  const cardW = (A4_W - 2 * MARGIN - gap) / cols;
  const cardH = (A4_H - 2 * MARGIN - gap) / rows;

  for (let i = 0; i < cardsPerPage; i++) {
    const cardIndex = pageIndex * cardsPerPage + i;
    if (cardIndex >= cards.length) break;
    const card = cards[cardIndex];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + gap);
    const y = MARGIN + row * (cardH + gap);

    // Dashed cut line around the card.
    doc.setLineDashPattern([4, 4], 0);
    doc.setDrawColor(150);
    doc.rect(x, y, cardW, cardH);
    doc.setLineDashPattern([], 0);

    // Card number (top-left corner) so the user can verify alignment
    // after double-sided printing.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Card ${cardIndex + 1}`, x + 8, y + 12);
    doc.setTextColor(0);

    if (side === "front") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      const lines = doc.splitTextToSize(card.front, cardW - 20);
      doc.text(lines, x + cardW / 2, y + cardH / 2, { align: "center" });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const lines = doc.splitTextToSize(card.back, cardW - 20);
      doc.text(lines, x + cardW / 2, y + cardH / 2, { align: "center" });
    }
  }
}

function renderToc(
  doc: jsPDF,
  title: string,
  entries: { title: string; page: number }[],
  cardStartPage: number,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Table of Contents", MARGIN, 60);
  doc.setFontSize(11);
  doc.text(title, MARGIN, 80);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = 110;
  entries.forEach((entry, i) => {
    doc.text(`${i + 1}. ${entry.title}`, MARGIN, y);
    doc.text(String(entry.page + 1), A4_W - MARGIN, y, { align: "right" });
    y += 20;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Memory Cards", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(cardStartPage + 1), A4_W - MARGIN, y, { align: "right" });
}

/**
 * Browser download trigger for the generated book PDF. Returns the
 * filename used (caller can show this in the UI).
 */
export function downloadBookPDF(blob: Blob, bookTitle: string): string {
  const slug = (bookTitle ?? "practice-book")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const filename = `${slug || "practice-book"}.pdf`;
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