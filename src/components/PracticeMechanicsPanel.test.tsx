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
// S3 fixtures: the PhraseMatch summary card + closed-session records.
import type { PhraseMatch } from "../../engine/practice/detect";
import type { SessionRecordV1 } from "../../engine/practice/session";

/** D131 example shape: "Pass 3 - 7/8 notes (88%) | avg +23 ms late |
 *  1 wrong | 1 rest" (matched 7/8, one pitch error, one rest note). */
function fixturePhrase(): PhraseMatch {
  return {
    bars: [],
    matched: 7,
    expectedTotal: 8,
    matchedFraction: 0.875,
    accuracyPct: 70,
    wrongNotes: [3],
    missedNotes: [10],
    extraNotes: [],
    wrongCount: 1,
    extraCount: 0,
    restCount: 1,
    assignedNotes: 9,
    avgOffsetMs: 23,
    avgAbsOffsetMs: 23,
  };
}

function fixtureSession(offsetMin: number, over?: Partial<SessionRecordV1>): SessionRecordV1 {
  const ended = Date.now() - offsetMin * 60_000;
  return {
    version: 1,
    startedAtMs: ended - 120_000,
    endedAtMs: ended,
    rampCompleted: false,
    refId: "study-blue-7",
    meter: "4/4",
    tempoStartBpm: 120,
    maxTempoBpm: 132,
    metronome: null,
    windows: {},
    attempts: [],
    aggregates: { attemptsTotal: 10, successes: 7, notesHit: 44, totalPlaySec: 120 },
    ...over,
  };
}

function renderPanel(over: {
  config?: PracticeMechanicsConfig;
  rampState?: RampState | null;
  loopSelection?: { from: number; to: number } | null;
  disabled?: boolean;
  // S3 view-model overrides (defaults: off, available, no device,
  // grid has targets, no phrase, uncalibrated, no sessions).
  detectionUnavailable?: boolean;
  detectionHasDevice?: boolean;
  /** MED-001: target bars in the built grid (nonzero default so the
   *  shipped disable pins keep meaning "can actually auto-rate"). */
  detectionGridTargets?: number;
  phrase?: PhraseMatch | null;
  passCount?: number;
  latencyRecord?: import("../lib/practiceLatency").LatencyRecord | null;
  sessions?: SessionRecordV1[];
  lastSession?: SessionRecordV1 | null;
} = {}) {
  const config = over.config ?? DEFAULT_MECHANICS;
  const onConfigChange = vi.fn();
  const onRepOutcome = vi.fn();
  const onRampReset = vi.fn();
  const onManualLatency = vi.fn();
  const onCalibrate = vi.fn();
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
      detectionUnavailable={over.detectionUnavailable ?? false}
      detectionHasDevice={over.detectionHasDevice ?? false}
      detectionGridTargets={over.detectionGridTargets ?? 4}
      phrase={over.phrase === undefined ? null : over.phrase}
      passCount={over.passCount ?? 0}
      latencyRecord={over.latencyRecord === undefined ? null : over.latencyRecord}
      onManualLatency={onManualLatency}
      onCalibrate={onCalibrate}
      sessions={over.sessions ?? []}
      lastSession={over.lastSession === undefined ? null : over.lastSession}
    />,
  );
  return { onConfigChange, onRepOutcome, onRampReset, onManualLatency, onCalibrate };
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

describe("PracticeMechanicsPanel - S3 Detection section (D131/D132/D133/D135.4)", () => {
  it("detect toggle emits the COMPLETE config (detect slice flipped, siblings kept)", () => {
    const { onConfigChange } = renderPanel();
    fireEvent.click(screen.getByTestId("detect-toggle"));
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const payload = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    expect(payload.detect.enabled).toBe(true);
    // COMPLETE object: the shipped tolerance/threshold survive...
    expect(payload.detect.toleranceMs).toBe(DEFAULT_MECHANICS.detect.toleranceMs);
    expect(payload.detect.passThreshold).toBe(DEFAULT_MECHANICS.detect.passThreshold);
    // ...and every sibling section too.
    expect(payload.mode).toBe(DEFAULT_MECHANICS.mode);
    expect(payload.pause).toEqual(DEFAULT_MECHANICS.pause);
    expect(payload.ab).toEqual(DEFAULT_MECHANICS.ab);
    expect(payload.ramp).toEqual(DEFAULT_MECHANICS.ramp);
    // tolerance clamps 60..300 on emit (the panel contract).
    onConfigChange.mockClear();
    fireEvent.change(screen.getByTestId("detect-tolerance"), { target: { value: "999" } });
    const p2 = onConfigChange.mock.calls[0][0] as PracticeMechanicsConfig;
    expect(p2.detect.toleranceMs).toBe(300);
  });

  it("D132 (MED-001 law): manual rep buttons render aria-disabled + the honest title while canAutoRate, and inert clicks", () => {
    const engaged: PracticeMechanicsConfig = {
      ...DEFAULT_MECHANICS,
      // MED-001: mode "off" no longer disables (no repPulse seam ->
      // no verdict can arrive); a duty mode is required for
      // canAutoRate, so the pin sets one explicitly.
      mode: "loop",
      rampEnabled: true,
      detect: { ...DEFAULT_MECHANICS.detect, enabled: true },
    };
    const { onRepOutcome } = renderPanel({
      config: engaged,
      rampState: initialRampState(engaged.ramp),
    });
    const made = screen.getByTestId("mech-made-it");
    const missed = screen.getByTestId("mech-missed-it");
    expect(made.getAttribute("aria-disabled")).toBe("true");
    expect(missed.getAttribute("aria-disabled")).toBe("true");
    expect(made.getAttribute("title")).toMatch(/turn it off to rate manually/i);
    fireEvent.click(made);
    fireEvent.click(missed);
    expect(onRepOutcome).not.toHaveBeenCalled();
  });

  it("MED-001: detect armed + mode OFF -> buttons stay LIVE (no soft-lock) + the honest status copy", () => {
    const engaged: PracticeMechanicsConfig = {
      ...DEFAULT_MECHANICS, // mode "off"
      rampEnabled: true,
      detect: { ...DEFAULT_MECHANICS.detect, enabled: true },
    };
    const { onRepOutcome } = renderPanel({
      config: engaged,
      rampState: initialRampState(engaged.ramp),
    });
    expect(screen.getByTestId("mech-made-it").getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByTestId("detect-mode-off").textContent).toMatch(
      /rep rating needs a loop\/pause\/AB mode/i,
    );
    expect(screen.getByTestId("detect-mode-off").textContent).toMatch(
      /manual buttons stay live/i,
    );
    // LIVE means real: the click reaches the ramp (S2 behavior).
    fireEvent.click(screen.getByTestId("mech-made-it"));
    expect(onRepOutcome).toHaveBeenCalledWith(true);
    // The "ladder rates itself" copy must NOT render without canAutoRate.
    expect(screen.getByTestId("mechanics-panel").textContent).not.toMatch(
      /the ladder rates itself from your played notes, so manual rating is off/,
    );
  });

  it("MED-001: detect armed + all-free grid (0 targets) -> buttons LIVE + 'no targets in this form' notice", () => {
    const engaged: PracticeMechanicsConfig = {
      ...DEFAULT_MECHANICS,
      mode: "loop",
      rampEnabled: true,
      detect: { ...DEFAULT_MECHANICS.detect, enabled: true },
    };
    const { onRepOutcome } = renderPanel({
      config: engaged,
      rampState: initialRampState(engaged.ramp),
      detectionGridTargets: 0,
    });
    expect(screen.getByTestId("mech-made-it").getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByTestId("detect-no-targets").textContent).toMatch(
      /no targets in this form/i,
    );
    fireEvent.click(screen.getByTestId("mech-missed-it"));
    expect(onRepOutcome).toHaveBeenCalledWith(false);
  });

  it("D132 (cont): detection OFF -> the manual buttons return (S2 behavior)", () => {
    const engaged: PracticeMechanicsConfig = { ...DEFAULT_MECHANICS, rampEnabled: true };
    const { onRepOutcome } = renderPanel({
      config: engaged,
      rampState: initialRampState(engaged.ramp),
    });
    expect(screen.getByTestId("mech-made-it").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(screen.getByTestId("mech-made-it"));
    expect(onRepOutcome).toHaveBeenCalledWith(true);
  });

  it("summary card renders the PhraseMatch fixture incl. data-notes-hit (e2e leg-2 seam)", () => {
    renderPanel({
      config: { ...DEFAULT_MECHANICS, detect: { ...DEFAULT_MECHANICS.detect, enabled: true } },
      phrase: fixturePhrase(),
      passCount: 3,
    });
    const card = screen.getByTestId("detect-summary");
    expect(card.getAttribute("role")).toBe("status");
    expect(card.getAttribute("aria-live")).toBe("polite");
    expect(card.getAttribute("data-notes-hit")).toBe("7");
    // D131 verbatim shape: "Pass 3 - 7/8 notes (88%) | avg +23 ms late | 1 wrong | 1 rest"
    expect(card.textContent).toBe("Pass 3 - 7/8 notes (88%) | avg +23 ms late | 1 wrong | 1 rest");
  });

  it("sessions list + end-of-session card render (relative-time labels, D133)", () => {
    const last = fixtureSession(5);
    renderPanel({ sessions: [fixtureSession(80), last], lastSession: last });
    const list = screen.getByTestId("sessions-list");
    expect(list.querySelectorAll('[data-testid="session-row"]')).toHaveLength(2);
    expect(list.textContent).toMatch(/ago/);
    const card = screen.getByTestId("session-summary");
    expect(card.textContent).toMatch(/max 132 bpm/);
    expect(card.textContent).toMatch(/7\/10 made/);
    expect(card.textContent).toMatch(/44 notes hit/);
  });

  it("REQ-PRAC-54: unavailable state renders the honest copy + blocks the toggle", () => {
    const { onConfigChange } = renderPanel({ detectionUnavailable: true });
    const note = screen.getByTestId("detect-unavailable");
    expect(note.textContent).toMatch(/requires Web MIDI input/i);
    // A DISABLED control is the block (a real pointer cannot hit it;
    // fireEvent.dispatchEvent would bypass the guard, so no click pin).
    expect((screen.getByTestId("detect-toggle") as HTMLInputElement).disabled).toBe(true);
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("D135.4: armed but no device observed -> the honest live-but-silent status line", () => {
    renderPanel({
      config: { ...DEFAULT_MECHANICS, detect: { ...DEFAULT_MECHANICS.detect, enabled: true } },
      detectionHasDevice: false,
    });
    expect(screen.getByTestId("detect-status").textContent).toMatch(
      /detection is live but silent/i,
    );
  });

  it("D134: stored record shows the honesty copy; manual entry commits 0..500", () => {
    const { onManualLatency } = renderPanel({
      latencyRecord: {
        version: 1,
        inputLatencyMs: 42,
        outputLatencyMs: 10,
        source: "manual",
        calibratedAtMs: Date.now() - 3 * 60_000,
        deviceName: null,
      },
    });
    const rec = screen.getByTestId("latency-record");
    expect(rec.textContent).toMatch(/42 ms \(manual\)/);
    expect(rec.textContent).toMatch(/calibrated .* ago/);
    const input = screen.getByTestId("latency-manual-input");
    fireEvent.change(input, { target: { value: "777" } });
    fireEvent.blur(input);
    expect(onManualLatency).toHaveBeenCalledWith(500); // clamped
  });

  it("Calibrate button forwards the wizard-open callback", () => {
    const { onCalibrate } = renderPanel();
    fireEvent.click(screen.getByTestId("latency-calibrate-btn"));
    expect(onCalibrate).toHaveBeenCalledTimes(1);
  });
});
