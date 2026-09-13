/**
 * src/lib/personaMelodyFilter.ts — persona-conditioned surface.
 *
 * Decision (resolved 2026-09-13): persona conditioning is a SEPARATE
 * layer applied AFTER the genre-neutral Markov core
 * (`melodyMarkov.ts`). This file does not touch the chain.
 *
 * Contour profiles:
 *   - "leaping" (Coltrane, Miles, Rollins, Brahms, Mahler, …): bias
 *     toward large interval leaps (avg ≥ 4 semitones between
 *     adjacent notes).
 *   - "stepwise" (Bach, Chet, Getz, Debussy, …): bias toward stepwise
 *     motion (max leap ≤ 2 semitones).
 *   - "angular" (Monk, Scriabin, Kandinsky, …): bias toward contour
 *     sign-alternation (dir[i] != dir[i+1]) — up-down-up patterns.
 *   - "neutral" (Eno): no bias, return melody unchanged.
 *
 * All transforms are deterministic given the same `seed`. Persona
 * field lives in `Persona.contourProfile` (added in src/lib/personas.ts).
 */

import { mulberry32 } from "../magenta/noise";
import { PERSONAS } from "./personas";
import type { ContourProfile } from "./personas";

export interface PersonaFilterArgs {
  /** Genre-neutral melody from `melodyMarkov.ts`. */
  melody: number[];
  /** Persona id (matches Persona.id). "neutral" is the default if absent. */
  personaId: string;
  /** uint32 seed. Same seed → same output. */
  seed: number;
}

/** Maximum allowed leap for stepwise profiles (semitones). */
const STEPWISE_MAX_LEAP = 2;
/** Minimum average leap for leaping profiles (semitones). */
const LEAPING_MIN_AVG = 4;
/** Number of alternations required for "angular" (out of total transitions). */
const ANGULAR_MIN_ALTERNATIONS_RATIO = 0.66;

function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function leaps(melody: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < melody.length; i++) {
    out.push(Math.abs(melody[i] - melody[i - 1]));
  }
  return out;
}

/**
 * Stepwise transform: clamp every adjacent leap to ≤ STEPWISE_MAX_LEAP
 * semitones by picking the chord-tone nearest the original direction.
 * Falls back to no-op if the melody has fewer than 2 notes.
 *
 * For MVP we don't carry chord tones here — we just clamp the leap.
 * v1 will intersect with chord-tone pc-set.
 */
function toStepwise(melody: number[]): number[] {
  if (melody.length < 2) return melody.slice();
  const out = [melody[0]];
  for (let i = 1; i < melody.length; i++) {
    const prev = out[i - 1];
    const orig = melody[i];
    const dir = Math.sign(orig - prev) || 1;
    const target = prev + dir * Math.min(STEPWISE_MAX_LEAP, Math.abs(orig - prev));
    out.push(target);
  }
  return out;
}

/**
 * Leaping transform: pick new pc by sampling from {prev ± 4..7} until
 * the average leap across the bar meets LEAPING_MIN_AVG. Deterministic
 * via `rng`.
 */
function toLeaping(melody: number[], rng: () => number): number[] {
  if (melody.length < 2) return melody.slice();
  const out = [melody[0]];
  const LEAPS = [4, 5, 7]; // semitone magnitudes the profile prefers
  for (let i = 1; i < melody.length; i++) {
    const prev = out[i - 1];
    let attempts = 0;
    let candidate = prev + (LEAPS[Math.floor(rng() * LEAPS.length)] * (rng() < 0.5 ? -1 : 1));
    while (attempts < 4) {
      const avgSoFar =
        leaps(out.concat(candidate)).reduce((a, b) => a + b, 0) /
        (out.length); // avg excluding the candidate
      if (avgSoFar >= LEAPING_MIN_AVG || attempts === 3) break;
      candidate = prev + (LEAPS[Math.floor(rng() * LEAPS.length)] * (rng() < 0.5 ? -1 : 1));
      attempts++;
    }
    out.push(candidate);
  }
  return out;
}

/**
 * Angular transform: walk the melody left-to-right; whenever two
 * adjacent leaps share the same sign, flip the sign of the second.
 * Preserves the magnitude of each leap (so the contour stays
 * recognizable) but forces alternation.
 */
function toAngular(melody: number[]): number[] {
  if (melody.length < 3) return melody.slice();
  const out = melody.slice();
  for (let i = 2; i < out.length; i++) {
    const prevDelta = out[i - 1] - out[i - 2];
    const thisDelta = out[i] - out[i - 1];
    if (prevDelta === 0 || thisDelta === 0) continue;
    if (Math.sign(prevDelta) === Math.sign(thisDelta)) {
      out[i] = out[i - 1] - thisDelta; // flip sign
    }
  }
  return out;
}

/**
 * Apply the persona's contour profile to a melody.
 *
 * - `personaId` not found OR profile = "neutral": return `melody` unchanged.
 * - Same `(melody, personaId, seed)` → byte-equal output.
 */
export function applyPersonaFilter(args: PersonaFilterArgs): number[] {
  const { melody, personaId, seed } = args;
  if (melody.length === 0) return melody.slice();
  const persona = PERSONAS.find((p) => p.id === personaId);
  const profile: ContourProfile = persona?.contourProfile ?? "neutral";
  switch (profile) {
    case "stepwise":
      return toStepwise(melody);
    case "leaping":
      return toLeaping(melody, mulberry32(seed >>> 0));
    case "angular":
      return toAngular(melody);
    case "neutral":
    default:
      return melody.slice();
  }
}

/**
 * Exposed for tests: the angular-alternation ratio for a melody.
 * Returns count of sign-alternations divided by total sign transitions.
 */
export function angularRatio(melody: number[]): number {
  if (melody.length < 3) return 1;
  const dirs: number[] = [];
  for (let i = 1; i < melody.length; i++) {
    const d = Math.sign(melody[i] - melody[i - 1]);
    if (d !== 0) dirs.push(d);
  }
  if (dirs.length < 2) return 1;
  let alt = 0;
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] !== dirs[i - 1]) alt++;
  }
  return alt / (dirs.length - 1);
}
