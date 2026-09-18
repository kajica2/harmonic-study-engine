// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  downloadSheetMusicPDF,
} from "./sheetMusicExport";
import type { HarmonicPath } from "./paths";

// Minimal fixture path: 8 steps (2 bars at STEPS_PER_BAR=4), C major
// triad repeated. Mirrors how the engine builds practice paths.
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
  class MockJsPDF {
    setFont(): void {}
    setFontSize(): void {}
    text(): void {}
    addPage(): void {}
    output(): Blob {
      return new Blob(["fake pdf"], { type: "application/pdf" });
    }
  }
  return { default: MockJsPDF };
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
      activeStepIndex: 4, // bar 2
    });
    expect(blob).toBeInstanceOf(Blob);
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
});

