/**
 * src/lib/bookLayout.ts - pure page-geometry math for the print-ready
 * book PDF. Node-testable (no DOM, no jsPDF).
 *
 * All page coordinates in the book generator derive from one of these
 * functions so nothing can overlap:
 *   - bookLayoutFor: paper dimensions + margins + card grid constants
 *   - layoutCardGrid: memory-card positions computed from margins and
 *     gaps (never overlapping, never exceeding the page)
 *   - layoutScorePage: Real Book tune-page bands (header / score /
 *     footer) that partition the page with no intersection
 *   - layoutExercisePage: Aebersold exercise-page bands (title /
 *     changes / notation / practice / footer)
 *   - layoutSyllabusPage: Scale Syllabus appendix bands (header /
 *     content / footer)
 *
 * The geometry follows published jazz-book conventions (Aebersold
 * play-along volumes + Real Book lead sheets): a ~54pt margin, a tune
 * header band with the title left and key/tempo/feel right, generous
 * whitespace around the engraved score, and a footer carrying the page
 * number + book title.
 */

export type PaperSize = "a4" | "letter";

export interface BookLayout {
  /** Page width in points. */
  pageWidth: number;
  /** Page height in points. */
  pageHeight: number;
  /** Margin around the printable area (points). */
  margin: number;
  /** Height of the header band above each score (points). */
  headerHeight: number;
  /** Height of the footer band below each score (points). */
  footerHeight: number;
  /** Memory-card grid columns. */
  cardCols: number;
  /** Memory-card grid rows. */
  cardRows: number;
  /** Gap between memory cards (points). */
  cardGap: number;
}

export interface CardPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardGridLayout {
  /** Number of front pages (one grid per page). */
  frontPages: number;
  /** Number of back pages (same grid positions, double-sided). */
  backPages: number;
  /** Cards per page (cardCols * cardRows). */
  cardsPerPage: number;
  /** One position per card slot on a page, in reading order. */
  positions: CardPosition[];
}

export interface ScorePageLayout {
  /** Y baseline for the tune header text (title left, meta right). */
  headerY: number;
  /** Y where the score content starts. */
  scoreY: number;
  /** Vertical space available for the score (footerY - scoreY). */
  scoreHeight: number;
  /** Y where the footer band starts. */
  footerY: number;
}

export interface ExercisePageLayout {
  /** Y baseline for the exercise title. */
  titleY: number;
  /** Y baseline for the changes row (chord symbols). */
  changesY: number;
  /** Y where the arpeggio/pattern notation starts. */
  notationY: number;
  /** Vertical space available for the notation. */
  notationHeight: number;
  /** Y baseline for the practice line. */
  practiceY: number;
  /** Y where the footer band starts. */
  footerY: number;
}

export interface SyllabusPageLayout {
  /** Y baseline for the syllabus header. */
  headerY: number;
  /** Y where the syllabus content starts. */
  contentY: number;
  /** Vertical space available for the content. */
  contentHeight: number;
  /** Y where the footer band starts. */
  footerY: number;
}

/**
 * Page geometry for a paper size. A4 is 595x842pt, letter is
 * 612x792pt; both use a 54pt margin (Real Book style), a 60pt tune
 * header band, a 36pt footer band, and a 2x2 memory-card grid with a
 * 12pt gap.
 */
export function bookLayoutFor(paper: PaperSize): BookLayout {
  const base = {
    margin: 54,
    headerHeight: 60,
    footerHeight: 36,
    cardCols: 2,
    cardRows: 2,
    cardGap: 12,
  };
  if (paper === "letter") {
    return { ...base, pageWidth: 612, pageHeight: 792 };
  }
  return { ...base, pageWidth: 595, pageHeight: 842 };
}

/**
 * Memory-card grid math. Positions are computed from the margins and
 * the inter-card gap, so adjacent cards never overlap and the last
 * card always fits inside the printable area. Front and back pages
 * share the same positions so double-sided printing aligns.
 */
export function layoutCardGrid(
  cardCount: number,
  layout: BookLayout,
): CardGridLayout {
  const { pageWidth, pageHeight, margin, cardCols, cardRows, cardGap } =
    layout;
  const cardsPerPage = Math.max(1, cardCols * cardRows);
  const pages = Math.max(0, Math.ceil(cardCount / cardsPerPage));
  const cardW = (pageWidth - 2 * margin - (cardCols - 1) * cardGap) / cardCols;
  const cardH = (pageHeight - 2 * margin - (cardRows - 1) * cardGap) / cardRows;

  const positions: CardPosition[] = [];
  for (let i = 0; i < cardsPerPage; i++) {
    const col = i % cardCols;
    const row = Math.floor(i / cardCols);
    positions.push({
      x: margin + col * (cardW + cardGap),
      y: margin + row * (cardH + cardGap),
      w: cardW,
      h: cardH,
    });
  }
  return { frontPages: pages, backPages: pages, cardsPerPage, positions };
}

/**
 * Vertical rhythm for a Real Book tune page: a header band at the top
 * (title left, key/tempo/feel right), a score band in the middle, and
 * a footer band at the bottom. The bands partition the page (header
 * ends where the score starts, the score ends where the footer
 * starts), so nothing can overlap.
 *
 * `exerciseIndex` is reserved for per-exercise layout variation; the
 * current template is uniform across exercises.
 */
export function layoutScorePage(
  exerciseIndex: number,
  layout: BookLayout,
): ScorePageLayout {
  const { pageHeight, margin, headerHeight, footerHeight } = layout;
  const headerY = margin + headerHeight / 2;
  const scoreY = margin + headerHeight;
  const footerY = pageHeight - margin - footerHeight;
  const scoreHeight = footerY - scoreY;
  return { headerY, scoreY, scoreHeight, footerY };
}

/**
 * Vertical rhythm for an Aebersold-style exercise page: title, a
 * changes row (chord symbols), the arpeggio/pattern notation, a
 * practice line, then the footer. Bands are ordered top to bottom and
 * never intersect; the notation band is the flexible middle.
 */
export function layoutExercisePage(
  exerciseIndex: number,
  layout: BookLayout,
): ExercisePageLayout {
  const { pageHeight, margin, footerHeight } = layout;
  const titleY = margin + 24;
  const changesY = margin + 58;
  const notationY = margin + 96;
  const footerY = pageHeight - margin - footerHeight;
  const practiceY = footerY - 44;
  const notationHeight = practiceY - notationY - 28;
  return { titleY, changesY, notationY, notationHeight, practiceY, footerY };
}

/**
 * Vertical rhythm for a Scale Syllabus appendix page: header, content
 * band (parent scale + modes over the changes), footer. The content
 * band fills the space between header and footer.
 */
export function layoutSyllabusPage(
  exerciseIndex: number,
  layout: BookLayout,
): SyllabusPageLayout {
  const { pageHeight, margin, footerHeight } = layout;
  const headerY = margin + 24;
  const contentY = margin + 64;
  const footerY = pageHeight - margin - footerHeight;
  const contentHeight = footerY - contentY;
  return { headerY, contentY, contentHeight, footerY };
}