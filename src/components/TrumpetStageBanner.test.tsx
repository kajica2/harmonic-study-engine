import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { TrumpetStageBanner } from "./TrumpetStageBanner";

afterEach(() => cleanup());

describe("TrumpetStageBanner (top-of-page tuner entry)", () => {
  it("renders the brand banner with Mic icon and chord name", () => {
    render(
      <TrumpetStageBanner
        defaultConfig={{
          chordRoot: "C",
          chordQuality: "maj7",
          degreeSequence: ["1", "3", "5"],
        }}
        onOpen={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /open trumpet stage tuner/i }),
    ).toBeTruthy();
    // Chord name shows in the header
    expect(screen.getByText(/Cmaj7/)).toBeTruthy();
  });

  it("clicking the banner fires onOpen exactly once", () => {
    const onOpen = vi.fn();
    render(<TrumpetStageBanner onOpen={onOpen} />);
    fireEvent.click(
      screen.getByRole("button", { name: /open trumpet stage tuner/i }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the active target when provided and not collapsed", () => {
    render(
      <TrumpetStageBanner
        activeTarget={{
          degree: "3",
          pitchClass: "E",
          octave: 4,
        }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/E4/)).toBeTruthy();
    expect(screen.getByText(/\(3\)/)).toBeTruthy();
  });

  it("collapses the descriptive text when collapsed=true", () => {
    render(
      <TrumpetStageBanner
        activeTarget={{
          degree: "5",
          pitchClass: "G",
          octave: 4,
        }}
        collapsed
        onOpen={() => {}}
        onToggleCollapsed={() => {}}
      />,
    );
    // When collapsed, the activeTarget is hidden.
    expect(screen.queryByText(/G4/)).toBeNull();
  });

  it("shows a Live badge when isRunning=true", () => {
    render(<TrumpetStageBanner isRunning onOpen={() => {}} />);
    expect(screen.getByText(/live/i)).toBeTruthy();
  });

  it("stops the collapse-toggle click from triggering onOpen", () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    render(
      <TrumpetStageBanner
        collapsed
        onOpen={onOpen}
        onToggleCollapsed={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText(/expand stage banner/i));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});