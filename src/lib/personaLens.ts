/**
 * src/lib/personaLens.ts — pure mapping from persona id to the
 * musical-task shifts described in IMPROVEMENT_PLAN option E
 * (proof of concept, three personas).
 *
 * The proof-of-concept picks three personas that map to genuinely
 * different practice tasks:
 *
 *   Bach     — voice-leading strictness. Calls a parallel-motion
 *              detector and surfaces a louder signal when the
 *              voicing breaks the rule.
 *   Coltrane — symmetrical-substitution prompt. Suggests tritone-
 *              sub and ii-V cycling substitutions for any ii-V-I
 *              progression.
 *   Miles    — space/economy prompt. Encourages sparse note choice
 *              ("three notes or fewer per bar; leave two beats of
 *              silence").
 *
 * The other 14 personas return an empty `PersonaLens` (visual
 * theme only — the existing gradient + canvas treatment). When
 * more personas get curated behavioral prompts in the future, they
 * join the same shape.
 *
 * Pure function of (personaId, optional chord-context). Unit-
 * testable without React.
 */

export type PersonaLensId = "bach" | "coltrane" | "miles";

export interface PersonaLens {
  /** Short phrase used in the prompt / banner. */
  prompt: string;
  /** A back-volume scaling factor for the backing track. Miles
   *  drops it; others leave it alone (1.0 = no change). */
  backingVolumeScale: number;
  /** A weight applied to the voice-leading score for ranking the
   *  "Minimum-motion voicing" alternative. Bach boosts it (>= 1.0)
   *  so stricter options win; others leave it at 1.0. */
  voiceLeadingStrictness: number;
  /** Optional in-bar prompt text for the current step. Bach uses
   *  this only when the parallel-motion detector trips; Miles
   *  shows a sparse-note prompt on bars with no chord-tone change. */
  stepPrompt?: string;
}

const EMPTY: PersonaLens = {
  prompt: "",
  backingVolumeScale: 1.0,
  voiceLeadingStrictness: 1.0,
};

const LENS: Record<PersonaLensId, PersonaLens> = {
  bach: {
    prompt: "Keep two voices stepwise; avoid parallel fifths.",
    backingVolumeScale: 1.0,
    voiceLeadingStrictness: 1.5,
  },
  coltrane: {
    prompt:
      "Connect each resolution with a four-note cell — try a tritone-sub or ii-V cycling substitution.",
    backingVolumeScale: 1.0,
    voiceLeadingStrictness: 1.0,
  },
  miles: {
    prompt: "Three notes or fewer per bar; leave two beats of silence.",
    backingVolumeScale: 0.7,
    voiceLeadingStrictness: 1.0,
  },
};

const LENS_IDS = new Set<string>(["bach", "coltrane", "miles"]);

/**
 * Resolve the lens for a given persona id. Returns the empty lens
 * for any persona id that doesn't have a curated behavioral
 * treatment — visual themes continue to work as today.
 */
export function lensForPersona(personaId: string | undefined): PersonaLens {
  if (!personaId) return EMPTY;
  if (!LENS_IDS.has(personaId)) return EMPTY;
  return LENS[personaId as PersonaLensId];
}

/** True when this persona has a curated behavioral lens (not just
 *  visual theme). */
export function hasBehavioralLens(personaId: string | undefined): boolean {
  return LENS_IDS.has(personaId ?? "");
}

/** All curated lens ids — exposed so the UI can show a "behavioral
 *  lenses" badge without hardcoding the list. */
export function curatedLensIds(): string[] {
  return [...LENS_IDS];
}
