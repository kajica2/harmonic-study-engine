/**
 * EtudePianoRoll.tsx - PRD-001 Phase 3 Slice 2 (D25, REQ-ETU-20).
 *
 * STATIC SVG piano roll for the generated melody. SVG (not canvas):
 * the data is tiny (<= 32 bars x 8 slots = 256 slots, <= ~256 note
 * rects), the view never animates per-frame (the SynesthesiaCanvas
 * precedent is reserved for rAF work), abcjs (the repo's notation
 * house style) is SVG, and jsdom can actually assert structure.
 *
 * Color-vision-diversity (PRD 9.8): Okabe-Ito subset ONLY, and every
 * color cue is redundant with a shape cue - strong-beat notes get a
 * light 1px outline, syncopated notes get a dashed top edge, bar
 * lines are solid separators.
 *
 * `activeBar` is a PLAIN prop (App derives it from activeStepIndex
 * via etudeActiveBarFor - a FORM-relative bar index, 0..bars-1, since
 * etude paths carry one step per bar; see EtudeViews.tsx); no store
 * subscription, no useTick - the roll stays render-only.
 */

import React from "react";
import type { Etude } from "../../engine/etude/types";

export interface EtudePianoRollProps {
  etude: Etude;
  transposeShift: number;
  activeBar?: number | null;
}

/** Okabe-Ito subset + neutral grays (D25). ASCII hex constants. */
export const ROLL_PALETTE = {
  melody: "#0072B2", // blue
  syncopated: "#D55E00", // vermillion
  chordLane: "#009E73", // bluish-green, 12% opacity lane tint
  grid: "#3F3F46", // zinc-700
  barline: "#71717A", // zinc-500
  strongOutline: "#F4F4F5", // zinc-100
  activeBar: "#FFFFFF",
} as const;

const SLOT_W = 10;
const ROW_H = 6;
const SLOTS_PER_BAR = 8;

const FLAT_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

function midiLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${FLAT_NAMES[pc]}${octave}`;
}

/**
 * Screen-reader summary (D25): keyboard-accessible text alternative
 * for a display-only view. Exported for tests + the staff view aria.
 */
export function melodySummary(etude: Etude): string {
  const notes = etude.melody;
  if (notes.length === 0) {
    return `${etude.bars}-bar melody, no notes`;
  }
  let lo = notes[0].midi;
  let hi = notes[0].midi;
  let sync = 0;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
    if (n.syncopated) sync += 1;
  }
  const last = notes[notes.length - 1];
  const ends =
    ((last.midi % 12) + 12) % 12 === etude.key
      ? "ends on the tonic"
      : `ends on ${midiLabel(last.midi)}`;
  return (
    `${etude.bars}-bar melody, ${notes.length} notes, ` +
    `range ${midiLabel(lo)} to ${midiLabel(hi)}, ` +
    `${sync} syncopated onsets, ${ends}`
  );
}

export function EtudePianoRoll({
  etude,
  transposeShift,
  activeBar = null,
}: EtudePianoRollProps): React.ReactElement {
  // Pitch rows: min/max of melody + chord roots, padded 1 semitone.
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of etude.melody) {
    const m = n.midi + transposeShift;
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  for (const c of etude.chords) {
    const root = (c.notes[0] ?? 60) + transposeShift;
    if (root < lo) lo = root;
    if (root > hi) hi = root;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 60;
    hi = 72;
  }
  lo -= 1;
  hi += 1;

  const cols = etude.bars * SLOTS_PER_BAR;
  const width = cols * SLOT_W;
  const height = (hi - lo + 1) * ROW_H;
  const yOf = (midi: number): number => (hi - midi) * ROW_H;
  const titleId = `${etude.canonicalId}-roll-title`;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/30">
        <svg
          role="img"
          aria-labelledby={titleId}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid="etude-piano-roll"
        >
          <title id={titleId}>{melodySummary(etude)}</title>

          {/* Chord lanes: voicing-extent tint + root row line (12%). */}
          {etude.chords.map((c, bar) => {
            const root = (c.notes[0] ?? 60) + transposeShift;
            const top = (c.notes[c.notes.length - 1] ?? root) + transposeShift;
            return (
              <g key={`lane-${bar}`} data-kind="chord-lane">
                <rect
                  x={bar * SLOTS_PER_BAR * SLOT_W}
                  y={yOf(top)}
                  width={SLOTS_PER_BAR * SLOT_W}
                  height={(top - root + 1) * ROW_H}
                  fill={ROLL_PALETTE.chordLane}
                  opacity={0.12}
                />
                <line
                  x1={bar * SLOTS_PER_BAR * SLOT_W}
                  x2={(bar + 1) * SLOTS_PER_BAR * SLOT_W}
                  y1={yOf(root) + ROW_H / 2}
                  y2={yOf(root) + ROW_H / 2}
                  stroke={ROLL_PALETTE.chordLane}
                  strokeWidth={1}
                  opacity={0.5}
                />
              </g>
            );
          })}

          {/* Slot columns (grid) - one per eighth slot. */}
          {Array.from({ length: cols }, (_, slot) => (
            <line
              key={`col-${slot}`}
              className="etu-roll-col"
              data-kind="column"
              x1={slot * SLOT_W}
              x2={slot * SLOT_W}
              y1={0}
              y2={height}
              stroke={ROLL_PALETTE.grid}
              strokeWidth={0.5}
              opacity={0.35}
            />
          ))}

          {/* Bar lines: solid separators (non-color cue). */}
          {Array.from({ length: etude.bars + 1 }, (_, bar) => (
            <line
              key={`barline-${bar}`}
              className="etu-roll-barline"
              data-kind="barline"
              x1={bar * SLOTS_PER_BAR * SLOT_W}
              x2={bar * SLOTS_PER_BAR * SLOT_W}
              y1={0}
              y2={height}
              stroke={ROLL_PALETTE.barline}
              strokeWidth={1}
            />
          ))}

          {/* Active bar highlight (plain prop, no subscription). */}
          {activeBar !== null && activeBar >= 0 && activeBar < etude.bars && (
            <rect
              className="etu-roll-active-bar"
              data-kind="active-bar"
              x={activeBar * SLOTS_PER_BAR * SLOT_W}
              y={0}
              width={SLOTS_PER_BAR * SLOT_W}
              height={height}
              fill={ROLL_PALETTE.activeBar}
              opacity={0.08}
            />
          )}

          {/* Melody notes. */}
          {etude.melody.map((n, i) => {
            const fill = n.syncopated
              ? ROLL_PALETTE.syncopated
              : ROLL_PALETTE.melody;
            const x = n.slot * SLOT_W + 0.5;
            const w = n.durationSlots * SLOT_W - 1;
            const y = yOf(n.midi + transposeShift) + 0.5;
            const h = ROW_H - 1;
            return (
              <g key={`note-${i}`} data-kind="note-group">
                <rect
                  data-kind="note"
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke={n.strongBeat ? ROLL_PALETTE.strongOutline : "none"}
                  strokeWidth={n.strongBeat ? 1 : 0}
                />
                {n.syncopated && (
                  <line
                    data-kind="sync-edge"
                    x1={x}
                    x2={x + w}
                    y1={y}
                    y2={y}
                    stroke={ROLL_PALETTE.strongOutline}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="sr-only">{melodySummary(etude)}</p>
    </div>
  );
}
