import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Drum, Settings2 } from "lucide-react";
import {
  formatChordReadout,
  formatGuideToneTally,
  formatStepEyebrow,
  formatTempo,
} from "../lib/practiceHeader";
import { GuideToneFeedback } from "./GuideToneFeedback";
import { MetronomeControls } from "./MetronomeControls";
import type { GuideToneTrail } from "../lib/guideToneTrail";
import type { BackingStyle } from "../lib/backingEngine";
import type { HarmonicPath } from "../lib/paths";
import type { TimeSignature } from "../lib/rhythm";
import type { MetronomeConfig } from "../lib/metronomePatterns";
import {
  SCORE_MODE_HINT,
  SCORE_MODE_LABEL,
  allScoreModes,
  type ScoreDisplayMode,
} from "../lib/displayMode";

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
  /** Transposed chord notes (MIDI) for the active step — fed to
   *  the GuideToneFeedback classifier. */
  chordNotes: number[];
  /** Live guide-tone tally from useGuideToneTrail. Renders a small
   *  "✓ N · ✗ M" chip next to GuideToneFeedback so sight-reading
   *  practice gets immediate feedback without recording. */
  guideToneTrail?: GuideToneTrail;

  // Transport
  isPlaying: boolean;
  onPlayPause: () => void;

  // Tempo
  tempo: number;
  onTempoChange: (t: number) => void;

  // Loop
  isLooping: boolean;
  onLoopToggle: () => void;

  // Metronome click (audio: rhythmEngine-driven; independent of the
  // backing track. Surfaced here in the practice header so the click
  // on/off is visible alongside Start/Loop without hunting for it.)
  metronomeOn: boolean;
  onMetronomeToggle: () => void;

  /** PRD-001 Phase 3 Slice 3 (D36): the click-settings popover state.
   *  Owned upstream (useSessionStore); this header is the click's
   *  home surface - the PlaySessionRail's old metronome toggle was
   *  deliberately REMOVED at dfd2be3, do not resurrect it there. */
  metronomeConfig: MetronomeConfig;
  onMetronomeConfigChange: (next: MetronomeConfig) => void;

  // Backing style
  backingStyle: BackingStyle;
  onBackingStyleChange: (s: BackingStyle) => void;

  // Volume
  volume: number;
  onVolumeChange: (v: number) => void;

  // Score display mode (full / zoom)
  scoreDisplayMode: ScoreDisplayMode;
  onScoreDisplayModeChange: (m: ScoreDisplayMode) => void;
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
  chordNotes,
  guideToneTrail,
  isPlaying,
  onPlayPause,
  tempo,
  onTempoChange,
  isLooping,
  onLoopToggle,
  metronomeOn,
  onMetronomeToggle,
  metronomeConfig,
  onMetronomeConfigChange,
  backingStyle,
  onBackingStyleChange,
  volume,
  onVolumeChange,
  scoreDisplayMode,
  onScoreDisplayModeChange,
}) => {
  const readout = formatChordReadout(
    path,
    activeStepIndex,
    chordName,
    timeSignature,
  );
  const eyebrow = formatStepEyebrow(path, activeStepIndex);
  const guideToneLabel = guideToneTrail
    ? formatGuideToneTally(guideToneTrail)
    : null;

  // PRD-001 Phase 3 Slice 3 (D36): the click-settings popover. Local
  // ephemeral UI state (visibility is not a persisted taste - the
  // CONFIG inside it is). Gesture-driven open; the document listeners
  // mount only while open (PHASE-3-03-safe, full cleanup).
  const [clickSettingsOpen, setClickSettingsOpen] = useState(false);
  const clickSettingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clickSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClickSettingsOpen(false);
    };
    const onDown = (ev: MouseEvent) => {
      const host = clickSettingsRef.current;
      if (host && !host.contains(ev.target as Node)) {
        setClickSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [clickSettingsOpen]);

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
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <GuideToneFeedback chordNotes={chordNotes} />
          {guideToneLabel && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 text-[11px] t-mono text-neutral-200${isPlaying ? "" : " opacity-60"}`}
              role="status"
              aria-live="polite"
              data-testid="guide-tone-tally"
              title={
                isPlaying
                  ? "Live guide-tone tally since the practice loop started"
                  : "Paused — tally frozen"
              }
            >
              <span aria-hidden>GT</span>
              <span>{guideToneLabel}</span>
            </span>
          )}
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

        {/* Metronome click - visible toggle for the rhythmEngine's
            audio click. Default off (per useSessionStore). The
            backing track keeps running regardless. FIX ROUND stale
            comment: the PlaySessionRail mirror was REMOVED (dfd2be3)
            - this header is the SINGLE access point for the click
            toggle (the rail still drives the audio, exposes no UI). */}
        <button
          onClick={onMetronomeToggle}
          aria-pressed={metronomeOn}
          aria-label={metronomeOn ? "Mute metronome click" : "Unmute metronome click"}
          title={
            metronomeOn
              ? "Metronome click on — click to mute (backing track keeps running)"
              : "Metronome click off — click to enable a click track during playback"
          }
          data-testid="metronome-toggle"
          className={`flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs t-mono border transition-colors ${
            metronomeOn
              ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
              : "border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-200 surface-1"
          }`}
        >
          <Drum size={12} aria-hidden /> Click
        </button>

        {/* Click settings (D36): gear button beside the Click toggle -
            same row, same token styling. Opens the volume / preset /
            subdivision / accents / count-in popover. z-40: above the
            sticky header (z-30), below modals/drawers (z-50). */}
        <div className="relative" ref={clickSettingsRef}>
          <button
            onClick={() => setClickSettingsOpen((v) => !v)}
            aria-expanded={clickSettingsOpen}
            aria-label="Click settings"
            title="Click settings - volume, sound, subdivision, accents, count-in"
            data-testid="metronome-settings-toggle"
            className={`flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs t-mono border transition-colors ${
              clickSettingsOpen
                ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
                : "border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-200 surface-1"
            }`}
          >
            <Settings2 size={12} aria-hidden />
          </button>
          {clickSettingsOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-72 rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 p-3 shadow-xl">
              <MetronomeControls
                config={metronomeConfig}
                timeSignature={timeSignature}
                onChange={onMetronomeConfigChange}
              />
            </div>
          )}
        </div>

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

        {/* Score display mode (full / zoom) */}
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="t-mono uppercase tracking-wider text-[10px]">
            Score
          </span>
          <select
            value={scoreDisplayMode}
            onChange={(e) =>
              onScoreDisplayModeChange(e.target.value as ScoreDisplayMode)
            }
            aria-label="Score display mode"
            title={SCORE_MODE_HINT[scoreDisplayMode]}
            className="bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-2 py-1 text-xs text-neutral-200"
          >
            {allScoreModes().map((m) => (
              <option key={m} value={m}>
                {SCORE_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};
