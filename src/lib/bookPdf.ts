/**
 * src/lib/bookPdf.ts - browser-side composition of the print-ready
 * practice book PDF. Thin orchestration over jsPDF + svg2pdf.js; all
 * content derivation lives in src/lib/bookGenerator.ts (node-tested).
 *
 * Page plan (Aebersold play-along + Real Book conventions):
 *   1. Cover (title, "Level: Advanced", author, counts)
 *   2. Table of contents (rendered last, moved to page 2)
 *   3. Per exercise:
 *      a. Tune page (Real Book): header band (title left, key/tempo/
 *         feel right), the engraved score with chord symbols ABOVE the
 *         staff (Verovio renders <harmony> from MusicXML), footer.
 *      b. Exercise page (Aebersold): exercise title, the changes
 *         (chord symbols in a row), the arpeggio/pattern notation,
 *         then a practice line.
 *   4. Scale Syllabus appendix: one page per exercise (parent scale +
 *      modes over the changes).
 *   5. Memory cards: front pages (2x2 grid, dashed cut lines, card
 *      numbers) followed by back pages in the SAME grid positions so
 *      double-sided printing aligns. Front = chord symbol large +
 *      roman numeral; back = chord tones + guide tones.
 *
 * Engraver: Verovio (WASM) is the DEFAULT; abcjs stays available as an
 * option. Research (REPORT_Jazz_Exercise_Book_Redesign.md) ranks
 * engraving quality Lilypond > Verovio > abcjs. A future backend slice
 * may add music21 + Lilypond (FastAPI endpoint) for publisher-grade
 * output; that is intentionally NOT part of this slice.
 *
 * Browser-only: depends on document.createElement, abcjs, jsPDF,
 * svg2pdf.js, Verovio WASM. Not unit-tested per policy (verified by
 * manual build).
 */

import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { renderPathToSvg } from "./sheetMusicExport";
import { toMusicXml } from "./scoreExport";
import { renderMusicXmlToSvg, parseSvgString } from "./verovioRenderer";
import type { HarmonicPath } from "./paths";
import type { InstrumentPitch } from "./scoreGenerator";
import type { ArpStyle } from "./arpNotation";
import {
  bookLayoutFor,
  layoutCardGrid,
  layoutScorePage,
  layoutExercisePage,
  layoutSyllabusPage,
  type BookLayout,
  type ExercisePageLayout,
  type PaperSize,
} from "./bookLayout";
import {
  deriveScaleSyllabus,
  modeForChord,
  type BookExercise,
  type MemoryCard,
} from "./bookGenerator";

export interface BookPdfArgs {
  exercises: BookExercise[];
  /** HarmonicPaths aligned by index with exercises (score rendering). */
  paths: HarmonicPath[];
  cards: MemoryCard[];
  title: string;
  author: string;
  instrument?: InstrumentPitch;
  /** Score engraver: Verovio (default) or abcjs (legacy option). */
  engraver?: "abcjs" | "verovio";
  /** Paper size for the book (default A4). */
  paper?: PaperSize;
  /** Arpeggiation style for the exercise pages (default triplets,
   *  the advanced-player default). */
  arpStyle?: ArpStyle;
}

/**
 * Compile the book into a single print-ready PDF Blob.
 *
 * The TOC is rendered last (page numbers are only known after the
 * exercises are laid out) and then moved to page 2 via jsPDF's
 * movePage. Every recorded page shifts down by 1 once the TOC
 * occupies page 2, so the TOC displays `page + 1`.
 */
export async function exportBookPdf(args: BookPdfArgs): Promise<Blob> {
  const {
    exercises,
    paths,
    cards,
    title,
    author,
    instrument = "Concert",
    engraver = "verovio",
    paper = "a4",
    arpStyle = "triplets",
  } = args;

  // All page geometry derives from the shared layout template so the
  // header, score, footer, and card grids never overlap.
  const layout = bookLayoutFor(paper);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: paper,
    compress: true,
  });

  // Page 1: cover.
  renderCover(doc, title, author, exercises.length, cards.length, layout);

  // Track where each exercise starts for the TOC.
  const tocEntries: { title: string; page: number }[] = [];

  // Per-exercise pages: tune page + exercise page.
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const path = paths[i];
    tocEntries.push({ title: ex.title, page: doc.getNumberOfPages() + 1 });

    await renderExercisePages(
      doc,
      ex,
      path,
      instrument,
      i,
      engraver,
      layout,
      arpStyle,
    );
  }

  // Scale Syllabus appendix: one page per exercise.
  const syllabusStartPage = doc.getNumberOfPages() + 1;
  for (let i = 0; i < exercises.length; i++) {
    renderSyllabusPage(doc, exercises[i], i, layout);
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
  renderToc(doc, title, tocEntries, syllabusStartPage, cardStartPage, layout);
  doc.movePage(tocPage, 2);

  // Footers (page number + book title) on every page, drawn last so
  // they sit on top of the final page order.
  renderFooters(doc, title, layout);

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
  doc.setFontSize(30);
  doc.text(title, margin, 120);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(120);
  doc.text("Level: Advanced", margin, 148);
  doc.setTextColor(0);

  doc.setFontSize(14);
  if (author) {
    doc.text(`by ${author}`, margin, 176);
  }

  doc.setFontSize(11);
  doc.text(`${exerciseCount} exercises`, margin, 210);
  doc.text(`${cardCount} memory cards`, margin, 230);
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)}`,
    margin,
    pageHeight - margin,
  );
}

/**
 * Render the per-exercise pages. Verovio mode renders a Real Book tune
 * page (block chords + harmony above) followed by an Aebersold
 * exercise page (arpeggio/pattern notation). abcjs mode renders the
 * exercise page with the legacy abcjs engraver.
 */
async function renderExercisePages(
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
    await renderTunePage(doc, ex, path, exerciseIndex, layout);
    await renderExercisePage(doc, ex, path, exerciseIndex, layout, arpStyle);
    return;
  }
  await renderAbcjsExercisePage(
    doc,
    ex,
    path,
    instrument,
    exerciseIndex,
    layout,
    arpStyle,
  );
}

/**
 * Real Book tune page: header band (title left, key/tempo/feel right),
 * the engraved score with chord symbols above the staff (Verovio
 * renders the MusicXML <harmony> elements), footer. The score is
 * scaled to fit the score band so header/score/footer never overlap.
 */
async function renderTunePage(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  exerciseIndex: number,
  layout: BookLayout,
): Promise<void> {
  const { pageWidth, margin } = layout;
  const score = layoutScorePage(exerciseIndex, layout);
  const musicXml = toMusicXml(path, {
    voiceStyle: "block",
    trimToForm: true,
  });
  const svgString = await renderMusicXmlToSvg(musicXml, {
    pageWidth: 2100,
    scale: 100,
    breaks: "auto",
    adjustPageHeight: true,
  });
  const svgElem = parseSvgString(svgString);

  const svgW =
    parseFloat(svgElem.getAttribute("width") ?? "") || pageWidth - 2 * margin;
  const svgH = parseFloat(svgElem.getAttribute("height") ?? "") || 200;

  const targetW = pageWidth - 2 * margin;
  const scale = Math.min(targetW / svgW, score.scoreHeight / svgH);
  const targetH = svgH * scale;

  doc.addPage();
  renderTuneHeader(doc, ex, score.headerY, layout);
  await svg2pdf(svgElem, doc, {
    x: margin,
    y: score.scoreY,
    width: svgW * scale,
    height: targetH,
  });
}

/** Tune header band: title left, key/tempo/feel right (Real Book). */
function renderTuneHeader(
  doc: jsPDF,
  ex: BookExercise,
  headerY: number,
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(ex.title, margin, headerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  const meta = [
    ex.key ? `Key: ${ex.key}` : "",
    ex.tempo > 0 ? `${ex.tempo} BPM` : "",
    ex.feel ? ex.feel : "",
  ]
    .filter(Boolean)
    .join("  |  ");
  if (meta) doc.text(meta, pageWidth - margin, headerY, { align: "right" });
  doc.setTextColor(0);
}

/**
 * Aebersold-style exercise page: exercise title, the changes (chord
 * symbols in a row), the arpeggio/pattern notation engraved via
 * Verovio, then a practice line. The notation is scaled to fit the
 * notation band so nothing overlaps the changes row or practice line.
 */
async function renderExercisePage(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  exerciseIndex: number,
  layout: BookLayout,
  arpStyle: ArpStyle,
): Promise<void> {
  const { pageWidth, margin } = layout;
  const exLayout = layoutExercisePage(exerciseIndex, layout);
  // Coker/Aebersold convention: the pattern page shows the first 8 bars
  // of the arpeggio, not the whole form - the player repeats it over the
  // changes. Keeps the engraved vector load per page bounded.
  const patternPath = { ...path, steps: path.steps.slice(0, 8) };
  const musicXml = toMusicXml(patternPath, {
    voiceStyle: "arp",
    arpStyle,
    trimToForm: false,
  });
  const svgString = await renderMusicXmlToSvg(musicXml, {
    pageWidth: 2100,
    scale: 100,
    breaks: "auto",
    adjustPageHeight: true,
  });
  const svgElem = parseSvgString(svgString);

  const svgW =
    parseFloat(svgElem.getAttribute("width") ?? "") || pageWidth - 2 * margin;
  const svgH = parseFloat(svgElem.getAttribute("height") ?? "") || 200;

  const targetW = pageWidth - 2 * margin;
  const scale = Math.min(targetW / svgW, exLayout.notationHeight / svgH);
  const targetH = svgH * scale;

  doc.addPage();
  renderExercisePageHeader(doc, ex, exerciseIndex, exLayout, layout);
  await svg2pdf(svgElem, doc, {
    x: margin,
    y: exLayout.notationY,
    width: svgW * scale,
    height: targetH,
  });
  renderExercisePagePractice(doc, ex, exLayout, layout);
}

/**
 * abcjs fallback for the exercise page: same Aebersold structure, but
 * the notation is engraved by abcjs via the shared renderPathToSvg
 * helper (kept as an option; Verovio is the default).
 */
async function renderAbcjsExercisePage(
  doc: jsPDF,
  ex: BookExercise,
  path: HarmonicPath,
  instrument: InstrumentPitch,
  exerciseIndex: number,
  layout: BookLayout,
  arpStyle: ArpStyle,
): Promise<void> {
  const { pageWidth, margin } = layout;
  const exLayout = layoutExercisePage(exerciseIndex, layout);
  const svgElem = renderPathToSvg(path, instrument, arpStyle);
  const svgRect = svgElem.getBoundingClientRect();
  const svgW = svgRect.width || pageWidth - 2 * margin;
  const svgH = svgRect.height || 200;

  const targetW = pageWidth - 2 * margin;
  const scale = Math.min(targetW / svgW, exLayout.notationHeight / svgH);
  const targetH = svgH * scale;

  doc.addPage();
  renderExercisePageHeader(doc, ex, exerciseIndex, exLayout, layout);
  await svg2pdf(svgElem as unknown as SVGElement, doc, {
    x: margin,
    y: exLayout.notationY,
    width: svgW * scale,
    height: targetH,
  });
  renderExercisePagePractice(doc, ex, exLayout, layout);
}

/** Exercise page header: title + changes row (chord symbols). */
function renderExercisePageHeader(
  doc: jsPDF,
  ex: BookExercise,
  exerciseIndex: number,
  exLayout: ExercisePageLayout,
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Exercise ${exerciseIndex + 1}: ${ex.title}`, margin, exLayout.titleY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Changes", margin, exLayout.changesY - 14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const chordLine = ex.chordNames.join("   ");
  const chordLines = doc.splitTextToSize(chordLine, pageWidth - 2 * margin);
  doc.text(chordLines, margin, exLayout.changesY);
}

/** Exercise page footer line: the practice note callout. */
function renderExercisePagePractice(
  doc: jsPDF,
  ex: BookExercise,
  exLayout: ExercisePageLayout,
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Practice", margin, exLayout.practiceY - 14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const practice = ex.practiceNotes[0] ?? "Run the arpeggios over the changes.";
  const practiceLines = doc.splitTextToSize(practice, pageWidth - 2 * margin);
  doc.text(practiceLines, margin, exLayout.practiceY);
}

/**
 * Scale Syllabus appendix page: parent scale for the exercise plus the
 * modes suggested by its chord progression, each paired with the
 * chords that imply it (Omnibook/Aebersold convention).
 */
function renderSyllabusPage(
  doc: jsPDF,
  ex: BookExercise,
  exerciseIndex: number,
  layout: BookLayout,
): void {
  const { pageWidth, margin } = layout;
  const syl = layoutSyllabusPage(exerciseIndex, layout);
  const syllabus = deriveScaleSyllabus(ex);

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Scale Syllabus: ${ex.title}`, margin, syl.headerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Parent scale: ${syllabus.parentScale}`, margin, syl.contentY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Modes over the changes", margin, syl.contentY + 26);

  const modeToChords = new Map<string, string[]>();
  for (const chord of ex.chordNames) {
    const mode = modeForChord(chord);
    const list = modeToChords.get(mode) ?? [];
    list.push(chord);
    modeToChords.set(mode, list);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = syl.contentY + 46;
  for (const [mode, chords] of modeToChords) {
    doc.setFont("helvetica", "bold");
    doc.text(mode, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(chords.join("  "), margin + 170, y);
    y += 20;
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
      // Front: roman numeral (muted, small) above the chord symbol
      // (large, bold).
      if (card.roman) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(120);
        doc.text(card.roman, pos.x + pos.w / 2, pos.y + pos.h / 2 - 24, {
          align: "center",
        });
        doc.setTextColor(0);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      const lines = doc.splitTextToSize(card.front, pos.w - 20);
      doc.text(lines, pos.x + pos.w / 2, pos.y + pos.h / 2, {
        align: "center",
      });
    } else {
      // Back: chord tones + source, with a muted guide-tones line.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const lines = doc.splitTextToSize(card.back, pos.w - 20);
      doc.text(lines, pos.x + pos.w / 2, pos.y + pos.h / 2 - 8, {
        align: "center",
      });
      if (card.guideTones && card.guideTones.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(120);
        doc.text(
          `Guide tones: ${card.guideTones.join(" ")}`,
          pos.x + pos.w / 2,
          pos.y + pos.h / 2 + 22,
          { align: "center" },
        );
        doc.setTextColor(0);
      }
    }
  }
}

function renderToc(
  doc: jsPDF,
  title: string,
  entries: { title: string; page: number }[],
  syllabusStartPage: number,
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
  doc.text("Scale Syllabus", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(syllabusStartPage + 1), pageWidth - margin, y, {
    align: "right",
  });

  y += 20;
  doc.setFont("helvetica", "bold");
  doc.text("Memory Cards", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(cardStartPage + 1), pageWidth - margin, y, {
    align: "right",
  });
}

/** Footer on every page: book title left, page number right. */
function renderFooters(
  doc: jsPDF,
  title: string,
  layout: BookLayout,
): void {
  const { pageWidth, margin, footerHeight } = layout;
  const pageCount = doc.getNumberOfPages();
  const baseline = layout.pageHeight - margin - footerHeight / 2;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(title, margin, baseline);
    doc.text(String(p), pageWidth - margin, baseline, { align: "right" });
    doc.setTextColor(0);
  }
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