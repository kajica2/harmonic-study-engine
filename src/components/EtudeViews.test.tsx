/**
 * EtudeViews.test.tsx - PRD-001 Phase 3 Slice 2 (T7) + fix round.
 *
 * jsdom via the src-components TSX glob in vitest.config.ts. Pins the tab
 * default (roll), the lazy staff boundary mounting on switch (abcjs
 * renderAbc under jsdom is proven by src/lib/sheetMusicExport.test.ts
 * + the component's own try/catch fallback), the staff container's
 * role=img + aria-label, a 32-bar etude rendering without crashing,
 * and - fix round (TESTER GAP-2) - the renderAbc THROW branch:
 * console.warn + text-summary fallback, no crash.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// GAP-2 (fix round): controllable abcjs seam. vi.mock is hoisted above
// all imports; the factory DELEGATES to the real module unless the
// hoisted flag is raised, so the existing staff tests keep proving
// real abcjs renders under jsdom while the new test pins the THROW
// branch of EtudeStaffView's try/catch.
const abcjsState = vi.hoisted(() => ({ fail: false }));
vi.mock("abcjs", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: { renderAbc: (...args: unknown[]) => unknown };
  };
  const realRenderAbc = actual.default.renderAbc.bind(actual.default);
  return {
    ...actual,
    default: {
      ...actual.default,
      renderAbc: (...args: unknown[]): unknown => {
        if (abcjsState.fail) {
          throw new Error("forced abcjs failure (GAP-2 test seam)");
        }
        return realRenderAbc(...args);
      },
    },
  };
});

import { EtudeViews } from "./EtudeViews";
import {
  DEFAULT_ETUDE_CONSTRAINTS,
  generateEtudeFor,
} from "../lib/etudeEngine";
import type { Annotation } from "../../engine/pedagogy/types";

afterEach(() => {
  cleanup();
});

const MINI = generateEtudeFor({
  ...DEFAULT_ETUDE_CONSTRAINTS,
  bars: 8,
  seed: 13,
})!;

const BIG = generateEtudeFor({
  ...DEFAULT_ETUDE_CONSTRAINTS,
  bars: 32,
  seed: 909,
})!;

describe("EtudeViews", () => {
  it("defaults to the roll tab (staff not mounted)", () => {
    render(
      <EtudeViews
        etude={MINI}
        pathId="etu-test"
        transposeShift={0}
        activeBar={null}
      />,
    );
    expect(screen.getByTestId("etude-piano-roll")).toBeTruthy();
    expect(screen.queryByTestId("etude-staff-host")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Piano roll" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("switching to Staff mounts the lazy boundary + a11y container", async () => {
    render(
      <EtudeViews
        etude={MINI}
        pathId="etu-test"
        transposeShift={0}
        activeBar={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));
    const host = await screen.findByTestId("etude-staff-host");
    expect(host.getAttribute("role")).toBe("img");
    expect(host.getAttribute("aria-label")).toContain("bar melody");
    // Roll unmounts when the staff tab is active.
    expect(screen.queryByTestId("etude-piano-roll")).toBeNull();
  });

  it("renders a 32-bar etude without crashing (roll + staff)", async () => {
    render(
      <EtudeViews
        etude={BIG}
        pathId="etu-big"
        transposeShift={3}
        activeBar={7}
      />,
    );
    const svg = screen.getByTestId("etude-piano-roll");
    expect(svg.querySelectorAll('[data-kind="column"]').length).toBe(32 * 8);
    expect(svg.querySelectorAll(".etu-roll-active-bar").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));
    // Either a rendered score or the warned fallback - never a crash.
    expect(await screen.findByTestId("etude-staff-host")).toBeTruthy();
  });

  it("GAP-2: renderAbc THROW -> console.warn + text-summary fallback, no crash", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    abcjsState.fail = true;
    try {
      render(
        <EtudeViews
          etude={MINI}
          pathId="etu-throw"
          transposeShift={0}
          activeBar={null}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Staff" }));
      // The guarded catch surfaces the accessible text summary...
      const fallback = await screen.findByText(
        /Staff rendering is unavailable right now/,
      );
      expect(fallback.textContent).toContain("bar melody"); // melodySummary
      // ...warns through the error-reporting channel (console policy),
      // and keeps the host container mounted (progressive enhancement,
      // not a crash).
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EtudeStaffView] abcjs render failed"),
        expect.anything(),
      );
      expect(screen.getByTestId("etude-staff-host")).toBeTruthy();
    } finally {
      abcjsState.fail = false;
      warnSpy.mockRestore();
    }
  });
});

// ---------- T8 (PRD-001 Phase 3 Slice 3, D37/D40) ------------------------
//
// Annotation display surfaces: margin chips (bar prefixes, active-bar
// highlight, concept -> drawer), the Notes toggle (REQ-PED-7), the
// About panel (full list + "What is <title>?" triggers), and the
// print hooks (print-area on the section, print-hide on the toolbar,
// Print button present - window.print is NEVER asserted, jsdom has
// no print).

describe("EtudeViews annotations (T8)", () => {
  const ANN_CHORD: Annotation = {
    version: 1,
    id: "ann-t8-chord",
    target: { kind: "chord", bar: 2 },
    label: "ii-V-I start",
    text: "The ii chord opens the turnaround here.",
    conceptId: "ii-v-i",
    confidence: 1,
  };
  const ANN_PROG: Annotation = {
    version: 1,
    id: "ann-t8-prog",
    target: { kind: "progression", fromBar: 2, toBar: 4 },
    label: "Turnaround",
    text: "Bars 3-5 cycle back to the tonic.",
    conceptId: "cadence",
    confidence: 1,
  };
  const ANN_MEL: Annotation = {
    version: 1,
    id: "ann-t8-mel",
    target: { kind: "melody" },
    label: "Guide tones",
    text: "The melody leans on chord sevenths.",
    conceptId: null,
    confidence: null,
  };
  const WITH_ANN = {
    ...MINI,
    annotations: [ANN_CHORD, ANN_PROG, ANN_MEL],
  };

  const renderAnn = (activeBar: number | null = null) =>
    render(
      <EtudeViews
        etude={WITH_ANN}
        pathId="etu-ann"
        transposeShift={0}
        activeBar={activeBar}
      />,
    );

  it("chips render with bar prefixes; null-concept renders as static text", () => {
    renderAnn();
    const chordChip = screen.getByTestId("annotation-chip-ann-t8-chord");
    expect(chordChip.textContent).toContain("[m3]");
    expect(chordChip.tagName).toBe("BUTTON");
    expect(
      screen.getByTestId("annotation-chip-ann-t8-prog").textContent,
    ).toContain("[m3-5]");
    // melody target -> "melody" prefix, STATIC (no dead click target).
    const mel = screen.getByTestId("annotation-static-ann-t8-mel");
    expect(mel.textContent).toContain("[melody]");
    expect(mel.tagName).toBe("SPAN");
  });

  it("active-bar chip gets the brand-border highlight (live by construction)", () => {
    renderAnn(2); // bar 2 is covered by the chord + progression chips
    const cls = screen
      .getByTestId("annotation-chip-ann-t8-chord")
      .getAttribute("class");
    expect(cls).toContain("border-[color:var(--color-brand)]");
    // Bar 7 is outside every annotation: no highlight.
    cleanup();
    renderAnn(7);
    expect(
      screen
        .getByTestId("annotation-chip-ann-t8-chord")
        .getAttribute("class"),
    ).not.toContain("border-[color:var(--color-brand)]");
  });

  it("chip click opens the ConceptDrawer (REQ-PED-5)", () => {
    renderAnn();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("annotation-chip-ann-t8-chord"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("The ii-V-I Progression");
    // Escape (ModalShell) closes it.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Notes toggle (aria-pressed, default ON) hides chips + About (REQ-PED-7)", () => {
    renderAnn();
    const notesBtn = screen.getByRole("button", { name: "Notes" });
    expect(notesBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("About this etude")).toBeTruthy();
    fireEvent.click(notesBtn);
    expect(notesBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("annotation-chip-ann-t8-chord")).toBeNull();
    expect(screen.queryByText("About this etude")).toBeNull();
    fireEvent.click(notesBtn);
    expect(screen.getByTestId("annotation-chip-ann-t8-chord")).toBeTruthy();
  });

  it("About details lists every annotation text + concept triggers", () => {
    renderAnn();
    fireEvent.click(screen.getByText("About this etude")); // open
    expect(screen.getByText("The ii chord opens the turnaround here.")).toBeTruthy();
    expect(screen.getByText("Bars 3-5 cycle back to the tonic.")).toBeTruthy();
    expect(screen.getByText("The melody leans on chord sevenths.")).toBeTruthy();
    // Title echo line: style . key mode . bars . difficulty . seed.
    expect(
      screen.getByText(new RegExp(`seed ${WITH_ANN.seed}`)),
    ).toBeTruthy();
    // ConceptId-bearing entries get a "What is <title>?" trigger
    // (ANN_PROG -> the "cadence" concept, titled "Cadences").
    fireEvent.click(
      screen.getByRole("button", { name: "What is Cadences?" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Cadences");
    // Related navigation works from the About-opened drawer too.
    expect(dialog.textContent).toContain("ii-V-I");
  });

  it("print hooks: section carries print-area; toolbar is print-hide; Print button present", () => {
    const { container } = renderAnn();
    const section = container.querySelector("section.print-area");
    expect(section).toBeTruthy();
    const printBtn = screen.getByRole("button", { name: "Print" });
    // The Print affordance lives in the print-hidden toolbar row.
    expect(printBtn.closest(".print-hide")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notes" }).closest(".print-hide")).toBeTruthy();
  });
});
