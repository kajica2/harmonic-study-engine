/**
 * engine/explore/types.ts - PRD-001 Phase 5 (D93/D99/D100).
 *
 * The Explore envelope: seeds in, idea cards out. Purity: relative
 * imports only (core/versioned value-free + core/rng for cardId),
 * no clock, no randomness of its own (Rng INJECTED at call sites),
 * no console.
 *
 * DEVIATION (flagged): the design sketch names the candidate shape's
 * home "./types-sub-or-types" (a placeholder path). It is consolidated
 * HERE as SubstituteCandidate - one envelope file, zero drift between
 * the op outputs and the card builder's input.
 */

import type { Versioned } from "../core/versioned";
import type { KeyCandidate } from "../compose/types";
import { hashSeed } from "../core/rng";

/** D93: the five parsed seed kinds. */
export type ExploreSeedKind =
  | "chord"
  | "progression"
  | "scale"
  | "interval"
  | "free";

export interface ExploreSeed {
  readonly kind: ExploreSeedKind;
  /** The exact trimmed input (provenance for card back-links). */
  readonly raw: string;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: { readonly rootPc: number; readonly modeName: string } | null;
  readonly interval: {
    readonly semitones: number;
    readonly direction: "up" | "down";
  } | null;
}

/** D93 seed -> ops matrix keys (modulate is NOT an op - D94 defers it). */
export type ExploreOp =
  | "reharmonize"
  | "substitute"
  | "expand"
  | "vary"
  | "voicelead";

/**
 * D99 technique tokens. A token on a card/candidate is a CLAIM that the
 * matching predicate in substitute.ts / expand.ts / vary.ts /
 * voicelead.ts fired on the SAME data - never a style name, never
 * prose (PHASE-3-01 + ADR-013 + ADR-017 lineage).
 */
export type TechniqueToken =
  | "tritone-sub"
  | "secondary-dominant"
  | "modal-interchange"
  | "passing-diminished"
  | "extension"
  | "alteration"
  | "displacement"
  | "inversion"
  | "retrograde"
  | "ornamentation"
  | "voice-leading"
  | "drop-2"
  | "diatonic-neighbor"
  | "original";

/** One honest substitution/extension proposal over a ChordCell. */
export interface SubstituteCandidate {
  readonly cell: import("../compose/types").ChordCell;
  readonly technique: TechniqueToken;
  /** Names the ACTUAL intervals (D99) - never canned prose. */
  readonly rationale: string;
  /** Resolves via getConcept when non-null (D99 pins it). */
  readonly conceptId: string | null;
}

/** The context a substitution is claimed inside. */
export interface SubstituteContext {
  /** The chord AFTER the cell (null at progression end). */
  readonly next: import("../compose/types").ChordCell | null;
  readonly key: KeyCandidate;
}

/**
 * REQ-EXP-20/21/22: the card envelope. Exactly one of progression /
 * chord / melody carries the sounding payload (scale/interval seeds
 * materialize INTO progressions - cards never ship a bare scale).
 */
export interface IdeaCard extends Versioned {
  // version: 1
  /** "exp-<op>-<base36hash>" (hashSeed over seed|op|index, D100). */
  readonly id: string;
  readonly op: ExploreOp;
  /** <= 40 chars (builder-enforced, chip budget). */
  readonly label: string;
  /** 1-2 sentences. */
  readonly description: string;
  /** 1-3 sentences, technique-truthful (D99). */
  readonly rationale: string;
  /** Resolves via getConcept when non-null ("where possible" allows null). */
  readonly conceptId: string | null;
  readonly technique: TechniqueToken;
  readonly progression: readonly string[] | null;
  readonly chord: string | null;
  readonly melody: readonly number[] | null;
  readonly sourceSeedRaw: string;
}

/** Rest tokens in card progressions (mirrors the chart grammar's set). */
const REST_TOKENS: readonly string[] = ["-", "0", "r"];

/**
 * Shared "-" rest check for card progressions. False for rest tokens
 * (case-insensitive) and blanks; true for everything else (including
 * unknown symbols - soundness is the chart parser's job downstream).
 */
export function isSoundingSymbol(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t === "") return false;
  return !REST_TOKENS.includes(t.toLowerCase());
}

/**
 * D100: deterministic card ids (hash, never rng - label suffixes must
 * not consume the draw stream).
 */
export function cardId(
  seedRaw: string,
  op: ExploreOp,
  index: number,
): string {
  return `exp-${op}-${hashSeed(`${seedRaw}|${op}|${index}`).toString(36)}`;
}
