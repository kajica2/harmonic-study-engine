/**
 * src/components/ComposePianoRoll.tsx - PRD-001 Phase 4 Slice 2 (D64,
 * REQ-COMP-5 P1 melody-only carve).
 *
 * NEW tick-native read-only SVG roll - EtudePianoRoll reuse was
 * REJECTED (step/tick mismatch: fabricating a fake Etude would lie
 * about slots/ppq and couple phase-3 invariants). Imports ONLY
 * ROLL_PALETTE from it (single source of truth for the Okabe-Ito set,
 * TD-040: zero etude mode-UI change).
 *
 * TICK-LINEAR x: (tick / ppq) * PX_PER_QUARTER - NOT seconds - so
 * barlines stay evenly spaced across tempo maps and the roll aligns
 * with the (tick-based) chord chart. Static SVG (EtudePianoRoll
 * precedent: tiny data, never animates, jsdom-assertable).
 *
 * TD-041 HONESTY CAPTION when the melody line is synthesized: gap
 * absorption is a known S1 limitation and must be disclosed, not
 * rendered as if authoritative.
 */

import React from "react";
import { ROLL_PALETTE } from "./EtudePianoRoll";
import { barBoundaries } from "../../engine/compose/tempo";
import type {
  AnalysisWindow,
  MelodyResult,
  NormalizedNote,
  NormalizedProject,
} from "../../engine/compose/types";

export const PX_PER_QUARTER = 12;
const ROW_H = 6;

const FLAT_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

function midiLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${FLAT_NAMES[pc]}${octave}`;
}

/** role=img text alternative (exported for tests + aria). */
export function rollSummary(notes: readonly NormalizedNote[], ppq: number): string {
  if (notes.length === 0) return "melody: no notes";
  let lo = notes[0].midi;
  let hi = notes[0].midi;
  let start = notes[0].tick;
  let end = notes[0].tick + notes[0].durationTicks;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
    if (n.tick < start) start = n.tick;
    const e = n.tick + n.durationTicks;
    if (e > end) end = e;
  }
  const quarters = ppq > 0 ? Math.round((end - start) / ppq) : 0;
  return `melody: ${notes.length} notes, range ${midiLabel(lo)} to ${midiLabel(hi)}, span ${quarters} quarter notes`;
}

/** Deterministic serialized summary of the overlay layers (e2e legs
 *  2/3: seed-change differs, reload-same-seed is BYTE-identical).
 *  Fixed field order + toFixed(4) velocity = stable string. */
export function serializeLayers(layers: readonly RollLayer[]): string {
  return layers
    .flatMap((l) =>
      l.notes.map(
        (n) =>
          `${l.label}:${n.tick}:${n.midi}:${n.durationTicks}:${n.velocity.toFixed(4)}`,
      ),
    )
    .join(";");
}

export interface RollLayer {
  /** Layer id -> data-testid "roll-layer-<label>" (e2e D76). */
  readonly label: string;
  readonly notes: readonly NormalizedNote[];
  readonly color: string;
}

export interface ComposePianoRollProps {
  project: NormalizedProject;
  melody: MelodyResult;
  window: AnalysisWindow;
  truncated: boolean;
  /** PRD-001 Phase 4 Slice 3 (D76): optional accompaniment overlay
   *  layers. UNDEFINED -> byte-identical S2 behavior (its test pins
   *  keep passing); DEFINED -> per-layer rect groups reusing the
   *  existing x/y mapping + an sr-only serialized summary (the e2e
   *  determinism-across-reload string). */
  layers?: readonly RollLayer[];
}

export function ComposePianoRoll({
  project,
  melody,
  window,
  truncated,
  layers,
}: ComposePianoRollProps): React.ReactElement {
  const notes = melody.notes;
  const ppq = project.ppq > 0 ? project.ppq : 480;
  const xOf = (tick: number): number => (tick / ppq) * PX_PER_QUARTER;

  // Semitone rows over the note range padded 1 (60..72 fallback when
  // empty - the EtudePianoRoll precedent). With layers defined the
  // band widens to cover them (bass sits far below a melody line).
  let lo = 60;
  let hi = 72;
  const hasRange = notes.length > 0 || (layers ?? []).some((l) => l.notes.length > 0);
  if (hasRange) {
    lo = Infinity;
    hi = -Infinity;
    for (const n of notes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }
    for (const layer of layers ?? []) {
      for (const n of layer.notes) {
        if (n.midi < lo) lo = n.midi;
        if (n.midi > hi) hi = n.midi;
      }
    }
  }
  lo -= 1;
  hi += 1;
  const yOf = (midi: number): number => (hi - midi) * ROW_H;

  // Horizontal extent: the WINDOW when truncated (so the window edge
  // is visible), else the whole analyzed span. Never below one
  // quarter so an empty project still renders a legible grid.
  const rightTick = Math.max(truncated ? window.toTick : project.endTick, ppq);
  const width = xOf(rightTick);
  const height = (hi - lo + 1) * ROW_H;
  const boundaries = barBoundaries(project, rightTick);
  const summary = rollSummary(notes, ppq);

  return (
    <div className="flex flex-col gap-2" data-testid="compose-piano-roll">
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/30">
        <svg
          role="img"
          aria-label={summary}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid="compose-roll-svg"
        >
          {/* Barlines + labels every 4 bars (meter-change aware). */}
          {boundaries.map((b, i) => (
            <g key={`barline-${i}`} data-kind="barline-group">
              <line
                data-kind="barline"
                data-testid="roll-barline"
                x1={xOf(b.startTick)}
                x2={xOf(b.startTick)}
                y1={0}
                y2={height}
                stroke={ROLL_PALETTE.barline}
                strokeWidth={1}
              />
              {i % 4 === 0 && (
                <text
                  data-kind="bar-label"
                  x={xOf(b.startTick) + 2}
                  y={10}
                  fontSize={9}
                  fill={ROLL_PALETTE.grid}
                >
                  {i + 1}
                </text>
              )}
            </g>
          ))}

          {/* Truncation window edge. */}
          {truncated && (
            <line
              data-kind="window-edge"
              data-testid="roll-window-edge"
              x1={xOf(window.toTick)}
              x2={xOf(window.toTick)}
              y1={0}
              y2={height}
              stroke={ROLL_PALETTE.syncopated}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}

          {/* Melody notes (velocity-tinted; decorative only, the
             summary carries the information). */}
          {notes.map((n, i) => (
            <rect
              key={`note-${i}`}
              data-kind="note"
              data-testid="note-rect"
              x={xOf(n.tick) + 0.5}
              y={yOf(n.midi) + 0.5}
              width={Math.max(1, (n.durationTicks / ppq) * PX_PER_QUARTER - 1)}
              height={ROW_H - 1}
              fill={ROLL_PALETTE.melody}
              fillOpacity={0.35 + 0.65 * n.velocity}
            />
          ))}

          {/* Accompaniment overlay layers (S3): per-layer <g> with
             testids for the e2e legs; SAME x/y mapping as melody. */}
          {(layers ?? []).map((layer) => (
            <g key={`layer-${layer.label}`} data-testid={`roll-layer-${layer.label}`}>
              {layer.notes.map((n, i) => (
                <rect
                  key={`layer-${layer.label}-${i}`}
                  data-kind="layer-note"
                  x={xOf(n.tick) + 0.5}
                  y={yOf(n.midi) + 0.5}
                  width={Math.max(1, (n.durationTicks / ppq) * PX_PER_QUARTER - 1)}
                  height={ROW_H - 1}
                  fill={layer.color}
                  fillOpacity={0.35 + 0.65 * n.velocity}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <p className="sr-only">{summary}</p>
      {layers !== undefined && (
        <p className="sr-only" data-testid="roll-serialize">
          {serializeLayers(layers)}
        </p>
      )}
      {truncated && (
        <p
          className="t-small text-[color:var(--color-text-3)]"
          data-testid="roll-window-caption"
        >
          first 4:00 shown
        </p>
      )}
      {melody.synthesized && (
        <p
          className="t-small italic text-[color:var(--color-text-3)]"
          data-testid="roll-gap-caption"
        >
          Synthesized top line - silences are absorbed into note tails
          (known limitation).
        </p>
      )}
    </div>
  );
}
