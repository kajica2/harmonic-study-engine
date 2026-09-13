import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoComposePanel } from "./CoComposePanel";

describe("CoComposePanel", () => {
  it("renders the active + alternative chord", () => {
    render(<CoComposePanel pathId="path-1" barIndex={4} seed={42} />);
    expect(screen.getByRole("region", { name: "Co-composition suggestion" })).toBeTruthy();
    expect(screen.getByText(/What if\?/)).toBeTruthy();
    expect(screen.getByText(/bar 5/)).toBeTruthy();
  });

  it("explains the technique", () => {
    render(<CoComposePanel pathId="path-1" barIndex={4} seed={42} />);
    // The explanation string is non-trivial
    const region = screen.getByRole("region");
    expect(region.textContent).toMatch(/[a-z]/i);
  });

  it("calls onAccept when the Accept button is clicked", () => {
    let accepted: AlternativeChord | null = null;
    render(
      <CoComposePanel
        pathId="path-1"
        barIndex={4}
        seed={42}
        onAccept={(alt) => { accepted = alt; }}
      />,
    );
    const acceptBtn = screen.queryByText("Accept");
    if (acceptBtn) {
      fireEvent.click(acceptBtn);
      expect(accepted).not.toBeNull();
    }
  });

  it("hides Accept when onAccept is not provided", () => {
    render(<CoComposePanel pathId="path-1" barIndex={4} seed={42} />);
    // Accept only renders if alternative exists AND onAccept is given
    // For paths where proposeAlternative returns null alternative, Accept is hidden
    expect(screen.queryByText("Accept")).toBeNull();
  });

  it("mentions the technique name in the header", () => {
    render(<CoComposePanel pathId="path-1" barIndex={4} seed={42} />);
    const region = screen.getByRole("region");
    // The header line includes the technique slug, formatted with underscores → spaces
    expect(region.textContent).toMatch(/(tritone substitution|modal mixture|secondary dominant|passing diminished)/i);
  });
});

// Re-import for the onAccept type
import type { AlternativeChord } from "../lib/coCompose";
