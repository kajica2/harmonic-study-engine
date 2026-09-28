import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Drum, Settings2, ListChecks } from "lucide-react";
// PRD-001 Phase 8 S1 (D149): the flush-before-copy share seam - the
// study surface's Share button copies the CURRENT URL (path/bpm/
// persona/voicing/transpose/idea ride it) FRESH, never stale.
import { copyShareUrl, shareStatusText, type ShareStatus } from "../lib/shareUrl";
import {
  formatBarReadout,
  formatGuideToneTally,
  formatStepEyebrow,
  formatTempo,
} from "../lib/practiceHeader";
import { formatRampChip, type PracticeMechanicsConfig } from "../lib/practiceMechanics";
import type { DutyPhase } from "../../engine/practice/duty";
import type { RampState } from "../../engine/practice/ramp";
// PRD-001 Phase 7 S3 (D131/D134): the compact accuracy chip (armed only,
// same region as the ramp chip) + the wizard mount (dialog state lives
// HERE, mirroring the drills-popover precedent - App stays wiring-only).
import type { PhraseMatch } from "../../engine/practice/detect";
import type { SessionRecordV1 } from "../../engine/practice/session";
import type { LatencyRecord } from "../lib/practiceLatency";
import { LatencyWizard } from "./LatencyWizard";
import { GuideToneFeedback } from "./GuideToneFeedback";
import { MetronomeControls } from "./MetronomeControls";
import { PracticeMechanicsPanel } from "./PracticeMechanicsPanel";
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
  /** F3 (D110/D112): detectFormPeriod(path.steps) from App - the
   *  honest form-relative bar total for the readout. */
  formLen: number;
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

  // PRD-001 Phase 7 S2 (D127): the Drills gear + the two always-
  // visible live surfaces. Pure props-forwarding; ALL mechanics state
  // lives upstream (zustand practiceMechanics + App run mirrors).
  mechanics: PracticeMechanicsConfig;
  /** D125: runner active -> the panel renders DISABLED. */
  mechanicsDisabled: boolean;
  /** Current rail selection for the Capture A/B snapshot buttons. */
  mechanicsLoopSelection: { from: number; to: number } | null;
  /** Live ramp mirror; null = ramp not engaged. */
  rampState: RampState | null;
  /** passCompleted pulse counter (S3 seam indicator, D121). */
  repPulse: number;
  /** Pause duty phase for the PLAY/REST badge. */
  windowPhase: DutyPhase;
  onMechanicsChange: (next: PracticeMechanicsConfig) => void;
  onRepOutcome: (success: boolean) => void;
  onRampReset: () => void;

  // PRD-001 Phase 7 S3 (D131/D134): the detection chip + the Detection
  // section view-model + the wizard inputs. Pure props-forwarding; the
  // hook state + storage writes live in App.
  /** enabled && Web MIDI API present (D135.4) - chip + disable law. */
  detectionArmed: boolean;
  /** REQ-PRAC-54 (AMENDED D138): NO note source (no API AND no
   *  note-input) - panel honest-unavailable state. */
  detectionUnavailable: boolean;
  /** D135.4 status line: a HARDWARE MIDI input has been observed. */
  detectionHasDevice: boolean;
  /** S4 (D138): a fallback (hse-*) note-on was observed (status copy). */
  detectionSawFallback: boolean;
  /** S4 (D138): the Web MIDI API exists - the TRUE flag (with the
   *  widened gate, !detectionUnavailable no longer implies it). */
  detectionHasMidiApi: boolean;
  /** S3 fix round (MED-001): target bars in the built grid - the
   *  panel's canAutoRate disable law (all-free grid keeps manual). */
  detectionGridTargets: number;
  /** Last scored pass (summary card + chip readout). */
  detectionPhrase: PhraseMatch | null;
  /** "Pass N" counter (App-owned state). */
  detectionPassCount: number;
  /** Stored latency record (panel honesty copy + wizard prefill). */
  latencyRecord: LatencyRecord | null;
  /** Panel manual entry (0..500 ms, source "manual", D134). */
  onManualLatency: (ms: number) => void;
  /** Re-read the stored record after a wizard save. */
  onLatencySaved: () => void;
  /** Wizard gate: MIDI input device list non-empty (useMidiDevices). */
  midiHasDevice: boolean;
  /** Selected input name for the stored record (best effort). */
  midiDeviceName: string | null;
  /** Bass-channel exclusion (wizard taps; same law as the trail). */
  bassMidiChannel: number | null;
  /** S4 (D141): the note-input toggle - enables the wizard's
   *  fallback calibration mode (deviceList-free tap measurement). */
  noteInputEnabled: boolean;
  /** S4 (D140 mounting): root octave for the wizard's embedded
   *  compact piano (same component, same persisted root). */
  noteInputRootOctave: number;
  /** Recent completed sessions, newest last (D133 summary surface). */
  sessions: SessionRecordV1[];
  /** Last closed session for the end-of-session card (null = none). */
  lastSession: SessionRecordV1 | null;
}

/** S3 (D131): compact ASCII accuracy readout for the chip row -
 *  "DET 88%" once a pass scored, "DET armed" before the first one.
 *  Text + role=status: color never carries it alone (PRD 9.8). */
export function formatDetectionChip(m: PhraseMatch | null): string {
  if (m === null) return "DET armed";
  return `DET ${Math.round(m.matchedFraction * 100)}%`;
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
  formLen,
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
  mechanics,
  mechanicsDisabled,
  mechanicsLoopSelection,
  rampState,
  repPulse,
  windowPhase,
  onMechanicsChange,
  onRepOutcome,
  onRampReset,
  detectionArmed,
  detectionUnavailable,
  detectionHasDevice,
  detectionSawFallback,
  detectionHasMidiApi,
  detectionGridTargets,
  detectionPhrase,
  detectionPassCount,
  latencyRecord,
  onManualLatency,
  onLatencySaved,
  midiHasDevice,
  midiDeviceName,
  bassMidiChannel,
  noteInputEnabled,
  noteInputRootOctave,
  sessions,
  lastSession,
}) => {
  // F3 (D112): the honest form-relative readout. The legacy
  // formatChordReadout stays exported-but-dead in practiceHeader.ts
  // (frozen tests/practiceHeader.test.ts pins it - TD-050).
  const readout = formatBarReadout(formLen, activeStepIndex, chordName);
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

  // PRD-001 Phase 7 S2 (D127): the Drills popover. EXACT metronome-gear
  // D36 pattern - local visibility state, document keydown/mousedown
  // listeners mounted ONLY while open (PHASE-3-03-safe, full cleanup),
  // Escape + outside-click close, z-40 above the sticky header.
  const [drillsOpen, setDrillsOpen] = useState(false);
  const drillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drillsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrillsOpen(false);
    };
    const onDown = (ev: MouseEvent) => {
      const host = drillsRef.current;
      if (host && !host.contains(ev.target as Node)) {
        setDrillsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [drillsOpen]);

  // PRD-001 Phase 7 S3 (D134): the calibration wizard mount. Dialog
  // state lives HERE (the header owns its popover surfaces); the panel
  // Calibrate button opens it. Escape/backdrop close = onClose; the
  // wizard's rolling effect cleans itself up on unmount (no leaks).
  const [wizardOpen, setWizardOpen] = useState(false);

  // PRD-001 Phase 8 S1 (D149): the Share button's ephemeral status
  // (the local-visibility precedent - UI state, not persisted taste).
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const handleShare = (): void => {
    // copyShareUrl FLUSHES the debounced writer synchronously first
    // (the anti-stale law), then reads the fresh location.
    void copyShareUrl().then(setShareStatus);
  };

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
          {/* PRD-001 Phase 7 S2 (D127/REQ-PRAC-32): the ramp chip -
              left readout row, NOT the button row. Rendered only when
              the ramp is engaged. data-* hooks feed the deterministic
              e2e leg (no playback needed). */}
          {mechanics.rampEnabled && rampState !== null && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 text-[11px] t-mono text-neutral-200${isPlaying ? "" : " opacity-60"}`}
              role="status"
              aria-live="polite"
              data-testid="ramp-chip"
              data-bpm={rampState.bpm}
              data-phase={rampState.phase}
              data-rep-pulse={repPulse}
              title="Tempo ramp: current bpm -> target (+step), reps at bpm, success/fail streaks"
            >
              {formatRampChip(rampState, mechanics.ramp)}
            </span>
          )}
          {/* PRD-001 Phase 7 S3 (D131): compact accuracy chip - ARMED
              only (enabled + Web MIDI present), same region as the ramp
              chip. ASCII text readout, never color-only (PRD 9.8). */}
          {detectionArmed && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 text-[11px] t-mono text-neutral-200${isPlaying ? "" : " opacity-60"}`}
              role="status"
              aria-live="polite"
              data-testid="detect-chip"
              data-notes-hit={detectionPhrase !== null ? detectionPhrase.matched : undefined}
              title={
                detectionPhrase !== null
                  ? `Detection: ${detectionPhrase.matched}/${detectionPhrase.expectedTotal} expected notes hit on the last pass`
                  : "Detection armed - play a full pass for the first verdict"
              }
            >
              {formatDetectionChip(detectionPhrase)}
            </span>
          )}
          {/* Phase badge (pause mode): glyph + TEXT, never color-only
              (PRD 9.8). ASCII glyphs: >> play, -- rest. */}
          {mechanics.mode === "pause" && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] border text-[11px] t-mono${
                windowPhase === "rest"
                  ? " border-[color:var(--color-border)] text-neutral-400 surface-1"
                  : " border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
              }`}
              role="status"
              aria-live="polite"
              data-testid="phase-badge"
              data-phase={windowPhase}
              title={
                windowPhase === "rest"
                  ? "Rest bar - the click and the playhead keep running"
                  : "Play bar"
              }
            >
              <span aria-hidden>{windowPhase === "rest" ? "--" : ">>"}</span>
              <span>{windowPhase === "rest" ? "REST" : "PLAY"}</span>
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

        {/* Drills (S2, D127): gear beside the click gear, same row,
            same token styling, same open/close machinery. Pause mode,
            A/B compare, tempo ramp. Zero new global keys - every
            control inside is a real button/input. */}
        <div className="relative" ref={drillsRef}>
          <button
            onClick={() => setDrillsOpen((v) => !v)}
            aria-expanded={drillsOpen}
            aria-label="Drills settings"
            title="Drills - pause mode, A/B compare, tempo ramp"
            data-testid="mechanics-settings-toggle"
            className={`flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs t-mono border transition-colors ${
              drillsOpen
                ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
                : "border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-200 surface-1"
            }`}
          >
            <ListChecks size={12} aria-hidden />
          </button>
          {drillsOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-96 rounded-[var(--radius-md)] border border-[color:var(--color-border)] surface-1 p-3 shadow-xl">
              <PracticeMechanicsPanel
                config={mechanics}
                rampState={rampState}
                loopSelection={mechanicsLoopSelection}
                formLen={formLen}
                disabled={mechanicsDisabled}
                onConfigChange={onMechanicsChange}
                onRepOutcome={onRepOutcome}
                onRampReset={onRampReset}
                // S3: the Detection section view-model (pure forwarding).
                detectionUnavailable={detectionUnavailable}
                detectionHasDevice={detectionHasDevice}
                // S4 (D138): the widened-gate signals for the copy.
                detectionSawFallback={detectionSawFallback}
                detectionHasMidiApi={detectionHasMidiApi}
                detectionGridTargets={detectionGridTargets}
                phrase={detectionPhrase}
                passCount={detectionPassCount}
                latencyRecord={latencyRecord}
                onManualLatency={onManualLatency}
                onCalibrate={() => setWizardOpen(true)}
                sessions={sessions}
                lastSession={lastSession}
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

        {/* PRD-001 Phase 8 S1 (D149): Share - copies the CURRENT
            session URL (flushed fresh: path/bpm/persona/voicing/
            transpose/idea all ride the one writer). Mouse/touch
            affordance only - NO key binding (the frozen SHORTCUTS
            reverse pin, D143 precedent). */}
        <div className="flex items-center gap-2">
          {shareStatus !== null && (
            <span
              role="status"
              aria-live="polite"
              data-testid="share-url-status"
              className="text-[10px] t-mono text-[color:var(--color-text-3)]"
            >
              {shareStatusText(shareStatus)}
            </span>
          )}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share session link"
            title="Copy the current session URL - the link reproduces this practice setup"
            data-testid="share-url-button"
            className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs t-mono border border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-200 surface-1"
          >
            Share
          </button>
        </div>
      </div>

      {/* S3 (D134): the calibration wizard (ModalShell, mounted only
          while open - unmount runs the rolling cleanup). S4 (D138/
          D141): hasMidiApi is the TRUE API flag (the old
          !detectionUnavailable derivation would LIE once the widened
          gate opens on the fallback input alone), and the wizard
          gains the fallback calibration mode. */}
      {wizardOpen && (
        <LatencyWizard
          onClose={() => setWizardOpen(false)}
          tempo={tempo}
          hasMidiApi={detectionHasMidiApi}
          hasDevice={midiHasDevice}
          deviceName={midiDeviceName}
          bassMidiChannel={bassMidiChannel}
          noteInputEnabled={noteInputEnabled}
          noteInputRootOctave={noteInputRootOctave}
          onSaved={onLatencySaved}
        />
      )}
    </div>
  );
};
