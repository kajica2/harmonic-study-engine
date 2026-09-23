/**
 * EffectiveKeyBadge.test.tsx - PRD-001 Phase 2 (D12) component test.
 *
 * Runs under jsdom via JSDOM_FILES in vitest.config.ts.
 *
 * Pins: "Sounding: Gb major" for F major + 1 (tie-goes-flat), the
 * pitch-only fallback when no key can be claimed, and the a11y
 * contract (role=status + aria-live=polite) that makes keyboard
 * transpose nudges announce (PRD 9.8).
 */

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { EffectiveKeyBadge } from "./EffectiveKeyBadge";

afterEach(() => {
  cleanup();
});

describe("EffectiveKeyBadge", () => {
  it('renders "Sounding: Gb major" for F major at +1 (tie goes flat)', () => {
    render(<EffectiveKeyBadge sourceKey="F major" shift={1} />);
    expect(screen.getByRole("status").textContent).toBe("Sounding: Gb major");
  });

  it("renders drift two-key labels with each endpoint shifted", () => {
    render(
      <EffectiveKeyBadge
        sourceKey={"D minor \u2192 C major"}
        shift={1}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Sounding: Eb minor -> Db major",
    );
  });

  it("falls back to the pitch-only readout when no key can be claimed", () => {
    render(
      <EffectiveKeyBadge
        shift={3}
        fallbackFirstChord="Fmaj7"
        fallbackLastChord="Gm7 C7"
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Sounding: +3 st");
  });

  it("uses the first/last-chord heuristic for key-less studies paths", () => {
    render(
      <EffectiveKeyBadge
        shift={0}
        fallbackFirstChord="Fmaj7"
        fallbackLastChord="Fmaj7"
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Sounding: F major");
  });

  it("shows negative pitch-only shifts with their sign", () => {
    render(<EffectiveKeyBadge shift={-12} />);
    expect(screen.getByRole("status").textContent).toBe("Sounding: -12 st");
  });

  it("carries the aria-live announcement contract (PRD 9.8)", () => {
    render(<EffectiveKeyBadge sourceKey="C major" shift={0} />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });
});
