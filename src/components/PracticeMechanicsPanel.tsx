/**
 * src/components/PracticeMechanicsPanel.tsx - PRD-001 Phase 7 S2
 * (D127): the Drills panel (pause duty / A/B compare / tempo ramp).
 * Pure presentational, mounted in the PracticeHeader gear popover
 * (exact D36 metronome-gear precedent). ALL state lives upstream
 * (zustand practiceMechanics via App); every change emits a COMPLETE
 * PracticeMechanicsConfig object (the MetronomeControls contract -
 * App owns normalize-at-read + clamp-at-write).
 *
 * ZERO global keyboard shortcuts (D127 + frozen keyboard test): every
 * control is a real button/input, Tab/Enter reachable. Ramp +/- rides
 * the EXISTING Comma/Period keys through the reseed guard (D124.5) -
 * documented in the panel copy below, not in the cheatsheet.
 *
 * D125: `disabled` (runner active) renders the whole panel
 * aria-disabled with a title; every interactive element is disabled.
 */

import React from "react";
import type { PracticeMechanicsConfig } from "../lib/practiceMechanics";
import type { RampState } from "../../engine/practice/ramp";
import type { MechanicsMode } from "../../engine/practice/duty";

export interface PracticeMechanicsPanelProps {
  config: PracticeMechanicsConfig;
  /** Live ramp mirror; null = ramp not engaged. */
  rampState: RampState | null;
  /** Current rail selection (loop window snapshot) for Capture A/B. */
  loopSelection: { from: number; to: number } | null;
  /** Active form length - readout only (App clamps on write). */
  formLen: number;
  /** D125: runner active -> panel disabled. */
  disabled: boolean;
  onConfigChange: (next: PracticeMechanicsConfig) => void;
  /** D121 manual source: EACH CLICK IS ONE REP OUTCOME. */
  onRepOutcome: (success: boolean) => void;
  onRampReset: () => void;
}

const MODE_OPTIONS: readonly { id: MechanicsMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "loop", label: "Loop" },
  { id: "pause", label: "Pause" },
  { id: "ab", label: "A/B" },
];

const segClass = (active: boolean): string =>
  `px-2 py-1 rounded-[var(--radius-sm)] text-xs t-mono border transition-colors ${
    active
      ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
      : "border-[color:var(--color-border)] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
  }`;

const rowLabelClass =
  "t-label text-[color:var(--color-text-3)] uppercase tracking-wider";

const inputClass =
  "w-14 bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-1.5 py-1 text-xs t-mono text-neutral-200";

const actionClass =
  "px-2 py-1 rounded-[var(--radius-sm)] text-xs t-mono border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 surface-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

/** 1-based "bars 5-8" readout for a 0-based inclusive window. */
function windowLabel(name: string, w: { fromBar: number; toBar: number }): string {
  return `${name}: bars ${w.fromBar + 1}-${w.toBar + 1}`;
}

export const PracticeMechanicsPanel: React.FC<PracticeMechanicsPanelProps> = ({
  config,
  rampState,
  loopSelection,
  formLen,
  disabled,
  onConfigChange,
  onRepOutcome,
  onRampReset,
}) => {
  const patch = (p: Partial<PracticeMechanicsConfig>) =>
    onConfigChange({ ...config, ...p });

  const capture = (slot: "a" | "b") => {
    if (loopSelection === null) return;
    const w = { fromBar: loopSelection.from, toBar: loopSelection.to };
    patch({
      ab: {
        ...config.ab,
        a: slot === "a" ? w : config.ab.a,
        b: slot === "b" ? w : config.ab.b,
      },
    });
  };

  const rampEngaged = config.rampEnabled && rampState !== null;

  return (
    <div
      role="group"
      aria-label="Practice drills"
      aria-disabled={disabled}
      title={disabled ? "Not available during a set session" : undefined}
      className="flex flex-col gap-3"
      data-testid="mechanics-panel"
    >
      {/* 1. Mode: ONE selector (mode exclusivity, D122). */}
      <div>
        <div className={`${rowLabelClass} text-[10px] mb-1`}>Drill mode</div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Drill mode">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={config.mode === m.id}
              disabled={disabled}
              data-testid={`mech-mode-${m.id}`}
              onClick={() => patch({ mode: m.id })}
              className={segClass(config.mode === m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Pause duty cycle (REQ-PRAC-21). */}
      <div className="flex items-center gap-3">
        <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
          Play bars
          <input
            type="number"
            min={1}
            max={16}
            step={1}
            disabled={disabled}
            aria-label="Pause play bars"
            data-testid="mech-pause-play"
            className={inputClass}
            value={config.pause.playBars}
            onChange={(e) =>
              patch({ pause: { ...config.pause, playBars: clampInt(Number(e.target.value), 1, 16) } })
            }
          />
        </label>
        <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
          Rest bars
          <input
            type="number"
            min={1}
            max={16}
            step={1}
            disabled={disabled}
            aria-label="Pause rest bars"
            data-testid="mech-pause-rest"
            className={inputClass}
            value={config.pause.restBars}
            onChange={(e) =>
              patch({ pause: { ...config.pause, restBars: clampInt(Number(e.target.value), 1, 16) } })
            }
          />
        </label>
      </div>

      {/* 3. A/B compare (REQ-PRAC-22): capture from the rail selection. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || loopSelection === null}
            title={
              loopSelection === null
                ? "Select a range in the bar strip first (shift+click two bars)"
                : "Snapshot the current rail selection into slot A"
            }
            data-testid="mech-capture-a"
            onClick={() => capture("a")}
            className={actionClass}
          >
            Capture A
          </button>
          <button
            type="button"
            disabled={disabled || loopSelection === null}
            title={
              loopSelection === null
                ? "Select a range in the bar strip first (shift+click two bars)"
                : "Snapshot the current rail selection into slot B"
            }
            data-testid="mech-capture-b"
            onClick={() => capture("b")}
            className={actionClass}
          >
            Capture B
          </button>
          <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5 ml-auto`}>
            Swap every
            <input
              type="number"
              min={1}
              max={32}
              step={1}
              disabled={disabled}
              aria-label="A/B swap bars"
              data-testid="mech-swap-bars"
              className={inputClass}
              value={config.ab.swapBars}
              onChange={(e) =>
                patch({ ab: { ...config.ab, swapBars: clampInt(Number(e.target.value), 1, 32) } })
              }
            />
            bars
          </label>
        </div>
        <div className="flex items-center gap-3 text-[10px] t-mono text-neutral-400">
          <span data-testid="mech-window-a" data-window-from={config.ab.a.fromBar} data-window-to={config.ab.a.toBar}>
            {windowLabel("A", config.ab.a)}
          </span>
          <span data-testid="mech-window-b" data-window-from={config.ab.b.fromBar} data-window-to={config.ab.b.toBar}>
            {windowLabel("B", config.ab.b)}
          </span>
          <span className="ml-auto text-neutral-500">form {formLen} bars</span>
        </div>
      </div>

      {/* 4. Tempo ramp (REQ-PRAC-30..33). */}
      <div className="flex flex-col gap-1.5">
        <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
          <input
            type="checkbox"
            disabled={disabled}
            aria-label="Enable tempo ramp"
            data-testid="mech-ramp-enabled"
            checked={config.rampEnabled}
            onChange={(e) => patch({ rampEnabled: e.target.checked })}
            className="accent-[color:var(--color-brand)]"
          />
          Tempo ramp
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              ["start", "start", 30, 240, "startBpm"],
              ["target", "target", 30, 240, "targetBpm"],
              ["step", "step", 1, 24, "stepBpm"],
              ["reps", "reps", 1, 16, "repsPerStep"],
              ["threshold", "fail", 1, 16, "failThreshold"],
            ] as const
          ).map(([testid, label, lo, hi, field]) => (
            <label key={field} className="flex items-center gap-1 text-[10px] t-mono text-neutral-500">
              {label}
              <input
                type="number"
                min={lo}
                max={hi}
                step={1}
                disabled={disabled}
                aria-label={`Ramp ${label}`}
                data-testid={`mech-ramp-${testid}`}
                className={inputClass}
                value={config.ramp[field]}
                onChange={(e) =>
                  patch({
                    ramp: { ...config.ramp, [field]: clampInt(Number(e.target.value), lo, hi) },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || !rampEngaged}
            title="Rate the last pass as made (one rep)"
            data-testid="mech-made-it"
            onClick={() => onRepOutcome(true)}
            className={actionClass}
          >
            Made it
          </button>
          <button
            type="button"
            disabled={disabled || !rampEngaged}
            title="Rate the last pass as missed (one rep)"
            data-testid="mech-missed-it"
            onClick={() => onRepOutcome(false)}
            className={actionClass}
          >
            Missed it
          </button>
          <button
            type="button"
            disabled={disabled || !rampEngaged}
            title="Reset the ladder to the start tempo"
            data-testid="mech-ramp-reset"
            onClick={onRampReset}
            className={actionClass}
          >
            Reset
          </button>
        </div>
        <p className="text-[10px] text-neutral-500 leading-snug">
          Each click rates what you just played. Tempo changes mid-flight
          behave like the slider; Comma/Period reseed the ladder to your
          tempo. Automatic pass detection arrives with the next slice -
          the ladder is unchanged.
        </p>
      </div>
    </div>
  );
};
