/**
 * src/components/ComposeMixer.tsx - PRD-001 Phase 4 Slice 4
 * (REQ-COMP-37 UI, D77/D78/D85).
 *
 * The 4-group mixer (W1: the PRD contract, NOT a DAW): rows for
 * Original / Bass / Chords / Pad, each with a level slider (0..1),
 * M + S buttons, plus the audition transport [Play mix]/[Stop] and
 * the two export buttons. Fully controlled (reads NOTHING from the
 * store - AnalysisCard/AccompanimentPanel pattern): the surface owns
 * mixer state, the singleton player, and the export handlers.
 *
 * LIVE knobs (D77): onPatchMixer fires per input event; the surface
 * writes the gains straight to the player's GainNodes (applyMix) -
 * this component NEVER triggers a re-render of audio.
 *
 * Honesty labels (D78/D84): the original row shows
 * "Original (drums not played)" when the file has percussion, and
 * renders DISABLED with "no file - chart only" for chart sessions
 * (hasOriginal false - the gain math forces 0 too, computeGroupGains).
 *
 * The transport mirrors the S3 preview state machine (data-preview
 * on mix-play) - same idle->rendering->playing pins, e2e leg 1.
 */

import React from "react";
import { MIX_GROUPS, type MixGroup, type MixerState } from "../../engine/compose/types";
import type { PreviewState } from "../lib/composePreview";

export interface ComposeMixerProps {
  mixer: MixerState;
  /** False = chart-only: the original row is disabled (D78/D84). */
  hasOriginal: boolean;
  /** Disclosure string for the original row, owned by the SURFACE
   *  (D78 "Original (drums not played)" / D84 "no file - chart
   *  only"; "" = plain). */
  originalLabel: string;
  /** SAME singleton state machine (D77). */
  previewState: PreviewState;
  /** Result or original tracks present (D81: both exports need
   *  SOMETHING; original-only export IS legal). */
  canExport: boolean;
  onPatchMixer: (m: MixerState) => void;
  onPlay: () => void;
  onStop: () => void;
  onExportMidi: () => void;
  onExportWav: () => void;
}

const ROW_LABEL: Readonly<Record<MixGroup, string>> = {
  original: "Original",
  bass: "Bass",
  chords: "Chords",
  pad: "Pad",
};

function withGroup<K extends MixGroup>(m: MixerState, g: K, patch: Partial<MixerState[K]>): MixerState {
  return { ...m, [g]: { ...m[g], ...patch } };
}

export function ComposeMixer({
  mixer,
  hasOriginal,
  originalLabel,
  previewState,
  canExport,
  onPatchMixer,
  onPlay,
  onStop,
  onExportMidi,
  onExportWav,
}: ComposeMixerProps): React.ReactElement {
  const anySolo = MIX_GROUPS.some((g) => mixer[g].solo);
  const rendering = previewState === "rendering";

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/20 p-4 flex flex-col gap-2"
      data-testid="compose-mixer"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="t-label text-[color:var(--color-text-2)]">Mixer</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="mix-play"
            data-preview={previewState}
            disabled={rendering}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] disabled:opacity-40"
            title="Renders each group once (90s audition cap), then plays them sample-accurate together. Knobs are live."
            onClick={previewState === "playing" ? onStop : onPlay}
          >
            {previewState === "playing" ? "Stop" : previewState === "rendering" ? "Rendering..." : "Play mix"}
          </button>
          <button
            type="button"
            data-testid="mix-export-midi"
            disabled={!canExport || rendering}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] disabled:opacity-40"
            title="Combined MIDI: original tracks (incl. drums) + generated roles, tempo map + time signatures + key signatures."
            onClick={onExportMidi}
          >
            Export MIDI
          </button>
          <button
            type="button"
            data-testid="mix-export-wav"
            disabled={!canExport || rendering}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] disabled:opacity-40"
            title="Full-mix WAV at the current levels (mono 16-bit, renders up to 10:00)."
            onClick={onExportWav}
          >
            Export WAV
          </button>
        </div>
      </div>

      {MIX_GROUPS.map((group) => {
        const s = mixer[group];
        const disabled = group === "original" && !hasOriginal;
        const dimmed = anySolo && !s.solo;
        return (
          <div
            key={group}
            className="flex items-center gap-3"
            data-testid={`mix-row-${group}`}
            data-disabled={disabled ? "true" : "false"}
            data-dimmed={dimmed ? "true" : "false"}
          >
            <span className="w-44 shrink-0 text-sm text-[color:var(--color-text-1)]" title={originalLabel}>
              {ROW_LABEL[group]}
              {group === "original" && (disabled || originalLabel !== "") && (
                // D78/D84: the SURFACE owns the honest disclosure
                // string ("Original (drums not played)" /
                // "no file - chart only"); this row renders it.
                <span className="t-label block text-[color:var(--color-text-3)]" data-testid="mix-original-sub">
                  {originalLabel}
                </span>
              )}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.level}
              disabled={disabled}
              aria-label={`${ROW_LABEL[group]} level`}
              aria-valuetext={`${Math.round(s.level * 100)} percent`}
              data-testid={`mix-level-${group}`}
              className="w-40 disabled:opacity-40"
              onChange={(e) => onPatchMixer(withGroup(mixer, group, { level: Number(e.target.value) }))}
            />
            <button
              type="button"
              aria-pressed={s.muted}
              aria-label={`Mute ${group}`}
              disabled={disabled}
              data-testid={`mix-mute-${group}`}
              className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${
                s.muted
                  ? "border-red-400/60 bg-red-500/20 text-red-200"
                  : "border-[color:var(--color-border)] text-[color:var(--color-text-2)]"
              }`}
              onClick={() => onPatchMixer(withGroup(mixer, group, { muted: !s.muted }))}
            >
              M
            </button>
            <button
              type="button"
              aria-pressed={s.solo}
              aria-label={`Solo ${group}`}
              disabled={disabled}
              data-testid={`mix-solo-${group}`}
              className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${
                s.solo
                  ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                  : "border-[color:var(--color-border)] text-[color:var(--color-text-2)]"
              }`}
              onClick={() => onPatchMixer(withGroup(mixer, group, { solo: !s.solo }))}
            >
              S
            </button>
          </div>
        );
      })}
    </div>
  );
}
