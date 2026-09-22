/**
 * src/components/RecentTakesPanel.test.tsx — jsdom tests for RecentTakesPanel.
 *
 * Pins:
 *   - Renders take metadata: pathTitle, tempo, meter, instrument, duration, time-ago
 *   - Renders rep badge (e.g. "rep 1", "rep 2")
 *   - Renders GuideToneProgress with correct accuracy percentage and progressbar
 *   - Renders RepDiff delta (+% / -%) against the previous take with tally on the same path
 *   - Omits RepDiff when there is no previous take with tally
 *   - Fires onRate callback when star/rating buttons are clicked
 *   - Two-step confirmation on Clear button before onClear is called
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { RecentTakesPanel } from "./RecentTakesPanel";
import type { PerformanceTake } from "../lib/performanceLog";

const take1: PerformanceTake = {
  id: "take-1",
  recordedAt: "2026-09-22T10:00:00.000Z",
  pathId: "study-solar",
  pathTitle: "Solar",
  tempo: 120,
  meter: "4/4",
  instrument: "Trumpet",
  personaId: "miles",
  durationSec: 16.0,
  rep: 1,
  transitionsHit: 4,
  transitionsMissed: 6, // 4/10 = 40%
  selfRating: 3,
};

const take2: PerformanceTake = {
  id: "take-2",
  recordedAt: "2026-09-22T10:05:00.000Z",
  pathId: "study-solar",
  pathTitle: "Solar",
  tempo: 120,
  meter: "4/4",
  instrument: "Trumpet",
  personaId: "miles",
  durationSec: 16.0,
  rep: 2,
  transitionsHit: 8,
  transitionsMissed: 2, // 8/10 = 80% (+40% vs rep #1)
};

const takeOtherPath: PerformanceTake = {
  id: "take-3",
  recordedAt: "2026-09-22T10:10:00.000Z",
  pathId: "study-cherokee",
  pathTitle: "Cherokee",
  tempo: 200,
  meter: "4/4",
  instrument: "Trumpet",
  personaId: "dizzy",
  durationSec: 32.0,
  rep: 1,
  transitionsHit: 5,
  transitionsMissed: 5,
};

describe("RecentTakesPanel", () => {
  it("renders take metadata and rep badge", () => {
    const onRate = vi.fn();
    const onClear = vi.fn();

    render(
      <RecentTakesPanel takes={[take1]} onRate={onRate} onClear={onClear} />,
    );

    expect(screen.getByText("Solar")).toBeTruthy();
    expect(screen.getByText("rep 1")).toBeTruthy();
    expect(
      screen.getByText(/120 BPM · 4\/4 · Trumpet · 16\.0s/),
    ).toBeTruthy();
  });

  it("renders guide-tone progress for takes with tally", () => {
    render(
      <RecentTakesPanel takes={[take1]} onRate={vi.fn()} onClear={vi.fn()} />,
    );

    expect(screen.getByText("4/10 · 40%")).toBeTruthy();
    const progressBar = screen.getByRole("progressbar", {
      name: "Guide-tone accuracy 40%",
    });
    expect(progressBar).toBeTruthy();
    expect(progressBar.getAttribute("aria-valuenow")).toBe("40");
  });

  it("renders RepDiff delta when successive takes on same path have tallies", () => {
    render(
      <RecentTakesPanel
        takes={[take1, take2]}
        onRate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    // take2 should show +40% vs rep #1 (80% vs 40%)
    expect(screen.getByText("+40% vs rep #1")).toBeTruthy();
  });

  it("omits RepDiff for rep #1 or across different paths", () => {
    render(
      <RecentTakesPanel
        takes={[take1, takeOtherPath]}
        onRate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByText(/vs rep #/)).toBeNull();
  });

  it("fires onRate with correct takeId and rating value", () => {
    const onRate = vi.fn();
    render(
      <RecentTakesPanel takes={[take2]} onRate={onRate} onClear={vi.fn()} />,
    );

    const fiveButton = screen.getByRole("radio", { name: "5 — mastered" });
    fireEvent.click(fiveButton);

    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith("take-2", 5);
  });

  it("requires two clicks to confirm clearing takes", () => {
    const onClear = vi.fn();
    render(
      <RecentTakesPanel takes={[take1]} onRate={vi.fn()} onClear={onClear} />,
    );

    const clearButton = screen.getByRole("button", { name: "Clear all takes" });
    fireEvent.click(clearButton);

    // After 1 click, onClear not called yet; button changes to confirm state
    expect(onClear).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole("button", {
      name: "Confirm clear all takes",
    });
    expect(confirmButton).toBeTruthy();

    // Second click confirms
    fireEvent.click(confirmButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
