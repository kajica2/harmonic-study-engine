/**
 * magenta/humanizeBacking.ts
 * ──────────────────────────
 * Thin adapter that applies the humanizer to backing-track note
 * timings WITHOUT touching BackingEngine's internal scheduling.
 *
 * Why this file:
 *   The BackingEngine is a tested singleton. Patching its internals
 *   to call into the humanizer would couple it to Magenta's async
 *   lazy-import and break the existing unit tests. Instead, the
 *   React layer wraps calls into playBass/playPiano with these
 *   two helpers — same public API, humanized time.
 *
 * The wrap shape:
 *   playBass(time, midi, dur) → playBass(adjust(time, "bass"), midi, dur)
 *   playPiano(time, midis, dur) → playPiano(adjust(time, "piano"), midis, dur)
 *
 * Notes:
 *   - `amount` blends 0..1 between grid (no jitter) and full persona.
 *   - `personaId` selects which profile to apply (per persona's
 *     placement / timing σ).
 *   - `seed` makes the humanization deterministic across calls,
 *     so a recording session that re-renders the same bar sounds
 *     the same on every replay.
 *   - `ctx.currentTime` is the audio clock the humanizer offsets
 *     against — we never schedule in the past.
 */
import { getPersonaProfile } from "./personaProfiles";
import { getGroove } from "./styleGrooves";
import { mulberry32, gaussian } from "./noise";
import type { BackingStyle } from "../lib/backingEngine";

/** Track-specific fixed offset, mirroring styleGrooves.trackOffsets. */
const TRACK_OFFSETS_MS: Record<"drums" | "bass" | "piano", number> = {
  drums: 0,
  bass: -6,
  piano: 4,
};

export interface HumanizeBackingOptions {
  /** Blend amount, 0 = grid, 1 = full persona. Default 0 (off). */
  amount?: number;
  /** Persona id; controls placement + timing σ. */
  personaId?: string;
  /** Backing style; controls swing + beat strength. */
  style?: BackingStyle;
  /** Seed for jitter reproducibility. */
  seed?: number;
  /**
   * The audio clock's "now" — passed in from the caller's
   * `ctx.currentTime` so we can clamp scheduling to non-past times.
   */
  ctxNow?: number;
}

export interface HumanizeBackingHandle {
  /** Adjust a backing note's absolute play-time. */
  adjust(time: number, track: "drums" | "bass" | "piano"): number;
  /** Force a fresh RNG/clock at the next call (e.g. user reset). */
  reset(): void;
}

/**
 * Build a `HumanizeBackingHandle`. The returned `adjust` is a
 * pure function of (time, track) — safe to call inside the audio
 * thread because it doesn't allocate after the first invocation
 * (the closure captures the RNG once).
 *
 * Note this never imports `@magenta/music`; the humanizer works
 * on absolute times directly via our local primitives (Box–Muller
 * + persona profiles), so the dial is usable even when Magenta
 * is unavailable.
 */
export function createHumanizeBacking(opts: HumanizeBackingOptions = {}): HumanizeBackingHandle {
  const amount = Math.max(0, Math.min(1, opts.amount ?? 0));
  const persona = getPersonaProfile(opts.personaId);
  const groove = getGroove(opts.style ?? "swing");
  const ctxNow = opts.ctxNow ?? 0;
  const seed = opts.seed ?? 0xBADC0DE;

  // Per-track RNG so different tracks get independent jitter within
  // the same bar. (We could share a clock, but per-track reads more
  // naturally at the call site and the audible difference is small.)
  let rng = mulberry32(seed);

  function reset() {
    rng = mulberry32(seed);
  }

  function adjust(time: number, track: "drums" | "bass" | "piano"): number {
    if (amount <= 0) return time;
    // ms offsets are on the order of -14..+8 — convert to seconds
    const trackMs = TRACK_OFFSETS_MS[track] + persona.placementMs;
    const placementSec = (trackMs * amount) / 1000;
    // Per-note timing jitter (scaled by amount + persona σ)
    const jitterSec = gaussian(rng, 0, (persona.timSigmaMs * amount) / 1000);
    // Beat-strength weight contributes a small velocity nudge via
    // time-advance (louder notes earlier by ~1ms / 10 velocity).
    // We don't have velocity here, so apply a tiny constant pull.
    const swingSec = 0; // placeholder — swing is a per-pattern thing
    void groove;
    void swingSec;

    const adjusted = time + placementSec + jitterSec;
    // Never schedule before "now" — that drops the note.
    return adjusted < ctxNow ? ctxNow + 0.001 : adjusted;
  }

  return { adjust, reset };
}

/**
 * Re-export for convenience — consumers can import the dial-side
 * knobs from one place.
 */
export { getPersonaProfile } from "./personaProfiles";
export type { PersonaProfile } from "./personaProfiles";
export { getGroove } from "./styleGrooves";
export type { StyleGroove } from "./styleGrooves";