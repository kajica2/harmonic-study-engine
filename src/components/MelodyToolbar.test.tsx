import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MelodyToolbar } from "./MelodyToolbar";

describe("MelodyToolbar", () => {
  it("renders Suggest, Regenerate, Pin, Undo buttons", () => {
    render(<MelodyToolbar onSuggest={() => {}} onRegenerate={() => {}} />);
    expect(screen.getByLabelText("Suggest melody")).toBeTruthy();
    expect(screen.getByLabelText("Regenerate melody")).toBeTruthy();
    expect(screen.getByLabelText("Pin melody")).toBeTruthy();
    expect(screen.getByLabelText("Undo melody")).toBeTruthy();
  });

  it("clicking Suggest calls onSuggest", () => {
    const onSuggest = vi.fn();
    render(<MelodyToolbar onSuggest={onSuggest} onRegenerate={() => {}} />);
    fireEvent.click(screen.getByLabelText("Suggest melody"));
    expect(onSuggest).toHaveBeenCalledTimes(1);
  });

  it("clicking Regenerate calls onRegenerate", () => {
    const onRegenerate = vi.fn();
    render(<MelodyToolbar onSuggest={() => {}} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByLabelText("Regenerate melody"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("clicking Pin toggles aria-pressed", () => {
    render(<MelodyToolbar onSuggest={() => {}} onRegenerate={() => {}} />);
    const pin = screen.getByLabelText("Pin melody");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);
    const pinnedBtn = screen.getByLabelText("Unpin melody");
    expect(pinnedBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking Undo calls onUndo when provided", () => {
    const onUndo = vi.fn();
    render(<MelodyToolbar onSuggest={() => {}} onRegenerate={() => {}} onUndo={onUndo} />);
    fireEvent.click(screen.getByLabelText("Undo melody"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("Undo button is disabled when onUndo is not provided", () => {
    render(<MelodyToolbar onSuggest={() => {}} onRegenerate={() => {}} />);
    const undo = screen.getByLabelText("Undo melody") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
  });
});
