/**
 * src/components/CoComposePanel.tsx — "what if?" reharmonization
 * suggestion. Calls coCompose.proposeAlternative and renders the
 * alternative chord + the technique explanation + an Accept button.
 *
 * MVP: Accept is a UI stub (writes to feedbackHistory but doesn't
 * yet mutate the active path). v1 wires Accept to applyAlternative.
 */

import React, { memo } from "react";
import { Sparkles, Check } from "lucide-react";
import { proposeAlternative, PERSONA_TECHNIQUE_BIAS, TECHNIQUES, type AlternativeChord } from "../lib/coCompose";
import { midiToName } from "../lib/theory";

interface CoComposePanelProps {
  pathId: string;
  barIndex: number;
  seed: number;
  /** Optional: personaId biases the technique picker toward the persona's
   *  harmonic influence. Wired from App.tsx via the active persona. */
  personaId?: string;
  onAccept?: (alternative: AlternativeChord) => void;
}

function formatChord(alt: AlternativeChord): string {
  if (!alt.alternative) return "(no suggestion)";
  const tones = alt.alternative.rootName;
  const family = alt.alternative.family;
  return `${tones}${family === "minor" ? "m" : ""} (${family})`;
}

export const CoComposePanel = memo(function CoComposePanel({
  pathId,
  barIndex,
  seed,
  personaId,
  onAccept,
}: CoComposePanelProps) {
  const alt = proposeAlternative({ pathId, barIndex, seed, personaId });

  // Persona-biased technique weights (displayed under "What if?")
  const biasMap = personaId ? PERSONA_TECHNIQUE_BIAS[personaId] || {} : {};
  const preferred = TECHNIQUES.filter((t) => (biasMap as Record<string, number>)[t] && (biasMap as Record<string, number>)[t]! > 1.0);

  return (
    <section
      role="region"
      aria-label="Co-composition suggestion"
      className="rounded-lg border border-[color:var(--color-brand)]/50 bg-[color:var(--color-brand-muted)]/20 p-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles size={14} className="text-[color:var(--color-brand-strong)]" aria-hidden="true" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-brand-strong)]">
          What if? · {alt.technique.replace(/_/g, " ")}
        </span>
        {preferred.length > 0 && personaId && (
          <span className="text-[9px] font-mono text-[color:var(--color-brand-strong)]/80 bg-[color:var(--color-brand-muted)]/30 px-1 rounded">
            persona: {preferred.map(t => t.replace(/_/g, " ")).join(", ")}
          </span>
        )}
      </div>
      <div className="text-[12px] font-mono text-[color:var(--color-brand-strong)]">
        bar {barIndex + 1}: <span className="text-neutral-300">{midiToName(60)}</span> →{" "}
        <span className="text-[color:var(--color-brand-strong)] font-semibold">{formatChord(alt)}</span>
      </div>
      <p className="text-[11px] text-neutral-300 leading-snug">{alt.explanation}</p>
      {alt.alternative && onAccept && (
        <button
          type="button"
          onClick={() => onAccept(alt)}
          className="self-start flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-[color:var(--color-brand)]/70 bg-[color:var(--color-brand-muted)]/40 hover:bg-[color:var(--color-brand-muted)]/60 text-[color:var(--color-brand-strong)] active:scale-95 transition-all"
        >
          <Check size={11} aria-hidden="true" />
          Accept
        </button>
      )}
    </section>
  );
});
