/**
 * src/components/MelodyToolbar.tsx — Suggest / Regenerate / Pin / Undo.
 *
 * MVP: Suggest generates a chord-tone-targeted melody for the active
 * bar via melodyMarkov.suggestMelody. Regenerate draws a new seed.
 * Pin is a no-op flag (v1 will write through useSessionStore).
 */

import React, { useState } from "react";
import { Sparkles, RefreshCw, Pin, Undo2 } from "lucide-react";

interface MelodyToolbarProps {
  onSuggest: () => void;
  onRegenerate: () => void;
  onPin?: () => void;
  onUndo?: () => void;
  /** When true, Suggest/Regenerate are no-ops. */
  disabled?: boolean;
}

export const MelodyToolbar: React.FC<MelodyToolbarProps> = ({
  onSuggest,
  onRegenerate,
  onPin,
  onUndo,
  disabled,
}) => {
  const [pinned, setPinned] = useState(false);

  function handlePin() {
    setPinned((p) => !p);
    onPin?.();
  }

  return (
    <div role="toolbar" aria-label="Melody tools" className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSuggest}
        disabled={disabled}
        title="Suggest a melody for the active bar (genre-neutral Markov chain)"
        aria-label="Suggest melody"
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-purple-800/60 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles size={11} aria-hidden="true" />
        Suggest
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={disabled}
        title="Generate a different melody for the same bar"
        aria-label="Regenerate melody"
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={11} aria-hidden="true" />
        Regenerate
      </button>
      <button
        type="button"
        onClick={handlePin}
        disabled={disabled}
        aria-pressed={pinned}
        title="Pin this bar's melody (Undo restores the prior suggestion)"
        aria-label={pinned ? "Unpin melody" : "Pin melody"}
        className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
          pinned
            ? "border-amber-700/70 bg-amber-900/40 text-amber-100"
            : "border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300"
        }`}
      >
        <Pin size={11} aria-hidden="true" />
        {pinned ? "Pinned" : "Pin"}
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={disabled || !onUndo}
        title="Undo last melody change"
        aria-label="Undo melody"
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Undo2 size={11} aria-hidden="true" />
        Undo
      </button>
    </div>
  );
};
