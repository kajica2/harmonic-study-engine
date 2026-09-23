/**
 * src/components/MetronomeControls.tsx - PRD-001 Phase 3 Slice 3
 * (D36, REQ-PRAC-1). Pure presentational click-settings panel mounted
 * in the PracticeHeader popover: volume / preset / subdivision /
 * accent beats / count-in bars.
 *
 * All state lives upstream (useSessionStore.metronomeConfig via App);
 * every onChange emits a COMPLETE MetronomeConfig object. The accent
 * chip row re-derives from the ACTIVE meter (beatsPerMeasureFor:
 * 4/6/7/11/16 chips) - chips beyond a future meter's count are
 * stored but ignored, never corrupting data (D32).
 */

import React from "react";
import {
  beatsPerMeasureFor,
  type MetronomeConfig,
  type MetronomePreset,
  type MetronomeSubdivision,
} from "../lib/metronomePatterns";
import type { TimeSignature } from "../lib/rhythm";

export interface MetronomeControlsProps {
  config: MetronomeConfig;
  timeSignature: TimeSignature;
  onChange: (next: MetronomeConfig) => void;
}

const PRESET_LABELS: Record<MetronomePreset, string> = {
  beep: "Beep (current)",
  click: "Click (dry stick)",
  shaker: "Shaker (soft)",
};

const SUBDIVISIONS: readonly MetronomeSubdivision[] = [1, 2, 3, 4];

// Beat-relative semantics (the repo's beat: quarter in 4/4/11/4/
// tintal, eighth in 6/8/7/8) - surfaced verbatim in the tooltips.
const SUBDIVISION_TITLES: Record<MetronomeSubdivision, string> = {
  1: "1 = one click per beat (current)",
  2: "2 = split the beat",
  3: "3 = triplet (scheduled inside the beat)",
  4: "4 = four clicks per beat; clamps to the grid in compound meters",
};

const COUNT_IN_LABELS: Record<0 | 1 | 2, string> = {
  0: "Off",
  1: "1 bar",
  2: "2 bars",
};

const segClass = (active: boolean): string =>
  `px-2 py-1 rounded-[var(--radius-sm)] text-xs t-mono border transition-colors ${
    active
      ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
      : "border-[color:var(--color-border)] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
  }`;

const rowLabelClass =
  "t-label text-[color:var(--color-text-3)] uppercase tracking-wider";

export const MetronomeControls: React.FC<MetronomeControlsProps> = ({
  config,
  timeSignature,
  onChange,
}) => {
  const patch = (p: Partial<MetronomeConfig>) =>
    onChange({ ...config, ...p });

  const beats = beatsPerMeasureFor(timeSignature);
  const beatIndices = Array.from({ length: beats }, (_, i) => i);

  const toggleAccent = (beat: number) => {
    const has = config.accentBeats.indexOf(beat) >= 0;
    const next = has
      ? config.accentBeats.filter((b) => b !== beat)
      : [...config.accentBeats, beat].sort((a, b) => a - b);
    patch({ accentBeats: next });
  };

  return (
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-label="Metronome click settings"
    >
      {/* Volume - INDEPENDENT of playback volume (REQ-PRAC-2). */}
      <label className="flex flex-col gap-1">
        <span className={rowLabelClass}>{`Click volume ${config.volume}`}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={config.volume}
          onChange={(e) => patch({ volume: Number(e.target.value) })}
          aria-label="Click volume"
          className="w-full accent-[color:var(--color-brand)]"
        />
        <span className="text-[10px] text-[color:var(--color-text-3)]">
          independent of playback volume
        </span>
      </label>

      {/* Preset select (D33 synthesis). */}
      <label className="flex flex-col gap-1">
        <span className={rowLabelClass}>Click sound</span>
        <select
          value={config.preset}
          onChange={(e) =>
            patch({ preset: e.target.value as MetronomePreset })
          }
          aria-label="Click sound"
          className="bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[color:var(--color-text-2)]"
        >
          {(Object.keys(PRESET_LABELS) as MetronomePreset[]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {/* Subdivision - beat-relative, with the clamp documented. */}
      <div className="flex flex-col gap-1">
        <span className={rowLabelClass}>Subdivision (per beat)</span>
        <div className="flex gap-1">
          {SUBDIVISIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                patch({ subdivision: s as MetronomeSubdivision })
              }
              aria-pressed={config.subdivision === s}
              aria-label={`Subdivision ${s}`}
              title={SUBDIVISION_TITLES[s]}
              className={segClass(config.subdivision === s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Accent beats - one chip per beat of the ACTIVE meter. */}
      <div className="flex flex-col gap-1">
        <span className={rowLabelClass}>{`Accent beats (${timeSignature})`}</span>
        <div className="flex gap-1 flex-wrap">
          {beatIndices.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => toggleAccent(b)}
              aria-pressed={config.accentBeats.indexOf(b) >= 0}
              aria-label={`Accent beat ${b + 1}`}
              title={`Sounding beat ${b + 1} high (accented) or low (weak)`}
              className={segClass(config.accentBeats.indexOf(b) >= 0)}
            >
              {b + 1}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-[color:var(--color-text-3)]">
          none selected = all clicks weak
        </span>
      </div>

      {/* Count-in bars (REQ-PRAC-10). */}
      <div className="flex flex-col gap-1">
        <span className={rowLabelClass}>Count-in</span>
        <div className="flex gap-1">
          {([0, 1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => patch({ countInBars: n })}
              aria-pressed={config.countInBars === n}
              aria-label={
                n === 0 ? "No count-in" : `Count in ${n} bar${n > 1 ? "s" : ""}`
              }
              title="Beats played before playback starts"
              className={segClass(config.countInBars === n)}
            >
              {COUNT_IN_LABELS[n]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
