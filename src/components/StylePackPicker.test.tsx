import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StylePackPicker } from "./StylePackPicker";

describe("StylePackPicker", () => {
  it("renders 4 style-pack cards", () => {
    render(<StylePackPicker activeId={null} activePersonaId={null} onPick={() => {}} />);
    expect(screen.getByText("Common-Practice (Baroque–Classical)")).toBeTruthy();
    expect(screen.getByText("Jazz (bebop and beyond)")).toBeTruthy();
    expect(screen.getByText("Modal (post-1950s jazz, folk, film)")).toBeTruthy();
    expect(screen.getByText("Post-tonal / atonal")).toBeTruthy();
  });

  it("clicking a card calls onPick with its id", () => {
    const onPick = vi.fn();
    render(<StylePackPicker activeId={null} activePersonaId={null} onPick={onPick} />);
    fireEvent.click(screen.getByText("Jazz (bebop and beyond)"));
    expect(onPick).toHaveBeenCalledWith("jazz");
  });

  it("active card has aria-checked=true", () => {
    render(<StylePackPicker activeId="jazz" activePersonaId={null} onPick={() => {}} />);
    const jazzBtn = screen.getByRole("radio", { name: /^Jazz/i });
    expect(jazzBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("auto-suggests persona's preferredStylePackId with a 'suggested' badge", () => {
    // coltrane → modal
    render(<StylePackPicker activeId={null} activePersonaId="coltrane" onPick={() => {}} />);
    const modalBtn = screen.getByRole("radio", { name: /^Modal/i });
    expect(modalBtn.getAttribute("data-suggested")).toBe("true");
    expect(modalBtn.textContent).toMatch(/suggested/i);
  });

  it("does NOT show 'suggested' badge on already-active card", () => {
    render(<StylePackPicker activeId="modal" activePersonaId="coltrane" onPick={() => {}} />);
    const modalBtn = screen.getByRole("radio", { name: /^Modal/i });
    expect(modalBtn.getAttribute("data-suggested")).toBe("false");
    expect(modalBtn.textContent).not.toMatch(/suggested/i);
  });

  it("renders without crashing when activePersonaId is null", () => {
    render(<StylePackPicker activeId={null} activePersonaId={null} onPick={() => {}} />);
    expect(screen.getByRole("region", { name: "Style pack" })).toBeTruthy();
  });
});
