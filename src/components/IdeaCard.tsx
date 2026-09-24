/**
 * src/components/IdeaCard.tsx - PRD-001 Phase 5 (REQ-EXP-20/21/22).
 *
 * One idea card: label + technique chip + description + rationale
 * (concept link inline when conceptId resolves) + the P0 action row
 * [Hear][Send to Compose][Send to Etude][Save]. Progression-less cards
 * disable Send-to-Compose with an honest title (only chord/
 * progression payloads transplant literally - D97). The Hear button
 * mirrors the preview singleton state (data-preview) and becomes Stop
 * while playing (the e2e state-machine leg).
 */

import React from "react";
import type { IdeaCard as IdeaCardData } from "../../engine/explore/types";
import type { PreviewState } from "../lib/composePreview";

export interface IdeaCardProps {
  card: IdeaCardData;
  hearState: PreviewState;
  onHear: (card: IdeaCardData) => void;
  /** Stop the running audition (the button becomes Stop while playing). */
  onStop: () => void;
  /** Progression-bearing only (else disabled + title). */
  onSendToCompose: (card: IdeaCardData) => void;
  onSendToEtude: (card: IdeaCardData) => void;
  onSave: (card: IdeaCardData) => void;
  /** Resolved via getConcept (null when the card carries none). */
  conceptTitle: string | null;
  onOpenConcept: (conceptId: string) => void;
}

const actionClass =
  "px-2.5 py-1 rounded border border-[color:var(--color-border)] " +
  "text-[11px] font-medium text-neutral-300 hover:text-white " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const IdeaCard: React.FC<IdeaCardProps> = ({
  card,
  hearState,
  onHear,
  onStop,
  onSendToCompose,
  onSendToEtude,
  onSave,
  conceptTitle,
  onOpenConcept,
}) => {
  const canSendToCompose =
    card.progression !== null && card.progression.length > 0;
  const playing = hearState === "playing";
  const hearLabel =
    hearState === "rendering" ? "Rendering..." : playing ? "Stop" : "Hear";

  return (
    <article
      data-testid={`idea-card-${card.id}`}
      className="surface-1 border border-[color:var(--color-border)] rounded-2xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-[color:var(--color-text-1)]">
          {card.label}
        </h3>
        <span
          data-testid={`idea-technique-${card.id}`}
          className="text-[10px] t-mono px-2 py-0.5 rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text-3)]"
        >
          {card.technique}
        </span>
      </div>
      <p className="text-xs text-[color:var(--color-text-2)]">
        {card.description}
      </p>
      <p className="text-xs italic text-[color:var(--color-text-3)]">
        {card.rationale}
        {card.conceptId !== null && conceptTitle !== null && (
          <>
            {" "}
            <button
              type="button"
              data-testid={`idea-concept-${card.id}`}
              aria-label={`Open concept ${conceptTitle}`}
              onClick={() => {
                if (card.conceptId !== null) onOpenConcept(card.conceptId);
              }}
              className="not-italic underline text-[color:var(--color-brand-strong)] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
            >
              {conceptTitle}
            </button>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2 mt-1">
        <button
          type="button"
          data-testid={`hear-${card.id}`}
          data-preview={hearState}
          onClick={() => {
            if (playing) onStop();
            else onHear(card);
          }}
          className={actionClass}
        >
          {hearLabel}
        </button>
        <button
          type="button"
          data-testid={`send-compose-${card.id}`}
          disabled={!canSendToCompose}
          title={
            canSendToCompose
              ? "Send this progression to the Compose chart grid"
              : "Only progression cards transplant to the chart grid"
          }
          onClick={() => onSendToCompose(card)}
          className={actionClass}
        >
          Send to Compose
        </button>
        <button
          type="button"
          data-testid={`send-etude-${card.id}`}
          title="Practice in this key (carries key and bar count, not literal chords)"
          onClick={() => onSendToEtude(card)}
          className={actionClass}
        >
          Send to Etude
        </button>
        <button
          type="button"
          data-testid={`save-${card.id}`}
          onClick={() => onSave(card)}
          className={actionClass}
        >
          Save
        </button>
      </div>
    </article>
  );
};
