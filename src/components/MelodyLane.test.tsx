import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MelodyLane } from "./MelodyLane";

function hasButton(label: string): boolean {
  return !!screen.queryByLabelText(label);
}

describe("MelodyLane", () => {
  it("renders one button per beat", () => {
    render(<MelodyLane pathId="path-1" barIndex={0} stepsPerBar={4} melody={[60, 62, 64, 65]} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("shows note labels (sharp preferred)", () => {
    render(<MelodyLane pathId="path-1" barIndex={0} stepsPerBar={2} melody={[60, 62]} />);
    expect(screen.getByText("C4")).toBeTruthy();
    expect(screen.getByText("D4")).toBeTruthy();
  });

  it("renders '—' for empty cells", () => {
    render(<MelodyLane pathId="path-1" barIndex={0} stepsPerBar={2} melody={[60]} />);
    expect(screen.getAllByText("—").length).toBe(1);
  });

  it("click on cell nudges pitch up via onChange", () => {
    let captured: number[] | null = null;
    let capturedIdx = -1;
    render(
      <MelodyLane
        pathId="path-1"
        barIndex={0}
        stepsPerBar={2}
        melody={[60, 62]}
        onChange={(next, idx) => { captured = next; capturedIdx = idx; }}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(captured).toEqual([61, 62]);
    expect(capturedIdx).toBe(0);
  });

  it("right-click nudges pitch down", () => {
    let captured: number[] | null = null;
    render(
      <MelodyLane
        pathId="path-1"
        barIndex={0}
        stepsPerBar={2}
        melody={[60, 62]}
        onChange={(next) => { captured = next; }}
      />,
    );
    fireEvent.contextMenu(screen.getAllByRole("button")[0]);
    expect(captured).toEqual([59, 62]);
  });

  it("double-click resets cell to C4", () => {
    let captured: number[] | null = null;
    render(
      <MelodyLane
        pathId="path-1"
        barIndex={0}
        stepsPerBar={1}
        melody={[76]}
        onChange={(next) => { captured = next; }}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(captured).toEqual([60]);
  });

  it("renders counter-line notes in a small label above each cell", () => {
    render(
      <MelodyLane
        pathId="path-1"
        barIndex={0}
        stepsPerBar={2}
        melody={[60, 62]}
        counterMelody={[67, 69]}
      />,
    );
    expect(screen.getAllByText("G4")).toHaveLength(1);
    expect(screen.getAllByText("A4")).toHaveLength(1);
  });

  it("click is a no-op when disabled", () => {
    let called = false;
    render(
      <MelodyLane
        pathId="path-1"
        barIndex={0}
        stepsPerBar={1}
        melody={[60]}
        disabled
        onChange={() => { called = true; }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(called).toBe(false);
  });
});

