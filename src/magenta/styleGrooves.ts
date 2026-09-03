/**
 * magenta/styleGrooves.ts
 * ───────────────────────
 * Per-backing-style timing templates.
 *
 * A "groove" is just two pure functions of time:
 *   - `swingOffset(t)` — how far the on-beat-vs-off-beat pair is
 *     pushed toward a triplet (0 = straight 8ths, 1 = full triplet).
 *   - `weight(t)`      — beat-strength curve (downbeat > backbeat >
 *     off-beats). Multiplies into velocity.
 *
 * Keeping these as pure functions (not classes) means they're
 * trivially testable — `expect(swing(0.25)).toBeCloseTo(0)` — and
 * the humanizer can swap them per track without inheriting state.
 *
 * The `Bossa` and `Funk` grooves approximate the canonical
 * rhythmic feels without claiming any one of the existing backing
 * engine styles (swing / bossa / funk / latin / ballad) is more
 * "correct" than another. The user picks the backing style in the
 * UI; the humanizer applies the matching groove automatically.
 */
import { BackingStyle } from "../lib/backingEngine";

export interface StyleGroove {
  /** Per-style swing amount in [0,1]. 0.5 = straight 8ths. */
  swing: number;
  /** Beat-strength curve: returns a velocity multiplier in (0,1] for time `t` (seconds). */
  weight(t: number): number;
  /** Per-track fixed offset in ms: drums, bass, keys (positive = late). */
  trackOffsets: Readonly<{ drums: number; bass: number; piano: number }>;
}

/**
 * Default 4/4 beat strength: 1.0 on 1, 0.7 on 2/4 (backbeats are
 * strong in jazz/pop), 0.5 elsewhere. For odd meters we'd need a
 * meter-aware variant — out of scope for the MVP.
 */
function jazzWeight(t: number): number {
  const beat = (t * 2) % 2;  // 120 BPM → 1 beat/sec; double-time = 2 beats/sec
  if (beat < 0.02) return 1.0;          // downbeat
  if (beat > 0.48 && beat < 0.52) return 0.7;  // beat 2
  if (beat > 0.98) return 0.7;          // beat 4 (backbeat)
  return 0.5;
}

function funkWeight(t: number): number {
  const beat = (t * 2) % 2;
  if (beat < 0.02) return 1.0;          // very strong "1"
  if (beat > 0.48 && beat < 0.52) return 0.85;  // "2" hit
  if (beat > 0.98) return 0.65;
  return 0.4;
}

function balladWeight(t: number): number {
  const beat = (t * 2) % 2;
  if (beat < 0.05) return 1.0;
  if (beat > 0.95) return 0.6;
  return 0.45;
}

const TRACK_OFFSETS_SWING = { drums: 0, bass: -6, piano: 4 } as const;
const TRACK_OFFSETS_FUNK  = { drums: -2, bass: 0, piano: 6 } as const;
const TRACK_OFFSETS_BOSSA = { drums: 4, bass: 0, piano: 6 } as const;
const TRACK_OFFSETS_BALLAD = { drums: 0, bass: -4, piano: 0 } as const;
const TRACK_OFFSETS_FLAT  = { drums: 0, bass: 0, piano: 0 } as const;

export const STYLE_GROOVES: Record<BackingStyle, StyleGroove> = {
  off:    { swing: 0.50, weight: jazzWeight,    trackOffsets: TRACK_OFFSETS_FLAT },
  swing:  { swing: 0.58, weight: jazzWeight,    trackOffsets: TRACK_OFFSETS_SWING },
  bossa:  { swing: 0.54, weight: jazzWeight,    trackOffsets: TRACK_OFFSETS_BOSSA },
  "clave3-2": { swing: 0.54, weight: jazzWeight, trackOffsets: TRACK_OFFSETS_BOSSA },
  "clave3-3": { swing: 0.54, weight: jazzWeight, trackOffsets: TRACK_OFFSETS_BOSSA },
  funk:   { swing: 0.52, weight: funkWeight,    trackOffsets: TRACK_OFFSETS_FUNK },
  latin:  { swing: 0.54, weight: jazzWeight,    trackOffsets: TRACK_OFFSETS_BOSSA },
  ballad: { swing: 0.52, weight: balladWeight,  trackOffsets: TRACK_OFFSETS_BALLAD },
  "afro-4-4": { swing: 0.56, weight: jazzWeight, trackOffsets: TRACK_OFFSETS_BOSSA },
  "afro-4-3": { swing: 0.56, weight: jazzWeight, trackOffsets: TRACK_OFFSETS_BOSSA },
  "afro-3-4": { swing: 0.56, weight: jazzWeight, trackOffsets: TRACK_OFFSETS_BOSSA },
};

/** Look up groove by style, with a sensible default. */
export function getGroove(style: BackingStyle): StyleGroove {
  return STYLE_GROOVES[style] ?? STYLE_GROOVES.swing;
}