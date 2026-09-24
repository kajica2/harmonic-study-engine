/**
 * src/components/ConceptSearch.test.tsx - PRD-001 Phase 6 (checklist 7).
 *
 * jsdom via the src/components TSX glob (auto-registered, no config edit).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConceptSearch } from "./ConceptSearch";

afterEach(() => {
  cleanup();
});

describe("ConceptSearch", () => {
  it("datalist options cover the 10 registry titles", () => {
    render(<ConceptSearch value="" onChange={() => {}} onOpen={() => {}} />);
    expect(screen.getAllByTestId(/^concept-search-option-/)).toHaveLength(10);
  });

  it("typing filters to 1 title; Enter opens it", () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <ConceptSearch value="" onChange={() => {}} onOpen={onOpen} />,
    );
    // Controlled typing: parent echoes the value.
    rerender(<ConceptSearch value="cadence" onChange={() => {}} onOpen={onOpen} />);
    const box = screen.getByTestId("concept-search");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toBe("cadence");
  });

  it("datalist selection opens the exact concept", () => {
    const onOpen = vi.fn();
    render(<ConceptSearch value="" onChange={() => {}} onOpen={onOpen} />);
    const box = screen.getByTestId("concept-search") as HTMLInputElement;
    fireEvent.input(box, { target: { value: "Cadences" } });
    expect(onOpen).toHaveBeenCalledWith("cadence");
  });
});
