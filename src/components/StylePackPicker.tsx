/**
 * src/components/StylePackPicker.tsx — drawer of cards, one per
 * src/data/styles/*.json. On persona change, auto-selects that
 * persona's preferredStylePackId with a 'Suggested by persona' badge.
 */

import React from "react";
import { allStylePacks, type StylePack, type StylePackId } from "../lib/stylePack";
import { PERSONAS } from "../lib/personas";

interface StylePackPickerProps {
  /** Active style pack id (null = no pack selected). */
  activeId: StylePackId | null;
  /** Active persona id (used to surface the 'Suggested by persona' badge). */
  activePersonaId: string | null;
  onPick: (id: StylePackId) => void;
  /** Optional className. */
  className?: string;
}

export const StylePackPicker: React.FC<StylePackPickerProps> = ({
  activeId,
  activePersonaId,
  onPick,
  className,
}) => {
  const packs: StylePack[] = allStylePacks();
  const persona = activePersonaId
    ? PERSONAS.find((p) => p.id === activePersonaId)
    : undefined;
  const suggested = persona?.preferredStylePackId as StylePackId | undefined;

  return (
    <section
      role="region"
      aria-label="Style pack"
      className={`rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex flex-col gap-2 ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          Style pack
        </span>
        {suggested && persona && suggested !== activeId && (
          <span className="text-[10px] font-mono text-neutral-500">
            Suggested: {persona.name} → {suggested}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Style packs">
        {packs.map((pack) => {
          const isActive = activeId === pack.id;
          // Suggested badge only fires when the suggested pack is NOT
          // already active — once you've accepted the suggestion, the
          // active card already conveys "you picked this".
          const isSuggested = !isActive && suggested === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              data-suggested={isSuggested ? "true" : "false"}
              onClick={() => onPick(pack.id)}
              title={pack.description}
              className={`text-left p-2 rounded border transition-colors ${
                isActive
                  ? "border-purple-600/70 bg-purple-900/40 text-purple-100"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px]">{pack.name}</span>
                {isSuggested && (
                  <span className="text-[9px] font-mono text-amber-300 uppercase tracking-wider">
                    suggested
                  </span>
                )}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                {pack.description}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
