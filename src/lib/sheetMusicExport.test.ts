// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  downloadSheetMusicPDF,
  pageBreakOffsets,
} from "./sheetMusicExport";
import type { HarmonicPath } from "./paths";

// Minimal fixture path: 8 steps = 8 BARS of audio truth (F3, D110:
// 1 step = 1 bar; the old "2 bars at STEPS_PER_BAR=4" reading was the
// retired labeling fiction). C x4 then G x4 - no smaller repeating
// period, so detectFormPeriod returns 8.
const FIXTURE_PATH: HarmonicPath = {
  id: "test-path",
  title: "Test C Major",
  description: "Smoke-test path for sheet music export",
  steps: [
    { name: "C", notes: [60], descriptions: "I" },
    { name: "C", notes: [60], descriptions: "I" },
    { name: "C", notes: [60], descriptions: "I" },
    { name: "C", notes: [60], descriptions: "I" },
    { name: "G", notes: [67], descriptions: "V" },
    { name: "G", notes: [67], descriptions: "V" },
    { name: "G", notes: [67], descriptions: "V" },
    { name: "G", notes: [67], descriptions: "V" },
  ],
  composer: "Test Composer",
  key: "C",
};

// svg2pdf.js requires jsPDF on the global AND has known issues under
// jsdom (the UMD init can't find the jsPDF export). We mock the PDF
// generation here and verify the full export via the browser smoke
// (scripts/smoke-composition.ts runs under playwright, which is real).
vi.mock("svg2pdf.js", () => ({
  svg2pdf: vi.fn(async () => Promise.resolve()),
}));
vi.mock("jspdf", () => {
  // A class (not an arrow factory) so `new jsPDF()` is legal — mocks
  // that return arrow functions are not constructible under vitest 5.
  // F3: the mock also RECORDS cover-page text() calls so the
  // Bars/Active-bar pins below can assert honest form-relative
  // numbers. A3: the recorder also counts addPage() calls so we can
  // assert honest multi-page tiling for tall SVGs.
  const textCalls: string[][] = [];
  let addPageCount = 0;
  class MockJsPDF {
    setFont(): void {}
    setFontSize(): void {}
    text(...args: unknown[]): void {
      textCalls.push(args.map((a) => String(a)));
    }
    addPage(): void {
      addPageCount++;
    }
    output(): Blob {
      return new Blob(["fake pdf"], { type: "application/pdf" });
    }
  }
  return { default: MockJsPDF, __textCalls: textCalls, __addPageCount: () => addPageCount, __resetAddPageCount: () => { addPageCount = 0; } };
});

// jsdom doesn't ship URL.createObjectURL/revokeObjectURL — polyfill
// them so downloadSheetMusicPDF can run in tests.
if (typeof URL.createObjectURL !== "function") {
  (URL as { createObjectURL: (b: Blob) => string }).createObjectURL =
    () => "blob:fake";
  (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
    () => {};
}

describe("sheetMusicExport", () => {
  it("throws on an empty path", async () => {
    const { exportSheetMusicPDF } = await import("./sheetMusicExport");
    const empty: HarmonicPath = { ...FIXTURE_PATH, steps: [] };
    await expect(
      exportSheetMusicPDF({
        path: empty,
        instrument: "C",
        composerName: "Test",
      }),
    ).rejects.toThrow(/empty/i);
  });

  it("produces a PDF Blob for a valid path (svg2pdf mocked)", async () => {
    const { exportSheetMusicPDF } = await import("./sheetMusicExport");
    const blob = await exportSheetMusicPDF({
      path: FIXTURE_PATH,
      instrument: "C",
      composerName: "Test Composer",
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
  });

  it("includes composer metadata when supplied (no throw)", async () => {
    const { exportSheetMusicPDF } = await import("./sheetMusicExport");
    const blob = await exportSheetMusicPDF({
      path: FIXTURE_PATH,
      instrument: "C",
      composerName: "Bach (Wendy Carlos)",
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("respects activeStepIndex for the cover-page marker", async () => {
    const { exportSheetMusicPDF } = await import("./sheetMusicExport");
    const blob = await exportSheetMusicPDF({
      path: FIXTURE_PATH,
      instrument: "C",
      composerName: "Test",
      activeStepIndex: 4, // bar 5 (F3: 1 step = 1 bar)
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("F3 (D110): cover page counts TRUE form bars, not steps/4", async () => {
    const { exportSheetMusicPDF } = await import("./sheetMusicExport");
    await exportSheetMusicPDF({
      path: FIXTURE_PATH,
      instrument: "C",
      composerName: "Test",
      activeStepIndex: 4,
    });
    const { __textCalls } = (await import("jspdf")) as unknown as {
      __textCalls: string[][];
    };
    const texts = __textCalls.map((c) => c[0]);
    // 8 steps, no smaller repeating period -> 8 honest form bars.
    // The legacy math printed "Bars: 2" (ceil(8/4)) and
    // "Active bar: 2" (floor(4/4)+1) - both wrong vs the audio.
    expect(texts).toContain("Bars: 8");
    expect(texts).toContain("Active bar: 5");
  });

  it("downloadSheetMusicPDF generates a slug filename", () => {
    const blob = new Blob(["fake pdf bytes"], { type: "application/pdf" });
    const filename = downloadSheetMusicPDF(blob, "My Test Path!");
    expect(filename).toMatch(/\.pdf$/);
    expect(filename).toMatch(/my-test-path/);
  });

  it("downloadSheetMusicPDF falls back when title is empty", () => {
    const blob = new Blob(["x"], { type: "application/pdf" });
    const filename = downloadSheetMusicPDF(blob, "");
    expect(filename).toBe("sheet-music.pdf");
  });

  it("A3 (multi-page): tall SVGs (height >= 3000) emit at least 2 score pages", async () => {
    // Force the rendered SVG to report a large intrinsic height so the
    // pagination math must produce >= 2 score pages.
    const originalGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      // The SVG element's intrinsic size drives scale + targetH +
      // pagination. 8000 width × 3000 height => 2 pages of usable
      // height at A4 - 40.
      if ((this as Element).tagName?.toLowerCase() === "svg") {
        return {
          x: 0,
          y: 0,
          width: 800,
          height: 3000,
          top: 0,
          right: 800,
          bottom: 3000,
          left: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      }
      return originalGetBCR.call(this);
    };
    try {
      // Dynamic import here is intentional — we need the mocked jspdf
      // module's recorder helpers (the static import above would
      // resolve before vi.mock takes effect on subsequent calls).
      const jspdf = (await import("jspdf")) as unknown as {
        __resetAddPageCount: () => void;
        __addPageCount: () => number;
      };
      jspdf.__resetAddPageCount();
      const { exportSheetMusicPDF } = await import("./sheetMusicExport");
      await exportSheetMusicPDF({
        path: FIXTURE_PATH,
        instrument: "C",
        composerName: "Test",
      });
      // Cover page is 1 + at least 2 score pages = >= 3 total addPage calls.
      expect(jspdf.__addPageCount()).toBeGreaterThanOrEqual(3);
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBCR;
    }
  });

  it("A3 (multi-page): pageBreakOffsets snaps to staff-system Y on multi-page mocks", () => {
    // The function is exported for unit pinning. Build a fake <svg>
    // with three <g transform="translate(_, Y)"> children and assert
    // page 2 snaps to the largest candidate <= the raw fold.
    const g = (y: number) => {
      const node = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      node.setAttribute("transform", `translate(0, ${y})`);
      return node;
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.appendChild(g(0));
    svg.appendChild(g(200));
    svg.appendChild(g(400));
    svg.appendChild(g(600));
    // usableH=500, scale=1, targetH=1200 => two pages: page 1 at 0,
    // page 2 should snap to 400 (largest candidate <= 500).
    const offsets = pageBreakOffsets(svg, 1, 500, 1200);
    expect(offsets[0]).toBe(0);
    expect(offsets).toContain(400);
  });
});

