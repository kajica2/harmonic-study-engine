/**
 * src/lib/bookLayout.test.ts - PIN-001 for the pure book page geometry.
 * Node project (no DOM, no jsPDF).
 */

import { describe, it, expect } from "vitest";
import {
  bookLayoutFor,
  layoutCardGrid,
  layoutScorePage,
  type BookLayout,
} from "./bookLayout";

function assertPairwiseDisjoint(positions: { x: number; y: number; w: number; h: number }[]): void {
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      expect(
        overlapX && overlapY,
        `positions ${i} and ${j} overlap: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      ).toBe(false);
    }
  }
}

describe("bookLayoutFor", () => {
  it("A4 is 595x842 with the standard margins", () => {
    const l = bookLayoutFor("a4");
    expect(l.pageWidth).toBe(595);
    expect(l.pageHeight).toBe(842);
    expect(l.margin).toBe(48);
    expect(l.headerHeight).toBe(40);
    expect(l.footerHeight).toBe(30);
    expect(l.cardCols).toBe(2);
    expect(l.cardRows).toBe(2);
    expect(l.cardGap).toBe(12);
  });

  it("letter is 612x792 with the same margins", () => {
    const l = bookLayoutFor("letter");
    expect(l.pageWidth).toBe(612);
    expect(l.pageHeight).toBe(792);
    expect(l.margin).toBe(48);
    expect(l.headerHeight).toBe(40);
    expect(l.footerHeight).toBe(30);
    expect(l.cardCols).toBe(2);
    expect(l.cardRows).toBe(2);
    expect(l.cardGap).toBe(12);
  });

  it("A4 is taller than letter", () => {
    expect(bookLayoutFor("a4").pageHeight).toBeGreaterThan(
      bookLayoutFor("letter").pageHeight,
    );
  });
});

describe("layoutCardGrid", () => {
  it("computes 2x2 pages for 24 cards", () => {
    const grid = layoutCardGrid(24, bookLayoutFor("a4"));
    expect(grid.frontPages).toBe(6);
    expect(grid.backPages).toBe(6);
    expect(grid.cardsPerPage).toBe(4);
    expect(grid.positions.length).toBe(4);
  });

  it("rounds up partial pages", () => {
    const grid = layoutCardGrid(5, bookLayoutFor("a4"));
    expect(grid.frontPages).toBe(2);
    expect(grid.backPages).toBe(2);
  });

  it("returns zero pages for zero cards", () => {
    const grid = layoutCardGrid(0, bookLayoutFor("a4"));
    expect(grid.frontPages).toBe(0);
    expect(grid.backPages).toBe(0);
  });

  it("positions never overlap (pairwise disjoint)", () => {
    for (const paper of ["a4", "letter"] as const) {
      const grid = layoutCardGrid(24, bookLayoutFor(paper));
      assertPairwiseDisjoint(grid.positions);
    }
  });

  it("positions stay inside the printable area", () => {
    for (const paper of ["a4", "letter"] as const) {
      const l = bookLayoutFor(paper);
      const grid = layoutCardGrid(24, l);
      for (const p of grid.positions) {
        expect(p.x).toBeGreaterThanOrEqual(l.margin);
        expect(p.y).toBeGreaterThanOrEqual(l.margin);
        expect(p.x + p.w).toBeLessThanOrEqual(l.pageWidth - l.margin + 1e-9);
        expect(p.y + p.h).toBeLessThanOrEqual(l.pageHeight - l.margin + 1e-9);
      }
    }
  });

  it("cards fill the full printable width and height minus gaps", () => {
    const l = bookLayoutFor("a4");
    const grid = layoutCardGrid(4, l);
    const last = grid.positions[grid.positions.length - 1];
    expect(last.x + last.w).toBeCloseTo(l.pageWidth - l.margin, 5);
    expect(last.y + last.h).toBeCloseTo(l.pageHeight - l.margin, 5);
  });
});

describe("layoutScorePage", () => {
  it("partitions the page into header, score, and footer bands", () => {
    const l = bookLayoutFor("a4");
    const s = layoutScorePage(0, l);
    // Header band: [margin, scoreY)
    expect(s.headerY).toBe(l.margin + l.headerHeight / 2);
    expect(s.scoreY).toBe(l.margin + l.headerHeight);
    // Footer band: [footerY, pageHeight - margin)
    expect(s.footerY).toBe(l.pageHeight - l.margin - l.footerHeight);
    // Score band fills the space between header and footer.
    expect(s.scoreHeight).toBe(s.footerY - s.scoreY);
  });

  it("header, score, and footer regions never overlap", () => {
    for (const paper of ["a4", "letter"] as const) {
      const l = bookLayoutFor(paper);
      const s = layoutScorePage(0, l);
      const headerBottom = s.scoreY;
      const scoreBottom = s.footerY;
      expect(headerBottom).toBeLessThanOrEqual(scoreBottom);
      expect(scoreBottom).toBeLessThanOrEqual(l.pageHeight - l.margin);
      expect(s.scoreHeight).toBeGreaterThan(0);
    }
  });

  it("is uniform across exercises", () => {
    const l = bookLayoutFor("a4");
    const a = layoutScorePage(0, l);
    const b = layoutScorePage(7, l);
    expect(a).toEqual(b);
  });
});