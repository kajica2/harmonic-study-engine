import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormTemplatePicker } from "./FormTemplatePicker";

describe("FormTemplatePicker", () => {
  it("renders 4 template cards", () => {
    render(<FormTemplatePicker activeId={null} onPick={() => {}} />);
    expect(screen.getByText("AABA")).toBeTruthy();
    expect(screen.getByText("ABAC")).toBeTruthy();
    expect(screen.getByText("Theme + Variations")).toBeTruthy();
    expect(screen.getByText("Through-Composed")).toBeTruthy();
  });

  it("clicking a card calls onPick with the template id", () => {
    const onPick = vi.fn();
    render(<FormTemplatePicker activeId={null} onPick={onPick} />);
    fireEvent.click(screen.getByText("AABA"));
    expect(onPick).toHaveBeenCalledWith("aaba");
    fireEvent.click(screen.getByText("ABAC"));
    expect(onPick).toHaveBeenCalledWith("abac");
  });

  it("active card is styled + aria-pressed=true", () => {
    render(<FormTemplatePicker activeId="aaba" onPick={() => {}} />);
    // The text node is inside the button; query the button by aria-label
    const aabaBtn = screen.getByRole("button", { name: /AABA/i });
    expect(aabaBtn.getAttribute("aria-pressed")).toBe("true");
    expect(aabaBtn.className).toContain("bg-purple-900/40");
  });

  it("inactive cards have aria-pressed=false", () => {
    render(<FormTemplatePicker activeId="aaba" onPick={() => {}} />);
    const abacBtn = screen.getByRole("button", { name: /ABAC/i });
    expect(abacBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders plan's bar count when planFor is provided", () => {
    const planFor = (id: string) =>
      id === "aaba"
        ? {
            template: "aaba" as const,
            sections: [{ id: "A", length: 32 }],
            totalBars: 32,
            clamped: false,
          }
        : null;
    render(
      <FormTemplatePicker
        activeId="aaba"
        planFor={planFor}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("32 bars")).toBeTruthy();
  });
});
