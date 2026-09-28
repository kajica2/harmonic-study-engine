/**
 * src/lib/ideaHear.ts - PRD-001 Phase 8 S1 (D148).
 *
 * Idea -> the exploreHear card shape (the shape precedent is shipped:
 * IdeaBar.tsx:143-155 builds one inline) + the play/stop delegates.
 * PURE builder, node-tested; the AUDIO flows through the EXISTING
 * cardToHearInput + hearIdeaCard + composePreviewPlayer singleton
 * (the exploreHear law verbatim: "no new AudioContext, no new
 * transport, no audioEngine coupling" - ADR-020).
 *
 * The honesty carve (REQ-IO-52, 3 of 5 kinds play): scale -> NOT
 * played (voicing + octave + register choices /play must not invent
 * silently - PHASE-1-02); seed -> NOT played (a GENERATION TOKEN,
 * not music). ideaToPlayCard returns null for both; the surface maps
 * null -> empty-with-summary + CTA. Technique token "original" is
 * the no-claim literal (D99 law: a token is a claim a predicate
 * fired - a carrier card claims nothing).
 */

import type { Idea } from "../../engine/core/idea";
import {
  cardId,
  type IdeaCard as IdeaCardData,
} from "../../engine/explore/types";
import { CARD_LABEL_MAX } from "../../engine/explore/cards";
import type { KeyCandidate } from "../../engine/compose/types";
import { hearIdeaCard } from "./exploreHear";
import { composePreviewPlayer } from "./composePreview";

/** C-major spelling default - /play has no session context to
 *  invent one from (the shipped ExploreSurface DEFAULT_KEY precedent). */
const PLAY_KEY: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 0 };

function carrier(
  id: string,
  op: IdeaCardData["op"],
  label: string,
  progression: readonly string[] | null,
  chord: string | null,
  melody: readonly number[] | null,
  sourceSeedRaw: string,
): IdeaCardData {
  return {
    version: 1,
    id,
    op,
    label: label.slice(0, CARD_LABEL_MAX),
    description: "A shared idea, played through the shipped audition voicing.",
    rationale:
      "The /play surface adds no harmony of its own - the card is a carrier for the audition machinery.",
    conceptId: null,
    technique: "original",
    progression,
    chord,
    melody,
    sourceSeedRaw,
  };
}

/** Idea -> the hearable card shape. null = NOT playable (scale/seed
 *  carve, or an idea whose payload slot is empty). */
export function ideaToPlayCard(idea: Idea): IdeaCardData | null {
  switch (idea.kind) {
    case "chord":
      if (idea.chord === null) return null;
      return carrier(
        cardId(idea.chord, "substitute", 0),
        "substitute",
        idea.chord,
        [idea.chord],
        idea.chord,
        null,
        idea.chord,
      );
    case "progression":
      if (idea.progression === null || idea.progression.length === 0) {
        return null;
      }
      return carrier(
        cardId(idea.progression.join(" "), "substitute", 0),
        "substitute",
        idea.progression.join(" "),
        [...idea.progression],
        null,
        null,
        idea.progression.join(" "),
      );
    case "melody":
      if (idea.melody === null || idea.melody.length === 0) return null;
      return carrier(
        cardId(idea.melody.join(","), "vary", 0),
        "vary",
        `melody (${idea.melody.length} notes)`,
        null,
        null,
        [...idea.melody],
        idea.melody.join(","),
      );
    case "scale":
    case "seed":
      return null;
  }
}

/** Render + play through the shipped singleton (call from a CLICK -
 *  the gesture autoplay requires). false = not playable kind (the
 *  surface keeps the honest CTA state; nothing is touched). */
export function playIdea(idea: Idea): boolean {
  const card = ideaToPlayCard(idea);
  if (card === null) return false;
  void hearIdeaCard(card, PLAY_KEY);
  return true;
}

/** Delegate to the singleton's own law (unmount stops playback). */
export function stopIdea(): void {
  composePreviewPlayer.stop();
}
