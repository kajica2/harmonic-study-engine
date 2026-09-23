/**
 * CountInOverlay.test.tsx - PRD-001 Phase 3 Slice 3 (T9).
 *
 * jsdom via the src/components TSX glob. Its own file for
 * clarity (the design allows folding into T6; we keep it separate).
 *
 * Pins the e2e discriminators: data-testid="countin-overlay" +
 * data-beats-left (the browser leg polls these) and the REQ-PRAC-11
 * a11y contract (role=status + aria-live=assertive - the
 * screen-reader countdown).
 */

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CountInOverlay } from "./CountInOverlay";

afterEach(() => {
  cleanup();
});

describe("CountInOverlay (T9)", () => {
  it("renders beatsLeft with the e2e testid + data attribute", () => {
    render(
      <CountInOverlay beatsLeft={3} beatsPerBar={4} totalBars={1} />,
    );
    const root = screen.getByTestId("countin-overlay");
    expect(root.getAttribute("data-beats-left")).toBe("3");
    expect(root.textContent).toContain("3");
  });

  it("announces via role=status + aria-live=assertive (REQ-PRAC-11)", () => {
    render(
      <CountInOverlay beatsLeft={1} beatsPerBar={4} totalBars={1} />,
    );
    const root = screen.getByRole("status");
    expect(root.getAttribute("aria-live")).toBe("assertive");
  });

  it("bar subline counts UP across a 2-bar pre-roll", () => {
    const { rerender } = render(
      <CountInOverlay beatsLeft={8} beatsPerBar={4} totalBars={2} />,
    );
    expect(screen.getByTestId("countin-overlay").textContent).toContain(
      "bar 1 of 2",
    );
    rerender(<CountInOverlay beatsLeft={4} beatsPerBar={4} totalBars={2} />);
    expect(screen.getByTestId("countin-overlay").textContent).toContain(
      "bar 2 of 2",
    );
  });
});
