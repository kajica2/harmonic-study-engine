/**
 * src/components/PracticeMechanicsPanel.tsx - PRD-001 Phase 7 S2
 * (D127): the Drills panel (pause duty / A/B compare / tempo ramp) +
 * S3 (D131-D135): the Detection section (arm toggle, tolerance, pass
 * threshold, Calibrate + manual latency, post-pass summary card,
 * sessions list) and the D132 manual-button DISABLE law while
 * detection is armed - refined by the S3 fix round (MED-001) to
 * canAutoRate: armed + a duty mode + a grid with targets, so the
 * ramp can never soft-lock with no possible rater.
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
// PRD-001 Phase 7 S3 (D131/D132/D133/D134): the Detection section. The
// panel stays PURE presentational - it renders the hook's PhraseMatch
// mirror + the stored latency record + the persisted session list, and
// emits COMPLETE configs / plain callbacks upstream (App owns storage).
import type { PhraseMatch } from "../../engine/practice/detect";
import type { SessionRecordV1 } from "../../engine/practice/session";
import { summarizeSession } from "../../engine/practice/session";
import type { LatencyRecord } from "../lib/practiceLatency";
import { formatRelativeTime } from "../lib/performanceLog";

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
  // --- S3 detection view-model (all read-only; D135.4 arm gate) ---
  /** REQ-PRAC-54: no Web MIDI API -> honest UNAVAILABLE state. */
  detectionUnavailable: boolean;
  /** D135.4: API present but no note-on observed yet -> status line. */
  detectionHasDevice: boolean;
  /** S3 FIX ROUND (MED-001): bars of the built expected grid with
   *  kind "target" (App-derived from the grid memo). An all-free
   *  grid can NEVER verdict (the D132 no-verdict law), so the
   *  disable law must not swallow the manual source there. */
  detectionGridTargets: number;
  /** Last completed pass WITH expected notes (null = none yet). */
  phrase: PhraseMatch | null;
  /** Pass counter for the "Pass N" summary label (App-owned state). */
  passCount: number;
  /** Stored latency record (null = uncalibrated - honest). */
  latencyRecord: LatencyRecord | null;
  /** Manual latency entry (0..500 ms, source "manual" - D134). */
  onManualLatency: (ms: number) => void;
  /** Opens the calibration wizard (mount lives in PracticeHeader). */
  onCalibrate: () => void;
  /** Recent completed sessions, newest LAST (adapter order). */
  sessions: SessionRecordV1[];
  /** The last CLOSED session for the end-of-session card (null = none). */
  lastSession: SessionRecordV1 | null;
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

/** S3: the D131 summary segments. Signed avg offset -> honest
 *  late/early copy (ASCII only): "+23 ms late" / "-18 ms early". */
function offsetSegment(avgOffsetMs: number | null): string | null {
  if (avgOffsetMs === null || !Number.isFinite(avgOffsetMs)) return null;
  const ms = Math.round(avgOffsetMs);
  if (ms >= 0) return `avg +${ms} ms late`;
  return `avg ${ms} ms early`;
}

/** mm:ss for session totals (ASCII colon). */
function formatDurationSec(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** D134 honesty copy: "calibrated 3d ago via LPK88" (staleness
 *  VISIBLE; formatRelativeTime = the performanceLog precedent). */
function latencyAgeLabel(r: LatencyRecord): string {
  const rel = formatRelativeTime(new Date(r.calibratedAtMs).toISOString());
  const via = r.source === "midi" && r.deviceName ? ` via ${r.deviceName}` : "";
  return `calibrated ${rel} ago${via}`;
}

/** REQ-PRAC-53 summary copy (D131 verbatim shape):
 *  "Pass 3 - 7/8 notes (88%) | avg +23 ms late | 1 wrong | 1 rest" */
function summarizePhrase(m: PhraseMatch, passCount: number): string {
  const pct = Math.round(m.matchedFraction * 100);
  const segs = [`Pass ${passCount} - ${m.matched}/${m.expectedTotal} notes (${pct}%)`];
  const avg = offsetSegment(m.avgOffsetMs);
  if (avg !== null) segs.push(avg);
  if (m.wrongCount > 0) segs.push(`${m.wrongCount} wrong`);
  if (m.extraCount > 0) segs.push(`${m.extraCount} extra`);
  if (m.restCount > 0) segs.push(`${m.restCount} rest`);
  return segs.join(" | ");
}

/** REQ-PRAC-62 end-of-session card line (pure derivation). */
function summarizeSessionLine(s: SessionRecordV1): string {
  const sum = summarizeSession(s);
  const segs = [
    `Session - max ${sum.maxTempoBpm} bpm`,
    formatDurationSec(sum.totalSec),
    `${sum.successes}/${sum.attemptsMade} made`,
  ];
  if (sum.accuracyPct !== null) segs.push(`${Math.round(sum.accuracyPct)}%`);
  if (sum.notesHit > 0) segs.push(`${sum.notesHit} notes hit`);
  if (sum.rampCompleted) segs.push("TARGET reached");
  return segs.join(" | ");
}

/** Recent-sessions row: relative time (performanceLog precedent). */
function sessionRowLine(s: SessionRecordV1): string {
  const when =
    s.endedAtMs !== null
      ? formatRelativeTime(new Date(s.endedAtMs).toISOString())
      : "open";
  return (
    `${when} - ${s.maxTempoBpm} bpm, ` +
    `${s.aggregates.successes}/${s.aggregates.attemptsTotal} made` +
    (s.aggregates.notesHit > 0 ? `, ${s.aggregates.notesHit} notes` : "") +
    (s.rampCompleted ? ", TARGET" : "")
  );
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
  detectionUnavailable,
  detectionHasDevice,
  detectionGridTargets,
  phrase,
  passCount,
  latencyRecord,
  onManualLatency,
  onCalibrate,
  sessions,
  lastSession,
}) => {
  const patch = (p: Partial<PracticeMechanicsConfig>) =>
    onConfigChange({ ...config, ...p });

  // D132 DISABLE LAW, refined by the S3 FIX ROUND (MED-001): ARMED is
  // not the same as ABLE TO RATE. A verdict can only arrive when a
  // duty mode drives the pass seam (mode "off" never pulses repPulse)
  // AND the grid has at least one target bar (an all-free grid hits
  // the D132 no-verdict law - mono-slice personas are the reachable
  // case). Disabling the manual source in those configs soft-locked
  // the ramp with NO possible rater; manual now disables IFF
  // canAutoRate, so the two sources still never double-rate one rep
  // and the ladder can never freeze.
  const detectArmed = config.detect.enabled && !detectionUnavailable;
  const canAutoRate =
    detectArmed && config.mode !== "off" && detectionGridTargets > 0;
  const manualOverrideTitle =
    "Detection is rating your reps - turn it off to rate manually";
  const repOutcome = (success: boolean) => {
    if (canAutoRate) return;
    onRepOutcome(success);
  };

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
            aria-disabled={canAutoRate || undefined}
            title={canAutoRate ? manualOverrideTitle : "Rate the last pass as made (one rep)"}
            data-testid="mech-made-it"
            onClick={() => repOutcome(true)}
            className={actionClass}
          >
            Made it
          </button>
          <button
            type="button"
            disabled={disabled || !rampEngaged}
            aria-disabled={canAutoRate || undefined}
            title={canAutoRate ? manualOverrideTitle : "Rate the last pass as missed (one rep)"}
            data-testid="mech-missed-it"
            onClick={() => repOutcome(false)}
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
          tempo. {canAutoRate
            ? "Detection is armed - the ladder rates itself from your played notes, so manual rating is off."
            : "Arm detection below and the ladder rates itself from your played notes."}
        </p>
      </div>

      {/* 5. Detection (S3, REQ-PRAC-50..54, D131/D132/D134/D135.4). */}
      <div className="flex flex-col gap-2">
        <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
          <input
            type="checkbox"
            disabled={disabled || detectionUnavailable}
            aria-label="Enable played-correctly detection"
            data-testid="detect-toggle"
            checked={config.detect.enabled}
            onChange={(e) =>
              patch({ detect: { ...config.detect, enabled: e.target.checked } })
            }
            className="accent-[color:var(--color-brand)]"
          />
          Played-correctly detection
        </label>

        {/* REQ-PRAC-54 honest unavailable state (D135.4 arm gate). */}
        {detectionUnavailable && (
          <div
            data-testid="detect-unavailable"
            className="text-[10px] text-neutral-400 leading-snug"
          >
            Requires Web MIDI input - this browser has no Web MIDI API, so
            detection cannot arm. Drills, ramp and manual rating work
            unchanged.
          </div>
        )}

        {/* D135.4: API present, no input observed -> armed but silent. */}
        {!detectionUnavailable && config.detect.enabled && !detectionHasDevice && (
          <div
            data-testid="detect-status"
            className="text-[10px] text-neutral-400 leading-snug"
          >
            connect a MIDI input - detection is live but silent. Hot-plugging
            just works.
          </div>
        )}

        {/* S3 FIX ROUND (MED-001): the honest unable-to-rate states -
            the manual source STAYS LIVE in both (no ramp soft-lock). */}
        {config.detect.enabled && !detectionUnavailable && detectionGridTargets === 0 && (
          <div
            data-testid="detect-no-targets"
            className="text-[10px] text-neutral-400 leading-snug"
          >
            no targets in this form - the chords carry no guide tones to
            score, so detection cannot rate reps; manual rating stays live.
          </div>
        )}
        {config.detect.enabled && !detectionUnavailable && config.mode === "off" && (
          <div
            data-testid="detect-mode-off"
            className="text-[10px] text-neutral-400 leading-snug"
          >
            detection scores bars, but rep rating needs a loop/pause/AB mode
            - manual buttons stay live.
          </div>
        )}

        {/* Tolerance + pass threshold (complete-config emits; the
            normalize-at-read law lives upstream in the store). */}
        <div className="flex items-center gap-3">
          <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
            Tolerance ms
            <input
              type="number"
              min={60}
              max={300}
              step={1}
              disabled={disabled}
              aria-label="Detection timing tolerance in milliseconds"
              data-testid="detect-tolerance"
              className={inputClass}
              value={config.detect.toleranceMs}
              onChange={(e) =>
                patch({
                  detect: {
                    ...config.detect,
                    toleranceMs: clampInt(Number(e.target.value), 60, 300),
                  },
                })
              }
            />
          </label>
          <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
            Pass at
            <input
              type="number"
              min={0.5}
              max={1}
              step={0.05}
              disabled={disabled}
              aria-label="Auto-rep pass threshold (share of notes hit)"
              data-testid="detect-threshold"
              className={inputClass}
              value={config.detect.passThreshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                const t = Number.isFinite(n)
                  ? Math.min(1, Math.max(0.5, Math.round(n * 100) / 100))
                  : 0.8;
                patch({ detect: { ...config.detect, passThreshold: t } });
              }}
            />
          </label>
        </div>

        {/* Latency (D134): wizard + manual entry + stored-record honesty. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={disabled}
            title="Run the latency calibration wizard (16 clicks, tap along)"
            data-testid="latency-calibrate-btn"
            onClick={onCalibrate}
            className={actionClass}
          >
            Calibrate
          </button>
          <label className={`${rowLabelClass} text-[10px] flex items-center gap-1.5`}>
            Manual ms
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              disabled={disabled}
              aria-label="Manual latency offset in milliseconds"
              data-testid="latency-manual-input"
              // Remount when the STORED record changes (wizard save) so
              // the uncontrolled field never shows a stale draft.
              key={latencyRecord !== null ? `${latencyRecord.inputLatencyMs}-${latencyRecord.calibratedAtMs}` : "uncalibrated"}
              className={inputClass}
              placeholder="0"
              defaultValue={latencyRecord !== null ? latencyRecord.inputLatencyMs : ""}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") return;
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                onManualLatency(clampInt(n, 0, 500));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        </div>
        <div
          data-testid="latency-record"
          className="text-[10px] t-mono text-neutral-400"
        >
          {latencyRecord !== null
            ? `${latencyRecord.inputLatencyMs} ms (${latencyRecord.source}) - ${latencyAgeLabel(latencyRecord)}`
            : "uncalibrated - detection runs uncompensated (0 ms)"}
        </div>
        <p className="text-[10px] text-neutral-500 leading-snug">
          Browser-reported output latency excludes Bluetooth/USB buffering;
          calibration is per audio path - recalibrate when switching
          headphones or speakers.
        </p>

        {/* REQ-PRAC-53 post-pass summary (D131): role=status + counts.
            data-notes-hit is the e2e leg-2 poll seam (section 6.2/8.2). */}
        {config.detect.enabled && (
          <div
            role="status"
            aria-live="polite"
            data-testid="detect-summary"
            data-notes-hit={phrase !== null ? phrase.matched : 0}
            data-accuracy-pct={phrase !== null ? Math.round(phrase.matchedFraction * 100) : -1}
            className="text-[10px] t-mono text-neutral-300 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1.5 surface-1"
          >
            {phrase !== null
              ? summarizePhrase(phrase, passCount)
              : "No pass scored yet - play one full pass with detection armed."}
          </div>
        )}
      </div>

      {/* 6. Practice sessions (D133): end-of-session card + last 5. */}
      <div className="flex flex-col gap-1.5">
        <div className={`${rowLabelClass} text-[10px]`}>Sessions</div>
        {lastSession !== null && lastSession.endedAtMs !== null && (
          <div
            role="status"
            aria-live="polite"
            data-testid="session-summary"
            className="text-[10px] t-mono text-neutral-300 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1.5 surface-1"
          >
            {summarizeSessionLine(lastSession)}
          </div>
        )}
        {sessions.length > 0 ? (
          <ul data-testid="sessions-list" className="flex flex-col gap-1">
            {[...sessions]
              .slice(-5)
              .reverse()
              .map((s) => (
                <li
                  key={s.startedAtMs}
                  data-testid="session-row"
                  className="text-[10px] t-mono text-neutral-400"
                >
                  {sessionRowLine(s)}
                </li>
              ))}
          </ul>
        ) : (
          <div className="text-[10px] text-neutral-500">
            No sessions stored yet - play with a drill, ramp or detection
            engaged for at least 20 seconds.
          </div>
        )}
      </div>
    </div>
  );
};
