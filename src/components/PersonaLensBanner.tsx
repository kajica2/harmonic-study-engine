import React from "react";
import {
  curatedLensIds,
  hasBehavioralLens,
  lensForPersona,
} from "../lib/personaLens";
import { Sparkles } from "lucide-react";

/**
 * PersonaLensBanner — surfaces the curated behavioral prompt for
 * a persona with a behavioral lens.
 *
 * Renders nothing for the 14 visual-only personas (Kandinsky, Eno,
 * etc). Renders a small accent-stripped banner for Bach / Coltrane
 * / Miles with the prompt text below the existing persona cards.
 *
 * The banner doesn't replace the visual theme — it sits alongside
 * it. The persona is still driving the canvas gradient / synesthesia
 * palette; the banner adds the behavioral layer on top.
 */

interface PersonaLensBannerProps {
  personaId: string | undefined;
  /** Optional in-bar step prompt (e.g. parallel-motion warning). */
  stepPrompt?: string;
}

export const PersonaLensBanner: React.FC<PersonaLensBannerProps> = ({
  personaId,
  stepPrompt,
}) => {
  if (!hasBehavioralLens(personaId)) return null;

  const lens = lensForPersona(personaId);
  const personaName =
    personaId === "bach"
      ? "Bach"
      : personaId === "coltrane"
        ? "Coltrane"
        : personaId === "miles"
          ? "Miles"
          : (personaId ?? "");

  return (
    <div
      className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-brand-muted)] bg-[color:var(--color-brand)]/5 px-3 py-2 flex items-start gap-3"
      role="note"
      aria-label={`${personaName} behavioral lens active`}
    >
      <Sparkles
        size={14}
        className="text-[color:var(--color-brand-strong)] flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-widest font-mono text-[color:var(--color-brand-strong)] font-semibold">
            {personaName} lens
          </span>
          <span className="text-[10px] font-mono text-neutral-500 italic">
            (behavioral — adds to the visual theme)
          </span>
        </div>
        <p className="text-sm text-neutral-200 mt-0.5 leading-snug">
          {stepPrompt ?? lens.prompt}
        </p>
      </div>
    </div>
  );
};

/** Exported for the lens badges on the persona cards. */
export function isLensedPersona(personaId: string | undefined): boolean {
  return hasBehavioralLens(personaId);
}

/** Exported for the persona card list. */
export function lensIds(): string[] {
  return curatedLensIds();
}
