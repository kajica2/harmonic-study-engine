/**
 * LatencyWizard.test.tsx - PRD-001 Phase 7 S3 (D134), docs section 8.1.
 *
 * jsdom via JSDOM_FILES in vitest.config.ts (Vitest 5 IGNORES per-file
 * env comments - the AGENTS gotcha).
 *
 * Pins the wizard state machine surfaces + the honesty laws:
 *   - gate renders WITHOUT a device (honest copy + manual entry, no
 *     Start - calibrating with nothing to tap is theater)
 *   - manual entry -> saveLatency ROUNDTRIP through the real adapter
 *     (source "manual", output 0 - the single-sum law)
 *   - median result display: 16 clicks x 16 taps at +40 ms -> the
 *     result screen shows the clamped median (audioEngine spy proves
 *     the SAME metronome bus is used)
 *   - fewer than MIN_TAP_PAIRS pairs -> "not enough taps" + disabled
 *     Save (NEVER a silent 0)
 *   - abort cleanup: Escape mid-roll -> no leaked timers
 *   - Escape closes the dialog
 *
 * The roll is driven with fake timers at 240 BPM (beat = 250 ms); tap
 * timestamps ride the SAME performance.now() the clicks are stamped
 * with (+40 ms), so the median is clock-domain independent.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { LatencyWizard } from "./LatencyWizard";
import { loadLatency } from "../lib/practiceLatency";
import { audioEngine } from "../lib/audio";

function dispatchTap(offsetMs: number, channel = 1): void {
  window.dispatchEvent(
    new CustomEvent("midin", {
      detail: {
        note: 60,
        velocity: 90,
        type: "noteon",
        channel,
        inputId: "test-in",
        inputName: "TestIn",
        timestamp: performance.now() + offsetMs,
      },
    }),
  );
}

function renderWizard(over: {
  onClose?: () => void;
  tempo?: number;
  hasMidiApi?: boolean;
  hasDevice?: boolean;
  onSaved?: () => void;
} = {}) {
  const onClose = over.onClose ?? vi.fn();
  const onSaved = over.onSaved ?? vi.fn();
  const utils = render(
    <LatencyWizard
      onClose={onClose}
      tempo={over.tempo ?? 240}
      hasMidiApi={over.hasMidiApi ?? true}
      hasDevice={over.hasDevice ?? true}
      deviceName="TestIn"
      bassMidiChannel={2}
      onSaved={onSaved}
    />,
  );
  return { onClose, onSaved, ...utils };
}

/** Run a full roll: start, then tap every click (+offset ms). */
function runRoll(taps: number): void {
  fireEvent.click(screen.getByTestId("wizard-start"));
  for (let i = 0; i < 16; i++) {
    if (i < taps) dispatchTap(40);
    act(() => {
      vi.advanceTimersByTime(250);
    });
  }
  // tail: the (total+1)th tick schedules finalize one beat later.
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  localStorage.clear();
  // "performance" is faked too: performance.now() then advances ONLY
  // with the timer clock, so click emission vs tap timestamps live in
  // the same deterministic domain (median = exactly 40, no drift).
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LatencyWizard (D134)", () => {
  it("gate renders WITHOUT a device: honest copy + manual entry, no Start", () => {
    renderWizard({ hasDevice: false });
    const gate = screen.getByTestId("wizard-gate");
    expect(gate.textContent).toMatch(/connect a midi input to calibrate/i);
    expect(screen.getByTestId("wizard-input-ms")).toBeTruthy();
    expect(screen.queryByTestId("wizard-start")).toBeNull();
  });

  it("gate renders WITHOUT the Web MIDI API: honest browser copy", () => {
    renderWizard({ hasMidiApi: false, hasDevice: false });
    expect(screen.getByTestId("wizard-gate").textContent).toMatch(
      /no web midi api/i,
    );
  });

  it("manual entry -> saveLatency roundtrip (source manual, output 0)", () => {
    renderWizard({ hasDevice: false });
    fireEvent.change(screen.getByTestId("wizard-input-ms"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByTestId("wizard-save"));
    const r = loadLatency();
    expect(r).not.toBeNull();
    expect(r?.inputLatencyMs).toBe(42);
    expect(r?.outputLatencyMs).toBe(0);
    expect(r?.source).toBe("manual");
    expect(screen.getByTestId("wizard-saved")).toBeTruthy();
  });

  it("rolling median result: 16 clicks x 16 taps at +40 ms -> 40 ms (same bus)", () => {
    const spy = vi.spyOn(audioEngine, "playMetronomeClick");
    renderWizard();
    // gate -> arming auto-advance (device + API present).
    expect(screen.getByTestId("wizard-start")).toBeTruthy();
    runRoll(16);
    expect(screen.getByTestId("wizard-result")).toBeTruthy();
    expect(screen.getByTestId("wizard-result").textContent).toMatch(/40 ms/);
    // THE measured path IS the practice path: every click rode
    // audioEngine.playMetronomeClick (metronomeGain bus).
    expect(spy).toHaveBeenCalledTimes(16);
    fireEvent.click(screen.getByTestId("wizard-save"));
    const r = loadLatency();
    expect(r?.source).toBe("midi");
    expect(r?.deviceName).toBe("TestIn");
    expect(r?.inputLatencyMs).toBe(40);
  });

  it("S3 FIX ROUND (LOW-002): a garbled result-screen draft DISABLES Save - no fake 0 ms manual write", () => {
    renderWizard();
    runRoll(16);
    expect(screen.getByTestId("wizard-result")).toBeTruthy();
    // The draft arrives prefilled with the median; clearing it makes
    // the save EDITED+INVALID - Save must go dark (the shipped
    // <8-pairs pattern), never clampInt(NaN) -> "0 ms manual".
    fireEvent.change(screen.getByTestId("wizard-input-ms"), {
      target: { value: "" },
    });
    expect((screen.getByTestId("wizard-save") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByTestId("wizard-save"));
    expect(loadLatency()).toBeNull(); // React ignores clicks on disabled buttons
    // Out-of-range garbage is equally rejected.
    fireEvent.change(screen.getByTestId("wizard-input-ms"), {
      target: { value: "999" },
    });
    expect((screen.getByTestId("wizard-save") as HTMLButtonElement).disabled).toBe(
      true,
    );
    // A VALID edit re-enables and stores the TYPED number (manual),
    // not the median - the documented manual-override semantics.
    fireEvent.change(screen.getByTestId("wizard-input-ms"), {
      target: { value: "55" },
    });
    expect((screen.getByTestId("wizard-save") as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByTestId("wizard-save"));
    const r = loadLatency();
    expect(r?.source).toBe("manual");
    expect(r?.inputLatencyMs).toBe(55);
    expect(r?.outputLatencyMs).toBe(0);
  });

  it("fewer than MIN_TAP_PAIRS pairs -> 'not enough taps', Save disabled (never a silent 0)", () => {
    renderWizard();
    runRoll(4);
    expect(screen.getByTestId("wizard-result")).toBeTruthy();
    expect(screen.getByTestId("wizard-not-enough").textContent).toMatch(
      /not enough taps/i,
    );
    expect((screen.getByTestId("wizard-save") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("wizard-retry")).toBeTruthy();
  });

  it("abort cleanup: Escape mid-roll closes with NO leaked timers", () => {
    const { onClose, unmount } = renderWizard();
    fireEvent.click(screen.getByTestId("wizard-start"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Escape closes the dialog from the gate", () => {
    const { onClose } = renderWizard({ hasDevice: false });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
