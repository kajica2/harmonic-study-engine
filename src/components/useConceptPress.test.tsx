/**
 * src/components/useConceptPress.test.tsx - PRD-001 Phase 6 (checklist 7).
 *
 * jsdom via the src/components TSX glob (auto-registered).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useConceptPress } from "./useConceptPress";

function Harness(props: {
  resolve: () => string | null;
  open: (id: string | null, fallback: string) => void;
  fallback?: string;
}): React.ReactElement {
  const handlers = useConceptPress(props.resolve, props.open, props.fallback ?? "Cm7");
  return (
    <button type="button" data-testid="press-target" {...handlers}>
      cell
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useConceptPress", () => {
  it("contextmenu opens the resolved concept", () => {
    const open = vi.fn();
    render(<Harness resolve={() => "ii-v-i"} open={open} />);
    fireEvent.contextMenu(screen.getByTestId("press-target"));
    expect(open).toHaveBeenCalledWith("ii-v-i", "Cm7");
  });

  it("long-press timer opens after 500ms", () => {
    vi.useFakeTimers();
    const open = vi.fn();
    render(<Harness resolve={() => "cadence"} open={open} />);
    fireEvent.touchStart(screen.getByTestId("press-target"));
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledWith("cadence", "Cm7");
  });

  it("Shift+F10 opens (a11y path)", () => {
    const open = vi.fn();
    render(<Harness resolve={() => "drop-2"} open={open} />);
    fireEvent.keyDown(screen.getByTestId("press-target"), { key: "F10", shiftKey: true });
    expect(open).toHaveBeenCalledWith("drop-2", "Cm7");
  });

  it("null resolution prefills search (no false claim)", () => {
    const open = vi.fn();
    render(<Harness resolve={() => null} open={open} fallback="G7" />);
    fireEvent.contextMenu(screen.getByTestId("press-target"));
    expect(open).toHaveBeenCalledWith(null, "G7");
  });
});
