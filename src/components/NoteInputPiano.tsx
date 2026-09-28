/**
 * src/components/NoteInputPiano.tsx - PRD-001 Phase 7 S4 (REQ-IO-4/6,
 * D140): the touch-friendly INPUT piano. A NEW purpose-built surface -
 * the synesthesia PianoKeyboard stays a byte-identical DISPLAY +
 * audition surface whose clicks deliberately never dispatch "midin"
 * (one surface, one purpose).
 *
 * REQ-IO-6 TOUCH LAW (all pinned in NoteInputPiano.test.tsx):
 *   - POINTER EVENTS ONLY (pointerdown/up/cancel + lostpointercapture)
 *     - no mouse-plus-touch handler duplication (the display piano's
 *     separate onMouse pair + onTouch pair are NOT repeated here);
 *   - `touch-action: none` on the key strip (the shipped touch-none
 *     class doctrine);
 *   - setPointerCapture on down so a slide-off still gets its up (no
 *     stuck notes); NO glissando - a drag-across does not retrigger
 *     (documented decision: gliss is a display effect, not a
 *     practice input);
 *   - white keys >= 44px wide x 56px tall (h-24 = 96px, min-w 44px);
 *     on narrow viewports the strip SCROLLS HORIZONTALLY
 *     (overflow-x-auto) - shrinking below 44px is BANNED;
 *   - NO hover-only affordance: pressed state = data-note-down="1"
 *     attr + fill change using EXISTING tokens (idle white ->
 *     surface-2 + brand ring). Okabe-Ito stays reserved for detection
 *     verdicts - input feedback never conflates with scoring;
 *   - note-name label + key-letter chip ALWAYS visible.
 *
 * A11y: each key is a focusable role="button" with
 * aria-label="Play C4, keyboard key A"; Space/Enter plays and
 * keyup/blur releases (the shipped keyAccess LAW from
 * PianoKeyboard.tsx:105-122 - the law is reused, not the file); the
 * strip is role="group" aria-label="Note input piano".
 *
 * The component owns NO audio and NO bus: down AND up arrive at the
 * parent's onNote (App callback / wizard callback) - the parent
 * decides what a press means (D140 mounting contract).
 */

import React, { useCallback, useRef, useState } from "react";
import { NOTE_NAMES } from "../lib/theory";

export interface NoteInputPianoProps {
  /** Root MIDI of the span ((rootOctave + 1) * 12). */
  rootMidi: number;
  /** Span is root..root + octaves*12 (inclusive endpoints).
   *  Default 2 (study view); 1 (wizard compact). */
  octaves?: number;
  /** midi -> ASCII letter chip ("A".."K") on the first 13 keys. */
  keyLabels?: Record<number, string>;
  /** Down AND up arrive here; the PARENT decides. */
  onNote: (midi: number, down: boolean) => void;
  /** Renders the flanking "-"/"+" buttons + root label when set. */
  onOctaveShift?: (delta: 1 | -1) => void;
  /** Wizard variant: tighter label row (same 44x56 law). */
  compact?: boolean;
}

const WHITE_KEY_MIN_PX = 44; // WCAG 2.5.5 target floor (REQ-IO-6)

function isBlackMidi(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

function noteLabel(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export const NoteInputPiano: React.FC<NoteInputPianoProps> = ({
  rootMidi,
  octaves = 2,
  keyLabels,
  onNote,
  onOctaveShift,
  compact = false,
}) => {
  const span = Math.max(1, Math.min(4, Math.trunc(octaves))) * 12;
  const midis: number[] = [];
  for (let m = rootMidi; m <= rootMidi + span; m++) midis.push(m);
  const whites = midis.filter((m) => !isBlackMidi(m));
  const whiteIndex = new Map(whites.map((m, i) => [m, i]));
  const whitePct = 100 / whites.length;

  // Pressed keys (pointer AND keyboard share this state -> the
  // data-note-down contract holds for every input path).
  const [downSet, setDownSet] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const downRef = useRef<Set<number>>(new Set());
  // Keyboard-access holds (code-free: keyed by midi, cleared on blur).
  const kbHeldRef = useRef<Set<number>>(new Set());

  const press = useCallback(
    (midi: number) => {
      if (downRef.current.has(midi)) return; // no retrigger (no gliss)
      downRef.current.add(midi);
      setDownSet(new Set(downRef.current));
      onNote(midi, true);
    },
    [onNote],
  );

  const lift = useCallback(
    (midi: number) => {
      if (!downRef.current.has(midi)) return; // only stop notes we started
      downRef.current.delete(midi);
      setDownSet(new Set(downRef.current));
      onNote(midi, false);
    },
    [onNote],
  );

  const onPointerDown = (midi: number) => (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    // Capture so a slide-off still delivers its own pointerup (no
    // stuck notes); drag-across never re-enters another key's down.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press(midi);
  };
  const onPointerUp = (midi: number) => () => lift(midi);
  const onPointerCancel = (midi: number) => () => lift(midi);
  const onLostCapture = (midi: number) => () => lift(midi);

  const keyAccess = (midi: number) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": keyLabels?.[midi] !== undefined
      ? `Play ${noteLabel(midi)}, keyboard key ${keyLabels[midi]}`
      : `Play ${noteLabel(midi)}`,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        // MED-002: a modified Space/Enter is browser chrome (tab
        // switch, new window) - never steal it into a press. Release
        // paths (keyup/blur/capture) stay UNGUARDED on purpose:
        // stuck-note prevention must never be gated.
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        if (!kbHeldRef.current.has(midi)) {
          kbHeldRef.current.add(midi);
          press(midi);
        }
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        kbHeldRef.current.delete(midi);
        lift(midi);
      }
    },
    onBlur: () => {
      kbHeldRef.current.delete(midi);
      lift(midi); // the shipped keyAccess blur law (PianoKeyboard:121)
    },
  });

  const keyEl = (midi: number, black: boolean, style: React.CSSProperties) => {
    const isDown = downSet.has(midi);
    const label = keyLabels?.[midi];
    return (
      <div
        key={midi}
        data-testid={`note-key-${midi}`}
        data-note={midi}
        data-note-down={isDown ? "1" : undefined}
        data-key-label={label}
        {...keyAccess(midi)}
        onPointerDown={onPointerDown(midi)}
        onPointerUp={onPointerUp(midi)}
        onPointerCancel={onPointerCancel(midi)}
        onLostPointerCapture={onLostCapture(midi)}
        className={`select-none cursor-pointer rounded-b-md border transition-colors duration-75 focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-strong)] focus-visible:z-20 ${
          black
            ? `absolute top-0 z-10 border-x border-b border-black ${isDown ? "surface-2" : "bg-gray-900"}`
            : `relative flex-1 border-r border-gray-300 ${isDown ? "surface-2" : "bg-white"}`
        } ${isDown ? "ring-2 ring-[color:var(--color-brand)]" : ""}`}
        style={style}
      >
        <div
          className={`absolute bottom-1 w-full text-center font-mono font-bold ${
            black ? "text-[9px] text-gray-300" : "text-[10px] text-gray-500"
          }`}
          aria-hidden="true"
        >
          {label !== undefined && (
            <span className="block leading-none font-bold text-neutral-700">{label}</span>
          )}
          {noteLabel(midi)}
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex items-stretch gap-1.5"
      data-testid="note-input-piano"
      role="group"
      aria-label="Note input piano"
    >
      {onOctaveShift && (
        <button
          type="button"
          data-testid="noteinput-octave-down"
          aria-label="Shift keyboard octave down"
          onClick={() => onOctaveShift(-1)}
          className="px-2 self-center rounded-[var(--radius-sm)] text-sm t-mono border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 surface-1 transition-colors"
        >
          -
        </button>
      )}
      <div className="flex-1 min-w-0">
        {!compact && onOctaveShift && (
          <div
            data-testid="noteinput-root-label"
            className="text-[10px] t-mono text-neutral-400 mb-1"
          >
            Root {noteLabel(rootMidi)}
          </div>
        )}
        {/* Horizontal scroll is the escape valve when the 44px floor
            outgrows the viewport - shrinking is BANNED (REQ-IO-6). */}
        <div className="w-full overflow-x-auto touch-none">
          <div
            className="relative h-24 flex"
            style={{ minWidth: whites.length * WHITE_KEY_MIN_PX }}
          >
            {whites.map((m) =>
              keyEl(m, false, { minWidth: WHITE_KEY_MIN_PX }),
            )}
            {midis
              .filter((m) => isBlackMidi(m))
              .map((m) => {
                // A black note sits between white i-1 and i (the
                // white BEFORE it carries the fractional index).
                const prevWhite = whiteIndex.get(m - 1) ?? 0;
                return keyEl(m, true, {
                  left: `${(prevWhite + 1) * whitePct}%`,
                  width: `${whitePct * 0.6}%`,
                  height: "60%",
                  marginLeft: `-${whitePct * 0.3}%`,
                });
              })}
          </div>
        </div>
      </div>
      {onOctaveShift && (
        <button
          type="button"
          data-testid="noteinput-octave-up"
          aria-label="Shift keyboard octave up"
          onClick={() => onOctaveShift(1)}
          className="px-2 self-center rounded-[var(--radius-sm)] text-sm t-mono border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 surface-1 transition-colors"
        >
          +
        </button>
      )}
    </div>
  );
};
