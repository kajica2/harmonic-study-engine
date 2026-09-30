/**
 * src/components/TunerWidget.test.tsx — pins for the persistent
 * tuner widget. Covers the three acceptance pins from the task:
 *
 *   1. Renders the Mic icon when isOn = false.
 *   2. Renders the note display when isOn = true (with mocked
 *      subscribeTuner returning a no-op handle).
 *   3. The toggle button calls onToggle when clicked.
 *
 * Audio capture is mocked at the module boundary — the widget
 * never touches getUserMedia in tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TunerWidget } from "./TunerWidget";
import * as tunerCapture from "../lib/tunerCapture";

vi.mock("../lib/tunerCapture", async () => {
  const actual = await vi.importActual<typeof tunerCapture>(
    "../lib/tunerCapture",
  );
  return {
    ...actual,
    subscribeTuner: vi.fn(async () => ({
      stop: () => {},
      sampleRate: () => 44100,
    })),
  };
});

describe("TunerWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Mic icon button when isOn = false", () => {
    const onToggle = vi.fn();
    render(<TunerWidget isOn={false} onToggle={onToggle} />);

    const btn = screen.getByRole("button", { name: /enable tuner/i });
    expect(btn).toBeTruthy();
    // lucide-react renders an <svg> with aria-hidden; the button
    // contains the Mic icon as its only visible content.
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("renders the note display panel when isOn = true", () => {
    const onToggle = vi.fn();
    render(<TunerWidget isOn={true} onToggle={onToggle} />);

    // The widget mounts a status region labelled "Tuner".
    const status = screen.getByRole("status", { name: /tuner/i });
    expect(status).toBeTruthy();

    // Initial state shows "--" while waiting for the first block.
    expect(screen.getByText("--")).toBeTruthy();

    // subscribeTuner was invoked exactly once.
    expect(tunerCapture.subscribeTuner).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle when the toggle button is clicked (off state)", () => {
    const onToggle = vi.fn();
    render(<TunerWidget isOn={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: /enable tuner/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle when the disable button is clicked (on state)", () => {
    const onToggle = vi.fn();
    render(<TunerWidget isOn={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: /disable tuner/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});