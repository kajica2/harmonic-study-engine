/**
 * engine/pedagogy/types.ts - PRD-001 Phase 3 Slice 1 (D18 / REQ-PED-1/2/3/11).
 *
 * Concept + Annotation data shapes for the pedagogy registry. Plain
 * data, JSON round-trip safe, Versioned. The Slice 1 annotator emits
 * ONLY chord/progression/melody targets; the remaining target kinds
 * exist now so Slice 2/3 never need a breaking union change.
 *
 * Purity contract (engine/purity.test.ts): relative imports only, no
 * clock, no randomness, no console.
 */

import type { Versioned } from "../core/versioned";

/** REQ-PED-11 categories. */
export type ConceptCategory =
  | "harmony"
  | "voice-leading"
  | "melody"
  | "form"
  | "rhythm";

/** REQ-PED-11. Plain data; JSON round-trip safe (pinned by test). */
export interface Concept extends Versioned {
  readonly id: string; // kebab-case, registry-unique: "ii-v-i"
  readonly title: string;
  readonly category: ConceptCategory;
  /** One-sentence hook, <= 160 chars (drawer header, tooltips). */
  readonly definition: string;
  /** Longer body, 1-3 paragraphs, \n\n separated. ASCII. */
  readonly body: string;
  /** External references ("label - URL"); null when none. */
  readonly references: readonly string[] | null;
  /** Other concept ids; null when none. Must resolve (test-pinned). */
  readonly related: readonly string[] | null;
  /** Numeral tokens illustrating the concept in the D21 grammar
   * (Slice 3 "Hear an example" feeds these to the generator). */
  readonly exampleNumerals: readonly string[] | null;
}

/** REQ-PED-2 target kinds. Slice 1 EMITS only chord/progression/melody;
 * the rest exist so Slice 2/3 never need a breaking union change. */
export type AnnotationTarget =
  | { readonly kind: "chord"; readonly bar: number }
  | {
      readonly kind: "progression";
      readonly fromBar: number;
      readonly toBar: number;
    }
  | { readonly kind: "note"; readonly slot: number }
  | { readonly kind: "melody" }
  | { readonly kind: "voicing"; readonly bar: number }
  | { readonly kind: "scale" };

/** REQ-PED-1/2/3. */
export interface Annotation extends Versioned {
  readonly id: string; // deterministic: "ann-<detector>-<bar>"
  readonly target: AnnotationTarget;
  readonly label: string; // short chip text, <= 40 chars
  readonly text: string; // 1-3 sentences
  readonly conceptId: string | null; // resolves in the registry when non-null
  /** 0..1; detectors emit 1 (pattern present is decidable). null = editorial. */
  readonly confidence: number | null;
}
