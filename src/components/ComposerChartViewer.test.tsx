import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposerChartViewer } from "./ComposerChartViewer";

describe("ComposerChartViewer", () => {
  it("renders a bar chart for Beethoven with the work context", () => {
    render(<ComposerChartViewer composerId="beethoven" />);
    const region = screen.getByTestId("composer-chart-beethoven");
    expect(region).toBeTruthy();
    // Work context shows up
    expect(region.textContent).toMatch(/Symphony No\. 5/);
    // Some bars are rendered
    expect(region.textContent).toMatch(/Cm/);
    expect(region.textContent).toMatch(/Neapolitan|bII/);
  });

  it("renders a bitonal block for Stravinsky", () => {
    render(<ComposerChartViewer composerId="stravinsky" />);
    const region = screen.getByTestId("composer-chart-stravinsky");
    // Petrushka chord: C + F#
    expect(region.textContent).toMatch(/C\s*\+\s*F#/);
    expect(region.textContent).toMatch(/tritone|6 semitones/);
  });

  it("renders a row matrix for Schoenberg", () => {
    render(<ComposerChartViewer composerId="schoenberg" />);
    const region = screen.getByTestId("composer-chart-schoenberg");
    // All four row forms appear
    expect(region.textContent).toMatch(/P0/);
    expect(region.textContent).toMatch(/I0/);
    expect(region.textContent).toMatch(/R0/);
    expect(region.textContent).toMatch(/RI0/);
    // First note of P0 is E (catalog data)
    expect(region.textContent).toMatch(/E – F – G/);
  });

  it("renders an axis system for Bartók", () => {
    render(<ComposerChartViewer composerId="bartok" />);
    const region = screen.getByTestId("composer-chart-bartok");
    expect(region.textContent).toMatch(/Tonic axis/);
    expect(region.textContent).toMatch(/A – C – Eb – F#/);
    expect(region.textContent).toMatch(/Dominant axis/);
    expect(region.textContent).toMatch(/Subdominant axis/);
  });

  it("renders a duration structure for Cage (4'33\" = 273s)", () => {
    render(<ComposerChartViewer composerId="cage" />);
    const region = screen.getByTestId("composer-chart-cage");
    expect(region.textContent).toMatch(/Movement I/);
    expect(region.textContent).toMatch(/Movement II/);
    expect(region.textContent).toMatch(/Movement III/);
    // 4'33" = 273s total. The viewer formats each movement.
    expect(region.textContent).toMatch(/30s/);
    expect(region.textContent).toMatch(/2m 23s/);
    expect(region.textContent).toMatch(/1m 40s/);
  });

  it("renders a layer stack for Eno", () => {
    render(<ComposerChartViewer composerId="brian-eno" />);
    const region = screen.getByTestId("composer-chart-brian-eno");
    expect(region.textContent).toMatch(/Layer 1/);
    expect(region.textContent).toMatch(/Layer 4/);
    expect(region.textContent).toMatch(/Piano loop/);
  });

  it("renders a generic section for composers without specialized parsers", () => {
    render(<ComposerChartViewer composerId="stockhausen" />);
    const region = screen.getByTestId("composer-chart-stockhausen");
    expect(region.textContent).toMatch(/Formula in original form/);
    expect(region.textContent).toMatch(/Formula in retrograde/);
  });

  it("renders nothing for an unknown composer id (graceful fallback)", () => {
    const { container } = render(
      // @ts-expect-error: testing bad input
      <ComposerChartViewer composerId="nonexistent" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("uses the title prop override when provided", () => {
    render(
      <ComposerChartViewer
        composerId="beethoven"
        title="Symphony No. 5 — opening"
      />,
    );
    expect(screen.getByText(/Symphony No\. 5 — opening/)).toBeTruthy();
  });
});
