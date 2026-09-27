/**
 * PracticeMechanicsPanel.test.tsx - PRD-001 Phase 7 S2 (D127).
 *
 * jsdom via JSDOM_FILES in vitest.config.ts (the explicit entry -
 * Vitest 5 ignores per-file env comments, AGENTS gotcha).
 *
 * Pins the pure-presentational contract: COMPLETE-config emits
 * (MetronomeControls contract), Capture A/B snapshotting the rail
 * selection + disabled-without-one, the D121 rep buttons emitting
 * onRepOutcome(true/false), the D125 disabled block, and the ramp
 * form's clamp-on-emit (30..240 per the slider bounds).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PracticeMechanicsPanel } from "./PracticeMechanicsPanel";
import { DEFAULT_MECHANICS } from "../lib/practiceMechanics";
import type { PracticeMechanicsConfig } from "../lib/practiceMechanics";
import { initialRampState } from "../../engine/practice/ramp";
import type { RampState } from "../../engine/practice/ramp";

function renderPanel(over: {
  config?: PracticeMechanicsConfig;
  rampState?: RampState | null;
  loopSelection?: { from: number; to: number } | null;
  disabled?: boolean;
} = {}) {
  const config = over.config ?? DEFAULT_MECHANICS;
  const onConfigChange = vi.fn();
  const onRepOutcome = vi.fn();
  const onRampReset = vi.fn();
  render(
    <PracticeMechanicsPanel
      config={config}
      rampState={over.rampState === undefined ? null : over.rampState}
      loopSelection={over.loopSelection === undefined ? null : over.loopSelection}
      formLen={16}
      disabled={over.disabled ?? false}
      onConfigChange={onConfigChange}
      onRepOutcome={onRepOutcome}
      onRampReset={onRampReset}
    />,
  );
  return { onConfigChange, onRepOutcome, onRampReset };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PracticeMechanicsPanel (D127)", () => {
  it("mode segmented control emits the COMPLETE config", () => {
    const { onConfigChange } = renderPanel();
    fireEvent.click(screen.getByTestId("mech-mode-pause"));
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const payload = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    expect(payload.mode).toBe("pause");
    // COMPLETE object: every sibling section survives untouched.
    expect(payload.pause).toEqual(DEFAULT_MECHANICS.pause);
    expect(payload.ab).toEqual(DEFAULT_MECHANICS.ab);
    expect(payload.ramp).toEqual(DEFAULT_MECHANICS.ramp);
    expect(payload.rampEnabled).toBe(false);
  });

  it("Capture A/B snapshot the rail selection into the slot", () => {
    const { onConfigChange } = renderPanel({ loopSelection: { from: 4, to: 7 } });
    fireEvent.click(screen.getByTestId("mech-capture-a"));
    const payload = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    expect(payload.ab.a).toEqual({ fromBar: 4, toBar: 7 });
    expect(payload.ab.b).toEqual(DEFAULT_MECHANICS.ab.b); // other slot kept
  });

  it("Capture buttons are DISABLED without a rail selection", () => {
    renderPanel({ loopSelection: null });
    expect((screen.getByTestId("mech-capture-a") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("mech-capture-b") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("mech-capture-a").getAttribute("title")).toMatch(/shift/i);
  });

  it("Made it / Missed it emit onRepOutcome(true/false) - one click, one rep (D121)", () => {
    const engaged: PracticeMechanicsConfig = { ...DEFAULT_MECHANICS, rampEnabled: true };
    const { onRepOutcome } = renderPanel({
      config: engaged,
      rampState: initialRampState(engaged.ramp),
    });
    fireEvent.click(screen.getByTestId("mech-made-it"));
    fireEvent.click(screen.getByTestId("mech-missed-it"));
    expect(onRepOutcome.mock.calls).toEqual([[true], [false]]);
  });

  it("rep buttons are inert while the ramp is disengaged", () => {
    const { onRepOutcome } = renderPanel({ config: DEFAULT_MECHANICS, rampState: null });
    expect((screen.getByTestId("mech-made-it") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("mech-made-it"));
    expect(onRepOutcome).not.toHaveBeenCalled();
  });

  it("D125: disabled prop blocks the whole panel", () => {
    const { onConfigChange, onRepOutcome } = renderPanel({
      config: { ...DEFAULT_MECHANICS, rampEnabled: true },
      rampState: initialRampState(DEFAULT_MECHANICS.ramp),
      loopSelection: { from: 0, to: 3 },
      disabled: true,
    });
    const group = screen.getByTestId("mechanics-panel");
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.getAttribute("title")).toMatch(/set session/i);
    fireEvent.click(screen.getByTestId("mech-mode-ab"));
    fireEvent.click(screen.getByTestId("mech-made-it"));
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onRepOutcome).not.toHaveBeenCalled();
  });

  it("ramp form clamps on emit (30..240 bpm per the slider bounds)", () => {
    const { onConfigChange } = renderPanel();
    const start = screen.getByTestId("mech-ramp-start");
    fireEvent.change(start, { target: { value: "999" } });
    const payload = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    expect(payload.ramp.startBpm).toBe(240);
    fireEvent.change(start, { target: { value: "10" } });
    const payload2 = onConfigChange.mock.calls[1][0] as PracticeMechanicsConfig;
    expect(payload2.ramp.startBpm).toBe(30);
  });

  it("pause steppers clamp 1..16 and swapBars clamps 1..32", () => {
    const { onConfigChange } = renderPanel();
    fireEvent.change(screen.getByTestId("mech-pause-play"), { target: { value: "40" } });
    fireEvent.change(screen.getByTestId("mech-swap-bars"), { target: { value: "0" } });
    const p1 = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    const p2 = onConfigChange.mock.calls[1][0] as PracticeMechanicsConfig;
    expect(p1.pause.playBars).toBe(16);
    expect(p2.ab.swapBars).toBe(1);
  });
});
