/**
 * engine/ear-training/types.ts - PRD-001 Phase 6 (REQ-PED-20/21, D102).
 *
 * Ear-training prompt envelope. Plain data, JSON round-trip safe,
 * Versioned. Every prompt carries a non-null registry-resolving
 * conceptId (REQ-PED-25) so failure always links somewhere honest.
 *
 * Purity contract (engine/purity.test.ts): relative imports only, no
 * clock, no randomness, no console.
 */

import type { Versioned } from "../core/versioned";
import type { Seed } from "../core/rng";
import { hashSeed } from "../core/rng";

/** REQ-PED-20: the 7 ear-training prompt kinds. */
export type EarType =
  | "interval"
  | "chord-quality"
  | "chord-inversion"
  | "progression"
  | "scale"
  | "melodic-dictation"
  | "harmonic-dictation";

/** REQ-PED-21: difficulty 1-5 (closed tables in generate.ts). */
export type EarDifficulty = 1 | 2 | 3 | 4 | 5;

/** REQ-PED-20/21/25: one seeded drill prompt. */
export interface EarPrompt extends Versioned {
  readonly id: string;
  readonly type: EarType;
  readonly difficulty: EarDifficulty;
  readonly seed: Seed;
  /** 0..11 transposition anchor (tonic for progressions/scales). */
  readonly rootPc: number;
  /** PROMPT pitches (intervals: 2; chords: 3-5; scales: 7-8; dictations: 4-8). */
  readonly midi: readonly number[];
  /** Progression/harmonic only (spelled via D11); else null. */
  readonly chordSymbols: readonly string[] | null;
  /** ASCII prompt text. */
  readonly question: string;
  /** ALWAYS non-null (REQ-PED-25); resolves via getConcept. */
  readonly conceptId: string;
  /** Canonical answer token (interval name / quality symbol / symbol list / pc list). */
  readonly answerKey: string;
}

/** Multiple-choice wrapper (4 options, answer included once). */
export interface EarOptions {
  readonly prompt: EarPrompt;
  readonly choices: readonly string[];
  readonly correctIndex: number;
}

const EAR_TYPES: readonly EarType[] = [
  "interval",
  "chord-quality",
  "chord-inversion",
  "progression",
  "scale",
  "melodic-dictation",
  "harmonic-dictation",
];

/** Narrowing for parsed config values (never throws). */
export function isEarType(s: string): s is EarType {
  return (EAR_TYPES as readonly string[]).includes(s);
}

/** Deterministic prompt id: "ear-<type>-<base36hash>" (hashSeed, D100 pattern). */
export function earPromptId(
  type: EarType,
  difficulty: EarDifficulty,
  seed: Seed,
  answerKey: string,
  rootPc: number,
): string {
  const key = `${type}|${difficulty}|${seed >>> 0}|${rootPc}|${answerKey}`;
  return `ear-${type}-${hashSeed(key).toString(36)}`;
}
