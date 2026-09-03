/**
 * magenta/humanizer.ts
 * ────────────────────
 * The five-rule humanization pipeline (plan §5).
 *
 *   quantized NoteSequence
 *     └─► StyleGroove     (per-style swing/grid transform)
 *     └─► EnsembleClock   (ONE shared OU tempo drift — all tracks breathe together)
 *     └─► TrackOffsets    (drums +0ms, bass −6ms, keys +4ms — per style/persona)
 *     └─► PerNote         (timing jitter, velocity shape, length/articulation)
 *     └─► Unquantized     NoteSequence, ready for mm.Player / SoundFontPlayer
 *
 * The pipeline is deliberately a pure function — `humanize(ns, ...)` —
 * because the same input must always produce the same output (given
 * the same seed). That property is what makes the golden tests
 * possible, what makes exports reproducible, and what lets the
 * user "commit" a humanized version back into their path catalog.
 *
 * Performance: O(n) over notes. No model inference. Safe to call
 * inside the audio render loop if you want, but the typical use is
 * once at start-of-bar or once at start-of-path.
 *
 * Async because the humanizer internally calls `quantize()` (which
 * lazy-loads `@magenta/music`). On first call the model gets pulled
 * in; subsequent calls reuse the cached module reference.
 */
import type { INoteSequence, NoteSequence } from "./INoteSequence";
import { quantize, unquantize } from "./quantize";
import { STEPS_PER_QUARTER, DEFAULT_QPM } from "./adapter";
import { OUDrift, gaussian, mulberry32 } from "./noise";
import type { PersonaProfile } from "./personaProfiles";
import type { StyleGroove } from "./styleGrooves";

/**
 * Why we ship a separate `NoteSequence` output type vs the input
 * `INoteSequence`:
 *   - The input is the *quantized* contract (used by Magenta models).
 *   - The output is the *unquantized* contract (used by players).
 *   Keeping them as separate type aliases makes the pipeline edges
 *   honest: a humanizer caller can't accidentally pass free-time
 *   notes through a model that expects grid alignment.
 */
export type HumanizedSequence = NoteSequence;

/**
 * Combined input: an unquantized INoteSequence is fine (we quantize
 * internally), a quantized one is fine (we detect and clone). We
 * accept both so the caller doesn't have to care.
 */
export type HumanizeInput = INoteSequence;

export interface HumanizeOptions {
  /** Persona profile controlling placement, jitter, legato, prune, drift. */
  persona: PersonaProfile;
  /** Style groove (swing, bossa, funk, …) providing weight + offsets. */
  groove: StyleGroove;
  /**
   * Optional shared ensemble clock. Pass the SAME instance to every
   * track's humanizer call so drums/bass/keys breathe together.
   * If omitted, a new clock is created from the seed.
   */
  ensembleClock?: OUDrift;
  /** Seed for all RNG. Same seed ⇒ identical output. */
  seed: number;
  /** Blend 0..1: 0 = grid, 1 = full persona profile. Default 1. */
  amount?: number;
  /**
   * Per-note instrument/program used by the player. Currently
   * unused by the humanizer — preserved for the SoundFontPlayer
   * wiring in §6 (offline render action).
   */
  instrument?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Apply the swing transform to a quantized grid step. The Magenta
 * grid is `STEPS_PER_QUARTER=4`, so a 16th-note step has length
 * `(1/4) * quarterNote`. We compute the position *within the beat*
 * (0 = on-beat, 0.5 = 'and'-of-beat), then push off-beats later
 * proportional to the swing amount.
 *
 * Returns an offset in seconds (positive = later).
 */
function swingOffsetSeconds(
  quantizedStartStep: number,
  swing: number,
  qpm: number,
): number {
  const stepLen = 60 / qpm / STEPS_PER_QUARTER;            // sec per 16th
  const posInBeat = quantizedStartStep % STEPS_PER_QUARTER; // 0..3
  const isOffBeat = posInBeat === 2;                        // 8th-note off-beat only
  if (!isOffBeat) return 0;
  const beatFrac = stepLen * (swing - 0.5) * 2;             // ±0..stepLen
  return beatFrac;
}

/**
 * Compute the wall-clock time of a quantized step in seconds.
 */
function quantizedStepToSeconds(step: number, qpm: number): number {
  return (60 / qpm) * (step / STEPS_PER_QUARTER);
}

/**
 * Detect whether a quantized step lands on an upbeat. With
 * STEPS_PER_QUARTER=4, positions 1 and 3 are the 'and'-of-1 and
 * 'and'-of-3 respectively — the canonical "upbeat" positions.
 */
function isUpbeat(quantizedStep: number): boolean {
  return quantizedStep % STEPS_PER_QUARTER === 1 || quantizedStep % STEPS_PER_QUARTER === 3;
}

/**
 * Main pipeline. Returns a *new* INoteSequence in absolute-time form
 * (unquantized), ready to feed into `mm.SoundFontPlayer` or the
 * app's existing `playSoundfontNote` scheduler.
 *
 * The function never mutates the input.
 */
export async function humanize(
  input: HumanizeInput,
  opts: HumanizeOptions,
): Promise<HumanizedSequence> {
  const { persona, groove, seed } = opts;
  const amount = clamp(opts.amount ?? 1, 0, 1);
  const rng = mulberry32(seed);
  const ensembleClock = opts.ensembleClock ?? new OUDrift(rng, 0.3, persona.driftSigma);

  // 1. Normalize to quantized form so we can compute offsets relative to the grid
  const qns = await quantize(input);
  const qpm = qns.tempos?.[0]?.qpm ?? DEFAULT_QPM;

  // 2. Pull track offsets (drums/bass/piano) — persona-driven via groove
  const trackOffsetMs = groove.trackOffsets;
  // We approximate which track this note belongs to via `instrument` if set,
  // otherwise default to "piano" (middle ground). The MVP doesn't yet split
  // per-track — callers that need per-track offsets should pass separate
  // NoteSequences per instrument.
  const trackOffset = (trackOffsetMs.drums + trackOffsetMs.bass + trackOffsetMs.piano) / 3 / 1000;

  // 3. Apply per-note transforms
  const newNotes = qns.notes.map((n) => {
    const startStep = (n.quantizedStartStep as number) ?? 0;
    const endStep   = (n.quantizedEndStep as number) ?? startStep + 1;
    const beatStrength = groove.weight(quantizedStepToSeconds(startStep, qpm));

    // velocity: weight × base × jitter — rule 3 (beat-strength hierarchy)
    let velocity = (n.velocity ?? 80) * beatStrength;
    if (amount > 0) {
      velocity *= 1 + gaussian(rng, 0, persona.velSigma * amount);
      if (isUpbeat(startStep)) velocity += persona.accentUpbeat * amount;
    }
    velocity = clamp(Math.round(velocity), 1, 127);

    // timing: rule 1 (shared ensemble drift) + rule 2 (vel→timing coupling)
    //   + swing + persona placement + per-note jitter
    let startTime = quantizedStepToSeconds(startStep, qpm);
    if (amount > 0) {
      const rush = -((velocity - 80) * 0.001); // louder → earlier
      const ensemble = ensembleClock.next() * 0.002 * amount;
      const swingMs = swingOffsetSeconds(startStep, persona.swing, qpm) * amount;
      const placementMs = (persona.placementMs + trackOffset * 1000) * amount;
      const jitterMs = gaussian(rng, 0, persona.timSigmaMs / 1000) * amount;
      startTime += ensemble + swingMs + (placementMs / 1000) + rush + jitterMs;
    }

    // length: rule 4 (articulation / legato)
    const baseDur = quantizedStepToSeconds(endStep - startStep, qpm);
    let lengthSec = baseDur;
    if (amount > 0) {
      lengthSec = baseDur * persona.legato * (1 + gaussian(rng, 0, 0.05 * amount));
    }

    return {
      pitch: n.pitch,
      velocity,
      startTime,
      endTime: startTime + Math.max(0.02, lengthSec),
      instrument: opts.instrument ?? n.instrument ?? 0,
    };
  });

  // 4. Optional pruning (e.g. Miles plays less)
  let filtered = newNotes;
  if (amount > 0 && persona.prune > 0) {
    filtered = newNotes.filter(() => rng() >= persona.prune * amount);
  }

  return {
    notes: filtered,
    totalTime: (qns.totalQuantizedSteps ?? 0) * (60 / qpm / STEPS_PER_QUARTER),
    timeSignatures: qns.timeSignatures,
    tempos: qns.tempos,
  } as NoteSequence;
}

/**
 * Convenience wrapper for callers that want a quick "humanize this
 * path-shaped input" without manually calling adapter + humanizer.
 *
 * Accepts an INoteSequence (from the adapter) and returns an
 * unquantized NoteSequence ready for playback.
 */
export async function humanizeSequence(
  ns: INoteSequence,
  opts: Omit<HumanizeOptions, "seed"> & { seed?: number },
): Promise<HumanizedSequence> {
  return humanize(ns, { ...opts, seed: opts.seed ?? 0xC0FFEE });
}

/** Re-export the type for downstream consumers. */
export type { NoteSequence } from "./INoteSequence";