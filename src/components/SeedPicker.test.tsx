/**
 * src/components/SeedPicker.test.tsx - PRD-001 Phase 5 (checklist 8).
 * jsdom via the existing src/components glob (NO config edit).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SeedPicker } from "./SeedPicker";

function renderPicker(onCommit = vi.fn(), value = "") {
  const onChange = vi.fn();
  render(<SeedPicker value={value} onChange={onChange} onCommit={onCommit} />);
  return { onChange, onCommit };
}

describe("SeedPicker", () => {
  it("chip click commits the parsed seed (Cmaj7 -> chord)", () => {
    const { onCommit } = renderPicker();
    fireEvent.click(screen.getByTestId("seed-chip-0"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].kind).toBe("chord");
    expect(onCommit.mock.calls[0][0].chord).toBe("Cmaj7");
  });

  it("Enter commits the typed text (progression parses)", () => {
    const onCommit = vi.fn();
    const onChange = vi.fn();
    render(
      <SeedPicker
        value="Dm7 G7 Cmaj7"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("seed-input"), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].kind).toBe("progression");
  });

  it("kind tab fills its example into the input", () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByTestId("seed-kind-scale"));
    expect(onChange).toHaveBeenCalledWith("D dorian");
  });

  it("live parse readout names the kind", () => {
    render(
      <SeedPicker value="P5 up" onChange={vi.fn()} onCommit={vi.fn()} />,
    );
    expect(screen.getByTestId("seed-parse-kind").textContent).toContain(
      "interval",
    );
  });
});
