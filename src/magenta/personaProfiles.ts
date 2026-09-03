/**
 * magenta/personaProfiles.ts
 * ──────────────────────────
 * Humanizer parameters per persona. One row per `Persona.id` in
 * `src/lib/personas.ts` (currently 17 — the original 12 from the
 * Magenta plan plus the five added since).
 *
 * Fields map directly onto the §5.3 table in `harmonic-magenta-plan.md`:
 *   - `placementMs`  — fixed timing bias, in ms. Positive = ahead of
 *                      the beat, negative = behind (e.g. Miles −14ms).
 *   - `timSigmaMs`   — per-note timing jitter σ, in ms. Coltrane is
 *                      busy, Glass is metronomic.
 *   - `velSigma`     — per-note velocity jitter σ, as a fraction of
 *                      the base velocity (0.06 ≈ ±6%).
 *   - `swing`        — 0..1, even-8th-to-triplet skew. 0.5 = straight.
 *   - `legato`       — note-length multiplier on the grid (1.0 = full
 *                      step, >1 = sustains into next note).
 *   - `prune`        — drop this fraction of generated notes at random.
 *                      Miles plays less.
 *   - `driftSigma`   — how much the shared ensemble-clock OU process
 *                      wanders. Debussy is rubato, Bach is dead-center.
 *   - `accentUpbeat` — +velocity boost on the "and" of the beat.
 *                      Dizzy sits on the up-beats.
 *
 * Persona IDs absent from this table get a "kandinsky" default
 * (the most neutral profile). New personas added to `personas.ts`
 * will silently fall through to the default — the humanizer will
 * always work, the sound just won't be customized.
 */
export interface PersonaProfile {
  /** Fixed timing offset in milliseconds. +ahead, −behind. */
  placementMs: number;
  /** Per-note timing jitter σ, ms. */
  timSigmaMs: number;
  /** Per-note velocity jitter σ, fraction of base (0.06 ≈ ±6%). */
  velSigma: number;
  /** Even-8th → triplet skew, 0..1. 0.5 = straight. */
  swing: number;
  /** Note-length multiplier on the grid. 1.0 = full step. */
  legato: number;
  /** Drop this fraction of generated notes (0..1). */
  prune: number;
  /** OU drift volatility scalar (multiplied into the constructor σ). */
  driftSigma: number;
  /** Velocity boost on upbeat ('and' of each beat), in MIDI velocity. */
  accentUpbeat: number;
}

const KANDINSKY: PersonaProfile = {
  placementMs: 0, timSigmaMs: 6, velSigma: 0.06,
  swing: 0.54, legato: 1.0, prune: 0, driftSigma: 0.6, accentUpbeat: 0,
};

const COLTRANE: PersonaProfile = {
  placementMs: 8, timSigmaMs: 10, velSigma: 0.09,
  swing: 0.58, legato: 0.95, prune: 0, driftSigma: 1.0, accentUpbeat: 4,
};

const BACH: PersonaProfile = {
  placementMs: 0, timSigmaMs: 3, velSigma: 0.03,
  swing: 0.50, legato: 0.9, prune: 0, driftSigma: 0.2, accentUpbeat: 0,
};

const DEBUSSY: PersonaProfile = {
  placementMs: -10, timSigmaMs: 14, velSigma: 0.08,
  swing: 0.55, legato: 1.2, prune: 0, driftSigma: 1.6, accentUpbeat: 0,
};

const ENO: PersonaProfile = {
  placementMs: -6, timSigmaMs: 12, velSigma: 0.05,
  swing: 0.50, legato: 1.4, prune: 0, driftSigma: 0.9, accentUpbeat: 0,
};

const GLASS: PersonaProfile = {
  placementMs: 0, timSigmaMs: 2, velSigma: 0.02,
  swing: 0.50, legato: 1.0, prune: 0, driftSigma: 0.15, accentUpbeat: 0,
};

const MONK: PersonaProfile = {
  placementMs: 0, timSigmaMs: 12, velSigma: 0.11,
  swing: 0.60, legato: 0.85, prune: 0, driftSigma: 0.7, accentUpbeat: 0,
};

const MILES: PersonaProfile = {
  placementMs: -14, timSigmaMs: 9, velSigma: 0.06,
  swing: 0.57, legato: 1.1, prune: 0.30, driftSigma: 0.8, accentUpbeat: 0,
};

const CHET: PersonaProfile = {
  placementMs: -12, timSigmaMs: 8, velSigma: 0.05,
  swing: 0.56, legato: 1.15, prune: 0.10, driftSigma: 0.7, accentUpbeat: 0,
};

const DIZZY: PersonaProfile = {
  placementMs: 6, timSigmaMs: 9, velSigma: 0.10,
  swing: 0.60, legato: 0.95, prune: 0, driftSigma: 0.9, accentUpbeat: 10,
};

const HUBBARD: PersonaProfile = {
  placementMs: 4, timSigmaMs: 8, velSigma: 0.09,
  swing: 0.58, legato: 1.0, prune: 0, driftSigma: 0.8, accentUpbeat: 0,
};

const SHORTER: PersonaProfile = {
  placementMs: 0, timSigmaMs: 11, velSigma: 0.07,
  swing: 0.55, legato: 1.05, prune: 0, driftSigma: 1.1, accentUpbeat: 0,
};

// Five added since the original plan — sane defaults in the family
// of their closest relative.
const SIMONE: PersonaProfile = {  // like Chet, slightly forward
  placementMs: -8, timSigmaMs: 10, velSigma: 0.08,
  swing: 0.56, legato: 1.1, prune: 0, driftSigma: 0.8, accentUpbeat: 0,
};
const NOVARO: PersonaProfile = {  // like Bach — folk/classical precision
  placementMs: 0, timSigmaMs: 5, velSigma: 0.04,
  swing: 0.50, legato: 0.95, prune: 0, driftSigma: 0.4, accentUpbeat: 0,
};
const GETZ: PersonaProfile = {  // like Miles — cool, behind, sparse
  placementMs: -10, timSigmaMs: 8, velSigma: 0.05,
  swing: 0.57, legato: 1.15, prune: 0.15, driftSigma: 0.7, accentUpbeat: 0,
};
const ROLLINS: PersonaProfile = {  // like Coltrane — aggressive, busy
  placementMs: 6, timSigmaMs: 12, velSigma: 0.10,
  swing: 0.58, legato: 0.95, prune: 0, driftSigma: 0.9, accentUpbeat: 6,
};
const HENDERSON: PersonaProfile = {  // like Shorter — modal, elastic
  placementMs: 0, timSigmaMs: 10, velSigma: 0.07,
  swing: 0.56, legato: 1.05, prune: 0, driftSigma: 1.0, accentUpbeat: 0,
};

export const PERSONA_PROFILES: Record<string, PersonaProfile> = {
  kandinsky: KANDINSKY, coltrane: COLTRANE, bach: BACH, debussy: DEBUSSY,
  eno: ENO, glass: GLASS, monk: MONK, miles: MILES, chet: CHET,
  dizzy: DIZZY, hubbard: HUBBARD, shorter: SHORTER,
  simone: SIMONE, novaro: NOVARO, getz: GETZ, rollins: ROLLINS, henderson: HENDERSON,
};

/** Fallback used when a persona id isn't in the table. */
export const DEFAULT_PERSONA_PROFILE: PersonaProfile = KANDINSKY;

/** Look up a persona's humanizer profile, defaulting silently if unknown. */
export function getPersonaProfile(id: string | undefined): PersonaProfile {
  if (!id) return DEFAULT_PERSONA_PROFILE;
  return PERSONA_PROFILES[id] ?? DEFAULT_PERSONA_PROFILE;
}