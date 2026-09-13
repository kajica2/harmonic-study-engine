import React, { useEffect, useState, useRef } from "react";
import { midiOut } from "../lib/midiOut";
import { classifyGuideTone, type GuideToneMatch } from "../lib/guideTones";
import { Music, Mic, Keyboard, X } from "lucide-react";

/**
 * GuideToneFeedback — practice-loop guide-tone feedback.
 *
 * Subscribes to MIDI note-on events from `midiOut` (which fans out
 * incoming messages from any connected MIDI input — EWI, keyboard,
 * etc.) and renders the role the played note plays in the active
 * chord.
 *
 * Visual states:
 *   - "On 3rd ✓" / "On 7th ✓"   (green) — guide tones hit
 *   - "On root" / "On 5th"      (neutral) — chord tone but not a guide
 *   - "On 9th"                  (amber) — color tone, "common tone or resolve"
 *   - "Non-chord tone"          (neutral) — outside the chord
 *   - "Awaiting MIDI input"     (muted) — no input device or no note yet
 *   - 3-button device picker    (when no MIDI input is detected)
 *
 * The most recent match decays after 1.2s so the chip doesn't
 * freeze on one note — important for sight-reading practice
 * where the player hits several notes per second.
 */

const DECAY_MS = 1200;

interface GuideToneFeedbackProps {
  /** Chord notes from the active path (typically `step.notes`). */
  chordNotes: number[];
}

export const GuideToneFeedback: React.FC<GuideToneFeedbackProps> = ({
  chordNotes,
}) => {
  const [latest, setLatest] = useState<GuideToneMatch | null>(null);
  const [inputCount, setInputCount] = useState<number>(0);
  const decayTimer = useRef<number | null>(null);

  useEffect(() => {
    // Subscribe to MIDI input. Subscribe immediately (not lazily)
    // so a device that connects AFTER the component mounts still
    // fires through us — midiOut.init() can be called later from
    // the device picker.
    const offOn = midiOut.onNoteOn((midi) => {
      const match = classifyGuideTone(midi, chordNotes);
      setLatest(match);
      if (decayTimer.current !== null) {
        window.clearTimeout(decayTimer.current);
      }
      decayTimer.current = window.setTimeout(() => {
        setLatest(null);
      }, DECAY_MS);
    });
    const offOff = midiOut.onNoteOff(() => {
      // Note-off doesn't change the displayed match (the most
      // recent note-on still dominates); but for visual symmetry
      // we keep the match shown for DECAY_MS. The timer above
      // handles the fade.
      // No-op here.
    });
    // Poll input count periodically so the device picker shows /
    // hides correctly when the user plugs or unplugs a device.
    const poll = window.setInterval(() => {
      setInputCount(midiOut.getInputCount());
    }, 1500);
    // Initial check (in case midiOut.init() ran before this mounted)
    setInputCount(midiOut.getInputCount());
    return () => {
      offOn();
      offOff();
      window.clearInterval(poll);
      if (decayTimer.current !== null) {
        window.clearTimeout(decayTimer.current);
      }
    };
  }, [chordNotes]);

  const requestMidi = async () => {
    await midiOut.init();
    setInputCount(midiOut.getInputCount());
  };

  // Render: device picker when no input, otherwise the latest-match chip.
  if (inputCount === 0) {
    return (
      <div
        className="flex items-center gap-2 text-xs"
        role="region"
        aria-label="MIDI input device"
      >
        <span className="text-[10px] t-mono uppercase tracking-wider text-neutral-500">
          Input
        </span>
        <button
          onClick={requestMidi}
          title="Connect a MIDI device (EWI, MIDI keyboard, etc.)"
          aria-label="Connect MIDI device"
          className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs surface-1 border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 hover:border-[color:var(--color-brand-muted)]"
        >
          <Mic size={12} aria-hidden /> Connect MIDI
        </button>
        <button
          title="Use the computer keyboard (mapped to piano keys)"
          aria-label="Use computer keyboard"
          className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs surface-1 border border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-100 hover:border-[color:var(--color-brand-muted)]"
        >
          <Keyboard size={12} aria-hidden /> Computer keyboard
        </button>
        <button
          title="Practice without input (just listen)"
          aria-label="Practice without input"
          className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] text-xs surface-1 border border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-100 hover:border-[color:var(--color-brand-muted)]"
        >
          <Music size={12} aria-hidden /> Practice without input
        </button>
      </div>
    );
  }

  if (!latest) {
    return (
      <div
        className="flex items-center gap-2 text-xs"
        role="status"
        aria-live="polite"
      >
        <span className="text-[10px] t-mono uppercase tracking-wider text-neutral-500">
          Input
        </span>
        <span className="text-[11px] text-neutral-400">
          {inputCount} MIDI device{inputCount === 1 ? "" : "s"} connected —
          play a note
        </span>
      </div>
    );
  }

  const isGuideTone = latest.isGuideTone;
  const isOff = !latest.inChord;
  const isNinth = latest.role === "ninth";
  const colorClass = isOff
    ? "border-neutral-700 text-neutral-400"
    : isGuideTone
      ? "border-emerald-600 text-emerald-300 bg-emerald-900/20"
      : isNinth
        ? "border-amber-600 text-amber-300 bg-amber-900/20"
        : "border-neutral-600 text-neutral-200";

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-md)] border ${colorClass}`}
      role="status"
      aria-live="polite"
      data-testid="guide-tone-feedback"
    >
      <Music size={12} aria-hidden />
      <span className="text-xs font-mono">
        {isGuideTone ? "✓ " : isOff ? "" : "• "}
        {latest.label}
      </span>
      {isNinth && (
        <span className="text-[10px] text-amber-300/80">
          (common tone or resolve)
        </span>
      )}
    </div>
  );
};
