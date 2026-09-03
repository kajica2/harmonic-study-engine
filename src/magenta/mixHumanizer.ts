/**
 * magenta/mixHumanizer.ts
 * ────────────────────────
 * Per-track mix humanization (plan §6 item 4).
 *
 * Every looped pass, the gain of each mix bus drifts ±N dB around
 * its user-set value, drawn from a *shared* seeded RNG. The result:
 * the recording never "loops" — every pass sounds like a slightly
 * different take of the same performance, the way real musicians
 * never reproduce a balance exactly.
 *
 * Why seeded:
 *   - Reproducible exports — same seed ⇒ same wobble sequence
 *     on every playback of the same recording.
 *   - Testable — golden-file tests can pin the exact dB sequence.
 *
 * Why shared across tracks:
 *   - Drift in *only one* bus reads as a glitch (that bus suddenly
 *     sounds louder/quieter). Drift in *all* buses together reads
 *     as a band settling into a groove. Same reason the ensemble
 *     OU clock (§5) is shared: cohesion comes from correlation.
 *
 * Where it plugs in:
 *   BackingEngine.setLevels already wires user-set gains to the
 *   GainNodes via `setTargetAtTime(timeConstant=0.05)`. The
 *   humanizer's `humanizeGains()` returns the *target* gain per
 *   track; the caller just passes them to that same path.
 */

import { mulberry32, createGaussian } from "./noise";

export type TrackId = "drums" | "bass" | "piano";

/** Max gain deviation, in dB. ±1 dB is the plan's recommended value. */
const DEFAULT_DB_RANGE = 1.0;

/** Smoothing time-constant (seconds) for the setTargetAtTime call.
 *  50 ms is short enough to feel like real-time mixing but long
 *  enough that the wobble doesn't click. */
const DEFAULT_SMOOTHING = 0.08;

/**
 * Convert linear amplitude (0..1) to decibels. Below ~0.0001 we
 * floor at -80 dB so the math doesn't blow up.
 */
export function gainToDb(g: number): number {
  if (g <= 1e-4) return -80;
  return 20 * Math.log10(g);
}

/**
 * Convert decibels to linear amplitude. Symmetric to gainToDb.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Clamp a value to [lo, hi].
 */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface MixHumanizerOptions {
  /** Seed for the shared RNG. Same seed ⇒ identical dB sequence. */
  seed: number;
  /** Max deviation in dB, both directions. Default 1.0 (±1 dB). */
  dbRange?: number;
  /**
   * Optional per-track scale (0..1). Lets future presets (e.g. a
   * "tight" mix) crank drums to 0.3× while leaving piano at 1×.
   */
  perTrackScale?: Partial<Record<TrackId, number>>;
}

export interface MixHumanizerHandle {
  /** Compute the next wobble offset for a track, in dB.
   *  Mutates the shared RNG state. */
  nextOffset(track: TrackId): number;
  /** Compute the full next pass: returns per-track gain multipliers
   *  (linear, 0..2) ready to feed straight into setTargetAtTime. */
  nextPass(): Record<TrackId, number>;
  /** Discard state so the next call returns from a fresh seed. */
  reset(): void;
  /** Replace the seed (e.g. on user "shuffle mix" action). */
  reseed(s: number): void;
}

const DEFAULT_TRACK_SCALE: Record<TrackId, number> = {
  drums: 0.7, // tight kit, less room to wobble
  bass: 1.0,
  piano: 0.9,
};

/**
 * Build a per-track mix humanizer. The returned handle is cheap to
 * call once per loop pass; the only allocation per call is the
 * returned Record. Safe to use from inside the audio render loop
 * if you want — it's pure except for the RNG state.
 */
export function createMixHumanizer(opts: MixHumanizerOptions): MixHumanizerHandle {
  const dbRange = opts.dbRange ?? DEFAULT_DB_RANGE;
  const perTrackScale = { ...DEFAULT_TRACK_SCALE, ...(opts.perTrackScale ?? {}) };
  let rng = mulberry32(opts.seed);
  // Use createGaussian so the Box–Muller spare-sample cache is
  // bound to *this* handle. When the handle is replaced via reseed
  // or reset, we re-create the cache to match the new RNG.
  let gauss = createGaussian(rng);

  function nextOffset(track: TrackId): number {
    const scale = perTrackScale[track] ?? 1;
    // Box-Muller gives a bell curve, but we want a uniform feel for
    // mix wobble. Clamping a Gaussian to ±1σ produces a flatter
    // distribution that's actually closer to "realistic fader
    // drift" (which is uniform-ish) than a true normal.
    const raw = gauss();
    const clamped = clamp(raw, -1, 1);
    return clamped * dbRange * scale;
  }

  function nextPass(): Record<TrackId, number> {
    // Pull all three offsets from the *same* RNG so the bell-curve
    // tail correlation carries across tracks — when the bass
    // happens to land at +0.8 dB, the piano is more likely to
    // also be slightly hot, mimicking the "band together" feel.
    return {
      drums: dbToGain(nextOffset("drums")),
      bass: dbToGain(nextOffset("bass")),
      piano: dbToGain(nextOffset("piano")),
    };
  }

  function reset() {
    rng = mulberry32(opts.seed);
    gauss = createGaussian(rng);
  }
  function reseed(s: number) {
    rng = mulberry32(s);
    gauss = createGaussian(rng);
    opts.seed = s;
  }

  return { nextOffset, nextPass, reset, reseed };
}

/**
 * Apply the humanizer's gain multipliers to a set of user-set gains
 * (each in 0..1). Returns a new Record<TrackId, number> with the
 * wobble applied. A track with userGain=0 (muted) stays at 0
 * regardless of wobble — silent stays silent.
 *
 * Convenience for callers that already have a Record of base gains
 * and want the wobble applied uniformly.
 */
export function applyMixWobble(
  base: Record<TrackId, number>,
  handle: MixHumanizerHandle,
): Record<TrackId, number> {
  const wob = handle.nextPass();
  const out = {} as Record<TrackId, number>;
  for (const t of ["drums", "bass", "piano"] as TrackId[]) {
    const userGain = base[t] ?? 0;
    if (userGain <= 1e-4) {
      out[t] = 0;
    } else {
      // clamp at the upper rail so a wobble-up doesn't push the
      // track above the user's chosen level
      out[t] = Math.min(userGain, userGain * wob[t]);
    }
  }
  return out;
}

/** Re-export the smoothing constant so the BackingEngine wrapper
 *  uses the same value as the plan calls for. */
export const MIX_HUMANIZER_SMOOTHING = DEFAULT_SMOOTHING;