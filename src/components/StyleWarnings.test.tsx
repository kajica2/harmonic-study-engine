import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StyleWarnings } from "./StyleWarnings";

describe("StyleWarnings", () => {
  it("renders nothing when violations is empty", () => {
    const { container } = render(
      <StyleWarnings styleName="Common-Practice" violations={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders violation list when non-empty", () => {
    render(
      <StyleWarnings
        styleName="Common-Practice"
        violations={[
          {
            barIndex: 4,
            type: "parallelFifth",
            explanation: "top 64→66, bottom 71→73 (parallel P5)",
          },
          {
            barIndex: 7,
            type: "parallelOctave",
            explanation: "top 67→69, bottom 72→74 (parallel P8)",
          },
        ]}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Common-Practice — 2 violations/)).toBeTruthy();
    expect(screen.getByText(/bar 5/)).toBeTruthy();
    expect(screen.getByText(/parallel fifth/)).toBeTruthy();
  });

  it("singular 'violation' wording for one item", () => {
    render(
      <StyleWarnings
        styleName="Modal"
        violations={[
          {
            barIndex: 0,
            type: "hiddenFifth",
            explanation: "hidden P5 between bars 1-2",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Modal — 1 violation\b/)).toBeTruthy();
  });

  it("includes the bar index in the rendered list", () => {
    render(
      <StyleWarnings
        styleName="Jazz"
        violations={[
          {
            barIndex: 12,
            type: "parallelFifth",
            explanation: "top 65→67, bottom 70→72",
          },
        ]}
      />,
    );
    expect(screen.getByText(/bar 13/)).toBeTruthy(); // 1-indexed in UI
  });
});
