/**
 * AuditionControls — the two entry points that READ the live `activeMidis`
 * set inside the step header. Extracted from App so this read stays local
 * to the controls (see SynesthesiaProvider: only canvas, keyboard, and
 * these controls consume the note set; note events never re-render the
 * rest of the tree).
 */

import React from "react";
import { Play, Square } from "lucide-react";
import { audioEngine } from "../lib/audio";
import { midiOut } from "../lib/midiOut";
import {
  useSynesthesiaActive,
  useSynesthesiaSetActive,
} from "./SynesthesiaProvider";

interface AuditionToggleButtonProps {
  /** Midi numbers that "Play" auditions for the current step. */
  chordMidis: number[];
  /** Fired when the user stops the audition (e.g. flags auto-play off). */
  onStopped?: () => void;
}

export const AuditionToggleButton: React.FC<AuditionToggleButtonProps> = ({
  chordMidis,
  onStopped,
}) => {
  const activeMidis = useSynesthesiaActive();
  const setActiveMidis = useSynesthesiaSetActive();

  if (activeMidis.length > 0) {
    return (
      <button
        onClick={() => {
          audioEngine.stopAll();
          midiOut.stopAll();
          setActiveMidis([]);
          onStopped?.();
        }}
        aria-label="Stop chord"
        className="w-11 h-11 flex items-center justify-center rounded-full surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-2)] transition-colors"
      >
        <Square size={18} className="fill-current text-[color:var(--color-brand)]" />
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        audioEngine.playChord(chordMidis);
        midiOut.playChord(chordMidis);
        setActiveMidis(chordMidis);
      }}
      aria-label="Play chord"
      className="w-11 h-11 flex items-center justify-center rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-brand-strong)] active:scale-95 transition-transform"
    >
      <Play size={20} className="fill-current translate-x-[1px]" />
    </button>
  );
};

export const AuditionHint: React.FC = () => {
  const activeMidis = useSynesthesiaActive();
  return (
    <p className="t-small text-[color:var(--color-text-3)] flex-1">
      {activeMidis.length > 0
        ? "Auditioning this chord — click ◂ ▸ to step, or open the editor to tweak the voicing."
        : "Click play to audition this chord. Use ◂ ▸ to step through the path."}
    </p>
  );
};