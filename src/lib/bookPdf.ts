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
import type { ArpStyle } from "./arpNotation";
import {
  bookLayoutFor,
  layoutCardGrid,
  layoutScorePage,
  type BookLayout,
  type PaperSize,
} from "./bookLayout";
import type { BookExercise, MemoryCard } from "./bookGenerator";

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
  /** Paper size for the book (default A4). */
  paper?: PaperSize;
  /** Arpeggiation style for the score pages (default quarters). */
  arpStyle?: ArpStyle;
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
    paper = "a4",
    arpStyle = "quarters",
  } = args;

  // All page geometry derives from the shared layout template so the
  // header, score, footer, and card grids never overlap.
  const layout = bookLayoutFor(paper);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: paper,
  });

  // Page 1: cover.
  renderCover(doc, title, author, exercises.length, cards.length, layout);

  // Track where each exercise starts for the TOC.
  const tocEntries: { title: string; page: number }[] = [];

  // Per-exercise pages.
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const path = paths[i];
    tocEntries.push({ title: ex.title, page: doc.getNumberOfPages() + 1 });

    await renderScorePages(doc, ex, path, instrument, i, engraver, layout, arpStyle);
    renderChordChart(doc, ex, path, i, layout);
    renderPracticeNotes(doc, ex, i, layout);
  }

  // Memory cards: front pages then back pages (same grid positions).
  const cardLayout = layoutCardGrid(cards.length, layout);
  const cardStartPage = doc.getNumberOfPages() + 1;
  for (let p = 0; p < cardLayout.frontPages; p++) {
    doc.addPage();
    renderCardGrid(doc, cards, p, layout, "front");
  }
  for (let p = 0; p < cardLayout.backPages; p++) {
    doc.addPage();
    renderCardGrid(doc, cards, p, layout, "back");
  }

  // TOC: render last, then move to page 2.
  const tocPage = doc.getNumberOfPages() + 1;
  doc.addPage();
  renderToc(doc, title, tocEntries, cardStartPage, layout);
  doc.movePage(tocPage, 2);

  return doc.output("blob");
}

function renderCover(
  doc: jsPDF,
  title: string,
  author: string,
  exerciseCount: number,
  cardCount: number,
  layout: BookLayout,
): void {
  const { pageWidth, pageHeight, margin } = layout;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(title, margin, 120);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  if (author) {
    doc.text(`by ${author}`, margin, 150);
  }

  doc.setFontSize(11);
  doc.text(`${exerciseCount} exercises`, margin, 190);
  doc.text(`${cardCount} memory cards`, margin, 210);
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)}`,
    margin,
    pageHeight - margin,
  );
}

async function renderScorePages(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  instrument: InstrumentPitch,
  exerciseIndex: number,
  engraver: "abcjs" | "verovio",
  layout: BookLayout,
  arpStyle: ArpStyle,
): Promise<void> {
  if (engraver === "verovio") {
    await renderVerovioScorePages(doc, ex, path, exerciseIndex, layout, arpStyle);
    return;
  }
  const { pageWidth, margin } = layout;
  const score = layoutScorePage(exerciseIndex, layout);
  const svgElem = renderPathToSvg(path, instrument, arpStyle);
  const svgRect = svgElem.getBoundingClientRect();
  const svgW = svgRect.width || pageWidth - 2 * margin;
  const svgH = svgRect.height || 200;

  const targetW = pageWidth - 2 * margin;
  const scale = targetW / svgW;
  const targetH = svgH * scale;
  const usableH = score.scoreHeight;
  const offsets = pageBreakOffsets(svgElem, scale, usableH, targetH);

  for (let i = 0; i < offsets.length; i++) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, margin, score.headerY);
    await svg2pdf(svgElem as unknown as SVGElement, doc, {
      x: margin,
      y: score.scoreY - offsets[i] * scale,
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
  layout: BookLayout,
  arpStyle: ArpStyle,
): Promise<void> {
  const { pageWidth, margin } = layout;
  const score = layoutScorePage(exerciseIndex, layout);
  const musicXml = toMusicXml(path, {
    voiceStyle: "arp",
    arpStyle,
    trimToForm: true,
  });
  const svgString = await renderMusicXmlToSvg(musicXml, {
    pageWidth: 2100,
    scale: 100,
    breaks: "auto",
    adjustPageHeight: true,
  });
  const svgElem = parseSvgString(svgString);

  const svgW = parseFloat(svgElem.getAttribute("width") ?? "") || pageWidth - 2 * margin;
  const svgH = parseFloat(svgElem.getAttribute("height") ?? "") || 200;

  const targetW = pageWidth - 2 * margin;
  const scale = targetW / svgW;
  const targetH = svgH * scale;

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, margin, score.headerY);
  await svg2pdf(svgElem, doc, {
    x: margin,
    y: score.scoreY,
    width: targetW,
    height: targetH,
  });
}

function renderChordChart(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  exerciseIndex: number,
  layout: BookLayout,
): void {
  const { pageWidth, pageHeight, margin } = layout;
  const steps = path.steps;
  const cellW = (pageWidth - 2 * margin) / 4;
  const cellH = 44;
  const rowsPerPage = Math.floor((pageHeight - 130 - margin) / cellH);
  const perPage = rowsPerPage * 4;

  for (let start = 0; start < steps.length; start += perPage) {
    if (start > 0) doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, margin, 60);
    doc.setFontSize(11);
    doc.text("Chord Chart", margin, 80);

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
    if (meta) doc.text(meta, margin, 100);

    const chunk = steps.slice(start, start + perPage);
    chunk.forEach((step, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = margin + col * cellW;
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
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, margin, 60);
  doc.setFontSize(11);
  doc.text("Practice Notes", margin, 80);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 110;
  const notes =
    ex.practiceNotes.length > 0 ? ex.practiceNotes : ["No practice notes yet."];
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, pageWidth - 2 * margin - 20);
    doc.text(`- ${lines[0]}`, margin, y);
    y += 16;
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i], margin + 12, y);
      y += 16;
    }
    y += 8;
  }

  if (ex.tags.length > 0) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Tags:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(ex.tags.join(", "), margin + 44, y);
  }
}

function renderCardGrid(
  doc: jsPDF,
  cards: MemoryCard[],
  pageIndex: number,
  layout: BookLayout,
  side: "front" | "back",
): void {
  const grid = layoutCardGrid(cards.length, layout);
  const { positions, cardsPerPage } = grid;

  for (let i = 0; i < cardsPerPage; i++) {
    const cardIndex = pageIndex * cardsPerPage + i;
    if (cardIndex >= cards.length) break;
    const card = cards[cardIndex];
    const pos = positions[i];

    // Dashed cut line around the card.
    doc.setLineDashPattern([4, 4], 0);
    doc.setDrawColor(150);
    doc.rect(pos.x, pos.y, pos.w, pos.h);
    doc.setLineDashPattern([], 0);

    // Card number (top-left corner) so the user can verify alignment
    // after double-sided printing.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Card ${cardIndex + 1}`, pos.x + 8, pos.y + 12);
    doc.setTextColor(0);

    if (side === "front") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      const lines = doc.splitTextToSize(card.front, pos.w - 20);
      doc.text(lines, pos.x + pos.w / 2, pos.y + pos.h / 2, { align: "center" });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const lines = doc.splitTextToSize(card.back, pos.w - 20);
      doc.text(lines, pos.x + pos.w / 2, pos.y + pos.h / 2, { align: "center" });
    }
  }
}

function renderToc(
  doc: jsPDF,
  title: string,
  entries: { title: string; page: number }[],
  cardStartPage: number,
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Table of Contents", margin, 60);
  doc.setFontSize(11);
  doc.text(title, margin, 80);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = 110;
  entries.forEach((entry, i) => {
    doc.text(`${i + 1}. ${entry.title}`, margin, y);
    doc.text(String(entry.page + 1), pageWidth - margin, y, { align: "right" });
    y += 20;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Memory Cards", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(cardStartPage + 1), pageWidth - margin, y, { align: "right" });
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