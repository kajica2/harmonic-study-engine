/**
 * src/components/MelodyLane.tsx — single horizontal lane showing one
 * pitch per beat. Reads/writes through useSessionStore.melodyByStep.
 *
 * Phase 2 (composition MVP): click a cell to nudge the pitch up/down
 * by a semitone; double-click to delete the note. Drag-to-edit is
 * in v1.
 */

import React from "react";
import { midiToName, NOTE_NAMES_FLAT } from "../lib/theory";

interface MelodyLaneProps {
  /** Active path id (used as the melodyByStep key prefix). */
  pathId: string;
  /** Active bar index. */
  barIndex: number;
  /** Steps per bar (typically 4 for 4/4). */
  stepsPerBar: number;
  /** MIDI pitch array; renders one cell per note. */
  melody: number[];
  /** Optional counter-line for parallel rendering. */
  counterMelody?: number[];
  /** Edit callback — receives the new array + the cell index. */
  onChange?: (next: number[], cellIndex: number) => void;
  /** Disabled state (e.g. when no path is loaded). */
  disabled?: boolean;
}

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function labelFor(midi: number | null): string {
  if (midi == null || Number.isNaN(midi)) return "—";
  const pc = ((midi % 12) + 12) % 12;
  const sharp = `${NOTE_NAMES_SHARP[pc]}${Math.floor(midi / 12) - 1}`;
  const flat = `${NOTE_NAMES_FLAT[pc]}${Math.floor(midi / 12) - 1}`;
  return midiToName(midi) === sharp ? sharp : flat;
}

export const MelodyLane: React.FC<MelodyLaneProps> = ({
  melody,
  counterMelody,
  stepsPerBar,
  onChange,
  disabled,
}) => {
  const cells = Array.from({ length: stepsPerBar }, (_, i) => melody[i] ?? null);
  const counterCells = Array.from(
    { length: stepsPerBar },
    (_, i) => counterMelody?.[i] ?? null,
  );

  function handleNudge(idx: number, dir: 1 | -1) {
    if (disabled || !onChange) return;
    const cur = cells[idx] ?? 60;
    const next = [...melody];
    next[idx] = cur + dir;
    onChange(next, idx);
  }

  function handleClear(idx: number) {
    if (disabled || !onChange) return;
    const next = [...melody];
    next[idx] = 60; // reset to middle C; "delete" semantics land in v1
    onChange(next, idx);
  }

  return (
    <div
      role="group"
      aria-label="Melody lane"
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${stepsPerBar}, minmax(0, 1fr))` }}
    >
      {cells.map((note, idx) => (
        <div key={`m-${idx}`} className="flex flex-col items-center">
          {counterCells[idx] != null && (
            <div
              className="text-[8px] font-mono text-neutral-500 opacity-70"
              aria-label={`counter-line beat ${idx + 1}`}
              title="counter-line"
            >
              {labelFor(counterCells[idx])}
            </div>
          )}
          <button
            type="button"
            disabled={disabled || !onChange}
            onClick={() => handleNudge(idx, 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              handleNudge(idx, -1);
            }}
            onDoubleClick={() => handleClear(idx)}
            aria-label={`Melody beat ${idx + 1}, ${note != null ? labelFor(note) : "empty"}`}
            className="w-full rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed px-1 py-1 text-[10px] font-mono leading-tight text-neutral-200"
          >
            {labelFor(note)}
          </button>
        </div>
      ))}
    </div>
  );
};
