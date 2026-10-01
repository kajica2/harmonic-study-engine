/**
 * src/lib/bookLayout.ts - pure page-geometry math for the print-ready
 * book PDF. Node-testable (no DOM, no jsPDF).
 *
 * All page coordinates in the book generator derive from one of these
 * functions so nothing can overlap:
 *   - bookLayoutFor: paper dimensions + margins + card grid constants
 *   - layoutCardGrid: memory-card positions computed from margins and
 *     gaps (never overlapping, never exceeding the page)
 *   - layoutScorePage: vertical bands (header / score / footer) that
 *     partition the page with no intersection
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
  /** Y baseline for the exercise header text. */
  headerY: number;
  /** Y where the score content starts. */
  scoreY: number;
  /** Vertical space available for the score (footerY - scoreY). */
  scoreHeight: number;
  /** Y baseline for the footer text. */
  footerY: number;
}

/**
 * Page geometry for a paper size. A4 is 595x842pt, letter is
 * 612x792pt; both use a 48pt margin, a 40pt header band, a 30pt
 * footer band, and a 2x2 memory-card grid with a 12pt gap.
 */
export function bookLayoutFor(paper: PaperSize): BookLayout {
  const base = {
    margin: 48,
    headerHeight: 40,
    footerHeight: 30,
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
 * Vertical rhythm for a score page: a header band at the top, a score
 * band in the middle, and a footer band at the bottom. The bands
 * partition the page (header ends where the score starts, the score
 * ends where the footer starts), so nothing can overlap.
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