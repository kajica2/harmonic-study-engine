import React from "react";
import { Play, Pause, Repeat } from "lucide-react";
import {
  formatChordReadout,
  formatStepEyebrow,
  formatTempo,
} from "../lib/practiceHeader";
import type { BackingStyle } from "../lib/backingEngine";
import type { HarmonicPath } from "../lib/paths";
import type { TimeSignature } from "../lib/rhythm";

/**
 * PracticeHeader — the dominant practice-loop strip.
 *
 * Goal: one clear start flow at the top of the page. Shows:
 *   - current path title
 *   - "Step N of M" eyebrow (familiar from existing UI)
 *   - "Bar X/Y — <chord>" readout (the new piece)
 *   - Start/Pause button
 *   - tempo, loop, backing style, volume (compact)
 *
 * Everything else (voicing inspector, persona, generator, MIDI,
 * recording, synesthesia matrix, arpeggiator, masterclass picker)
 * stays where it is — the IMPROVEMENT_PLAN explicitly does not
 * collapse those into this header. They live below in the
 * StageFrame / canvas area as today.
 *
 * Pure presentational. All state lives in App.tsx; this component
 * just renders + forwards callbacks. Formatters live in
 * src/lib/practiceHeader.ts and are unit-tested.
 */

interface PracticeHeaderProps {
  path: HarmonicPath;
  activeStepIndex: number;
  /** Display name of the chord (already transposed by caller). */
  chordName: string;
  timeSignature: TimeSignature;

  // Transport
  isPlaying: boolean;
  onPlayPause: () => void;

  // Tempo
  tempo: number;
  onTempoChange: (t: number) => void;

  // Loop
  isLooping: boolean;
  onLoopToggle: () => void;

  // Backing style
  backingStyle: BackingStyle;
  onBackingStyleChange: (s: BackingStyle) => void;

  // Volume
  volume: number;
  onVolumeChange: (v: number) => void;
}

const BACKING_STYLE_LABELS: Record<BackingStyle, string> = {
  off: "Off",
  swing: "Swing",
  bossa: "Bossa",
  funk: "Funk",
  latin: "Latin",
  ballad: "Ballad",
  "clave3-2": "Clave 3-2",
  "clave3-3": "Clave 3-3",
  "afro-4-4": "African 4:4",
  "afro-4-3": "African 4:3",
  "afro-3-4": "African 3:4",
};

export const PracticeHeader: React.FC<PracticeHeaderProps> = ({
  path,
  activeStepIndex,
  chordName,
  timeSignature,
  isPlaying,
  onPlayPause,
  tempo,
  onTempoChange,
  isLooping,
  onLoopToggle,
  backingStyle,
  onBackingStyleChange,
  volume,
  onVolumeChange,
}) => {
  const readout = formatChordReadout(
    path,
    activeStepIndex,
    chordName,
    timeSignature,
  );
  const eyebrow = formatStepEyebrow(path, activeStepIndex);

  return (
    <div
      className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 px-4 py-3 flex flex-wrap items-center gap-4"
      role="region"
      aria-label="Practice loop"
    >
      {/* Left: title + chord readout */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-widest font-mono text-neutral-500"
            title="Active path"
          >
            {eyebrow}
          </span>
          <span className="text-xs text-neutral-400 truncate max-w-[40ch]">
            {path.title}
          </span>
        </div>
        <div
          className="text-lg font-semibold text-neutral-100 leading-tight mt-0.5"
          data-testid="practice-header-readout"
        >
          {readout}
        </div>
      </div>

      {/* Center: Start / Pause (the dominant action) */}
      <button
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause practice" : "Start practice"}
        aria-pressed={isPlaying}
        className={`flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] text-sm font-semibold border transition-colors ${
          isPlaying
            ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10 hover:bg-[color:var(--color-brand)]/20"
            : "border-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] bg-[color:var(--color-brand-strong)] hover:opacity-90"
        }`}
      >
        {isPlaying ? (
          <>
            <Pause size={16} aria-hidden /> Pause
          </>
        ) : (
          <>
            <Play size={16} aria-hidden /> Start
          </>
        )}
      </button>

      {/* Right: tempo / loop / backing / volume */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tempo */}
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="t-mono uppercase tracking-wider text-[10px]">
            Tempo
          </span>
          <input
            type="range"
            min={30}
            max={240}
            step={1}
            value={tempo}
            onChange={(e) => onTempoChange(Number(e.target.value))}
            aria-label="Tempo"
            className="w-24 accent-[color:var(--color-brand)]"
          />
          <span className="t-mono text-[11px] text-neutral-200 w-14 text-right">
            {formatTempo(tempo)}
          </span>
        </label>

        {/* Loop */}
        <button
          onClick={onLoopToggle}
          aria-pressed={isLooping}
          aria-label={isLooping ? "Disable loop" : "Enable loop"}
          title={
            isLooping
              ? "Looping — click to disable (or shift+click two bars in the bar strip to set range)"
              : "Click to enable loop (then shift+click two bars to set range)"
          }
          className={`flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs t-mono border transition-colors ${
            isLooping
              ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
              : "border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-200 surface-1"
          }`}
        >
          <Repeat size={12} aria-hidden /> Loop
        </button>

        {/* Backing style */}
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="t-mono uppercase tracking-wider text-[10px]">
            Backing
          </span>
          <select
            value={backingStyle}
            onChange={(e) =>
              onBackingStyleChange(e.target.value as BackingStyle)
            }
            aria-label="Backing style"
            className="bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-2 py-1 text-xs text-neutral-200"
          >
            {(Object.keys(BACKING_STYLE_LABELS) as BackingStyle[]).map((s) => (
              <option key={s} value={s}>
                {BACKING_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {/* Volume */}
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="t-mono uppercase tracking-wider text-[10px]">
            Vol
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            aria-label="Volume"
            className="w-20 accent-[color:var(--color-brand)]"
          />
        </label>
      </div>
    </div>
  );
};
