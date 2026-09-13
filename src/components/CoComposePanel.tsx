/**
 * src/components/CoComposePanel.tsx — "what if?" reharmonization
 * suggestion. Calls coCompose.proposeAlternative and renders the
 * alternative chord + the technique explanation + an Accept button.
 *
 * MVP: Accept is a UI stub (writes to feedbackHistory but doesn't
 * yet mutate the active path). v1 wires Accept to applyAlternative.
 */

import React from "react";
import { Sparkles, Check } from "lucide-react";
import { proposeAlternative, type AlternativeChord } from "../lib/coCompose";
import { midiToName } from "../lib/theory";

interface CoComposePanelProps {
  pathId: string;
  barIndex: number;
  seed: number;
  onAccept?: (alternative: AlternativeChord) => void;
}

function formatChord(alt: AlternativeChord): string {
  if (!alt.alternative) return "(no suggestion)";
  const tones = alt.alternative.rootName;
  const family = alt.alternative.family;
  return `${tones}${family === "minor" ? "m" : ""} (${family})`;
}

export const CoComposePanel: React.FC<CoComposePanelProps> = ({
  pathId,
  barIndex,
  seed,
  onAccept,
}) => {
  const alt = proposeAlternative({ pathId, barIndex, seed });

  return (
    <section
      role="region"
      aria-label="Co-composition suggestion"
      className="rounded-lg border border-purple-700/50 bg-purple-950/20 p-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-purple-300" aria-hidden="true" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-200">
          What if? · {alt.technique.replace(/_/g, " ")}
        </span>
      </div>
      <div className="text-[12px] font-mono text-purple-100">
        bar {barIndex + 1}: <span className="text-neutral-300">{midiToName(60)}</span> →{" "}
        <span className="text-purple-200 font-semibold">{formatChord(alt)}</span>
      </div>
      <p className="text-[11px] text-neutral-300 leading-snug">{alt.explanation}</p>
      {alt.alternative && onAccept && (
        <button
          type="button"
          onClick={() => onAccept(alt)}
          className="self-start flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-purple-600/70 bg-purple-900/40 hover:bg-purple-900/60 text-purple-100"
        >
          <Check size={11} aria-hidden="true" />
          Accept
        </button>
      )}
    </section>
  );
};
