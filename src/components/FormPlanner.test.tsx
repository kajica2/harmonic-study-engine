import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormPlanner } from "./FormPlanner";
import type { FormPlan } from "../lib/formPlanner";

const PLAN: FormPlan = {
  template: "aaba",
  sections: [
    { id: "A", length: 8 },
    { id: "A", length: 8 },
    { id: "B", length: 8 },
    { id: "A", length: 8 },
  ],
  totalBars: 32,
  clamped: false,
};

describe("FormPlanner", () => {
  it("renders one block per section with proportional width", () => {
    render(<FormPlanner plan={PLAN} />);
    const blocks = screen.getAllByRole("listitem");
    expect(blocks).toHaveLength(4);
    blocks.forEach((b) => {
      expect(b.style.width).toBe("25%");
    });
  });

  it("renders the template name + bar count", () => {
    render(<FormPlanner plan={PLAN} />);
    expect(screen.getByText(/aaba · 32 bars/)).toBeTruthy();
  });

  it("renders 'No plan loaded' when plan is null", () => {
    render(<FormPlanner plan={null} />);
    expect(screen.getByText("No plan loaded.")).toBeTruthy();
  });

  it("shows the clamped notice when plan.clamped is true", () => {
    const clamped: FormPlan = { ...PLAN, clamped: true, notice: "Section lengths snapped to satisfy 28-bar target (final = 28 bars)." };
    render(<FormPlanner plan={clamped} />);
    expect(screen.getByText(/snapped to satisfy/)).toBeTruthy();
    expect(screen.getByText(/clamped/)).toBeTruthy();
  });

  it("highlights the active bar's section", () => {
    // Bar 10 is in section A (idx 1, bars 8-15) since each section is 8 bars.
    render(<FormPlanner plan={PLAN} activeBar={10} />);
    const blocks = screen.getAllByRole("listitem");
    expect(blocks[1].className).toContain("bg-purple-700/50");
    expect(blocks[0].className).not.toContain("bg-purple-700/50");
  });

  it("calls onBarClick with the section's start bar", () => {
    const onBarClick = vi.fn();
    render(<FormPlanner plan={PLAN} onBarClick={onBarClick} />);
    fireEvent.click(screen.getAllByRole("listitem")[2]);
    expect(onBarClick).toHaveBeenCalledWith(16);
  });

  it("renders section labels (A, B, etc.)", () => {
    render(<FormPlanner plan={PLAN} />);
    expect(screen.getAllByText("A").length).toBe(3);
    expect(screen.getByText("B")).toBeTruthy();
  });
});
