/**
 * engine/explore/cards.ts - PRD-001 Phase 5 (REQ-EXP-20/21/22, D97/D97b).
 *
 * The card envelope + the two crossover pure helpers:
 *
 * - progressionToChartText (D97): progression -> chart TEXT -> the S4
 *   parser path (dogfood, zero adapter). One entry = one bar; rests as
 *   "-"; embedded slashes are slash-bass (the chart's whole-token-
 *   first rule preserves them). Key emits the {key:} directive (the
 *   spelling directive the parser honors).
 * - cardToEtudeConstraints (D97b): constraints-CARRY (key/mode/bars/
 *   seed + the base's advanced constraints), NEVER a literal chord-
 *   symbol transplant (symbol/numeral grammars are disjoint -
 *   TD-EXP-LITERAL). Bars from the card progression length (clamped
 *   4..32) or the melody length (8 slots/bar, min 4); seed is
 *   hash(card.id) - deterministic, not clock.
 * - cardToIdea (D100: nowMs as a parameter, ADR-005): the Save path.
 *   Chord-kind ids replicate ideaFromChord's canonical scheme exactly
 *   (dedup REQ-IDEA-1 holds across both builders - pinned by test).
 *
 * DEVIATION (flagged): the sketch names cardToIdeaArgs; it ships (the
 * payload splitter) AND cardToIdea ships on top (the full builder the
 * D100 clock-as-parameter note requires) - the surface calls
 * cardToIdea directly.
 *
 * Purity: relative imports only, no clock (nowMs is a PARAMETER), no
 * randomness, no console.
 */

import { hashSeed } from "../core/rng";
import { asCanonicalId, makeInstanceId } from "../core/ids";
import { spellTonic } from "../core/spelling";
import type {
  Idea,
  IdeaKind,
  IdeaSource,
} from "../core/idea";
import type { KeyCandidate } from "../compose/types";
import type { EtudeConstraints } from "../etude/types";
import { cardId, isSoundingSymbol } from "./types";
import type { ExploreOp, IdeaCard, TechniqueToken } from "./types";

/** One card's content (ids/version come from the builder). */
export interface CardItem {
  readonly label: string;
  readonly description: string;
  readonly rationale: string;
  readonly conceptId: string | null;
  readonly technique: TechniqueToken;
  readonly progression: readonly string[] | null;
  readonly chord: string | null;
  readonly melody: readonly number[] | null;
}

/** Chip budget (test-pinned on every built card). */
export const CARD_LABEL_MAX = 40;

/** Envelope builder: ids via cardId, version 1, label-length enforced
 *  (RangeError = programmer error, rng.ts precedent). */
export function buildIdeaCards(
  seedRaw: string,
  op: ExploreOp,
  items: readonly CardItem[],
): readonly IdeaCard[] {
  return items.map((item, i) => {
    if (item.label.length > CARD_LABEL_MAX) {
      throw new RangeError(
        `buildIdeaCards: label exceeds ${CARD_LABEL_MAX} chars: "${item.label}"`,
      );
    }
    return {
      version: 1,
      id: cardId(seedRaw, op, i),
      op,
      label: item.label,
      description: item.description,
      rationale: item.rationale,
      conceptId: item.conceptId,
      technique: item.technique,
      progression: item.progression,
      chord: item.chord,
      melody: item.melody,
      sourceSeedRaw: seedRaw,
    };
  });
}

/**
 * D97: progression -> chart text. Emits {key:} when the key is known
 * (user-stated keys are certain, correlation 1 - the directive path);
 * one entry per bar.
 */
export function progressionToChartText(
  progression: readonly string[],
  key: KeyCandidate | null,
): string {
  const body = progression.map((s) => (isSoundingSymbol(s) ? s : "-")).join(" ");
  if (key === null) return body;
  const tonic = spellTonic(key.tonicPc, key.mode, "");
  return `{key: ${tonic} ${key.mode}}\n${body}`;
}

/** Minimal card view the Etude carry needs (IdeaBar reuses it). */
export interface EtudeCarryCard {
  readonly id: string;
  readonly progression: readonly string[] | null;
  readonly melody: readonly number[] | null;
}

function clampBars(n: number): number {
  if (!Number.isFinite(n)) return 8;
  return Math.max(4, Math.min(32, Math.floor(n)));
}

/**
 * D97b: constraints-carry. Key/mode/styleId/difficulty/tempo +
 * advanced harmony/melody/rhythm ride the base; bars + seed come from
 * the card. Always validateEtudeConstraints-passing (test-pinned).
 */
export function cardToEtudeConstraints(
  card: EtudeCarryCard,
  base: EtudeConstraints,
): EtudeConstraints {
  let bars = base.bars;
  if (card.progression !== null && card.progression.length > 0) {
    bars = clampBars(card.progression.length);
  } else if (card.melody !== null && card.melody.length > 0) {
    bars = clampBars(Math.max(4, Math.ceil(card.melody.length / 8)));
  }
  return { ...base, bars, seed: hashSeed(card.id) };
}

/** Payload splitter (the surface feeds builders + nowMs from this). */
export function cardToIdeaArgs(card: IdeaCard): {
  readonly kind: IdeaKind;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: null;
  readonly melody: readonly number[] | null;
  readonly seed: number | null;
} {
  if (card.progression !== null && card.progression.length > 0) {
    return {
      kind: "progression",
      chord: null,
      progression: [...card.progression],
      scale: null,
      melody: null,
      seed: null,
    };
  }
  if (card.chord !== null) {
    return {
      kind: "chord",
      chord: card.chord,
      progression: null,
      scale: null,
      melody: null,
      seed: null,
    };
  }
  if (card.melody !== null && card.melody.length > 0) {
    return {
      kind: "melody",
      chord: null,
      progression: null,
      scale: null,
      melody: [...card.melody],
      seed: null,
    };
  }
  return {
    kind: "seed",
    chord: null,
    progression: null,
    scale: null,
    melody: null,
    seed: hashSeed(card.id),
  };
}

/**
 * Full Idea builder (Save path). Chord-kind canonical ids are
 * byte-identical to ideaFromChord's scheme (source|kind|payload).
 */
export function cardToIdea(
  card: IdeaCard,
  source: IdeaSource,
  nowMs: number,
  seq = 0,
): Idea {
  const args = cardToIdeaArgs(card);
  const payloadKey =
    args.chord ??
    args.progression?.join(" ") ??
    args.melody?.join(",") ??
    String(args.seed ?? "");
  const key = `${source}|${args.kind}|${payloadKey}`;
  return {
    id: asCanonicalId(`idea-${hashSeed(key).toString(36)}`),
    instanceId: makeInstanceId(nowMs, seq),
    source,
    kind: args.kind,
    chord: args.chord,
    progression: args.progression,
    scale: args.scale,
    melody: args.melody,
    seed: args.seed,
    tags: null,
    createdAt: nowMs,
    version: 1,
  };
}
