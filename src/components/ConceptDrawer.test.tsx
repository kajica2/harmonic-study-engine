/**
 * ConceptDrawer.test.tsx - PRD-001 Phase 3 Slice 3 (T7).
 *
 * jsdom via the src/components TSX glob (auto-registered).
 *
 * Pins: a REAL registry concept ("ii-v-i") renders title / category
 * / definition / body paragraphs; an unknown id renders NOTHING
 * (defensive guard, no console noise); related-chip click switches
 * the shown concept (key-prop pattern is the host's job); Escape
 * delegates to onClose through the ModalShell wiring (the trap is
 * NOT reimplemented here); and the D38 REFERENCE-SPLIT render path
 * (fix round, REVIEWER M1) via a fixture concept injected through
 * the concepts-module mock - all 8 REAL registry concepts ship
 * references: null, so the anchor/plain-text branch is otherwise
 * DORMANT and unpinnable through production data.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConceptDrawer } from "./ConceptDrawer";
import { getConcept } from "../../engine/pedagogy/concepts";
import type { Concept } from "../../engine/pedagogy/types";

/** D38 FIXTURE (see header): a concept whose references exercise the
 *  "label - URL" split on a LAST " - " with a DASH IN THE LABEL,
 *  plus a non-URL ref that must render as plain text. */
const { FIXTURE_CONCEPTS } = vi.hoisted(() => ({
  FIXTURE_CONCEPTS: {
    "fixture-refs": {
      version: 1,
      id: "fixture-refs",
      title: "Reference Split Fixture",
      category: "harmony",
      definition: "Fixture concept exercising the D38 reference-split render path.",
      body: "First paragraph.\n\nSecond paragraph.",
      references: [
        "Dash - Label - https://x.dev",
        "Berliard, T. - Trumpet method, no URL tail here",
      ],
      related: [],
      exampleNumerals: [],
    },
  },
}));

vi.mock("../../engine/pedagogy/concepts", async (importOriginal) => {
  const real = await importOriginal<
    typeof import("../../engine/pedagogy/concepts")
  >();
  return {
    ...real,
    // Fixture ids resolve to the fixtures; EVERYTHING ELSE falls
    // through to the real registry, so the existing ii-v-i pins
    // keep testing production data.
    getConcept: (id: string): Concept | null =>
      (FIXTURE_CONCEPTS as Record<string, Concept>)[id] ?? real.getConcept(id),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConceptDrawer (T7)", () => {
  it("renders the real ii-v-i registry concept", () => {
    const concept = getConcept("ii-v-i");
    expect(concept).not.toBeNull(); // registry pin upstream
    render(<ConceptDrawer conceptId="ii-v-i" onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("The ii-V-I Progression");
    expect(dialog.textContent).toContain("harmony"); // category label
    expect(dialog.textContent).toContain(concept!.definition);
    // Body splits on \n\n into >= 2 paragraphs.
    expect(concept!.body.split("\n\n").length).toBeGreaterThanOrEqual(2);
    for (const para of concept!.body.split("\n\n")) {
      expect(dialog.textContent).toContain(para.trim().slice(0, 40));
    }
  });

  it("unknown conceptId renders NOTHING (defensive guard, no noise)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <ConceptDrawer conceptId="nope" onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("related-chip click switches the shown concept (in-drawer nav)", () => {
    render(<ConceptDrawer conceptId="ii-v-i" onClose={() => {}} />);
    // ii-v-i related: cadence, tritone-sub, voice-leading.
    const chip = screen.getByRole("button", {
      name: "Open concept Tritone Substitution",
    });
    fireEvent.click(chip);
    // The HEADING switched (not appended). Note: the tritone-sub
    // related list links back to ii-v-i, so a chip with that title
    // exists - assert on the dialog's heading, not raw textContent.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Tritone Substitution");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Escape delegates to onClose via the ModalShell wiring", () => {
    const onClose = vi.fn();
    render(<ConceptDrawer conceptId="ii-v-i" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<ConceptDrawer conceptId="ii-v-i" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close concept" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // FIX ROUND (REVIEWER M1, design-mandated D38): the reference-split
  // RENDER path. splitReference() itself is correct today - this pins
  // the anchor/plain-text rendering + the LAST-" - " semantics against
  // a label that CONTAINS its own " - ", so a future firstIndexOf (or
  // trim/rel) regression fails here, not silently in production where
  // the branch is dormant (all 8 real concepts ship references: null).
  it("D38 fixture: 'label - URL' splits on the LAST ' - '; non-URL ref stays plain text", () => {
    render(<ConceptDrawer conceptId="fixture-refs" onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("References");

    // "Dash - Label - https://x.dev" -> label "Dash - Label" (the
    // FIRST " - " belongs to the label), href is the URL tail.
    const anchor = screen.getByRole("link", { name: "Dash - Label" });
    expect(anchor.getAttribute("href")).toBe("https://x.dev");
    expect(anchor.textContent).toBe("Dash - Label");
    // External-link hygiene (design-mandated): noopener noreferrer +
    // new tab.
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");

    // The non-URL ref renders as PLAIN TEXT - no anchor, full string
    // (its own " - " included) preserved verbatim.
    const plain = screen.getByText(
      "Berliard, T. - Trumpet method, no URL tail here",
    );
    expect(plain.tagName).toBe("LI");
    expect(plain.querySelector("a")).toBeNull();

    // Exactly ONE link in the drawer - the plain ref never became an
    // anchor and the split label never leaked into href.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
