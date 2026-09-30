/**
 * src/lib/slideshow.ts — beat-timed slideshow math, pure.
 *
 * Visual surfaces (LiveScoreDisplay, SynesthesiaCanvas, ConceptDrawer,
 * the rail, the lead sheet, …) already own their own playback state.
 * This module gives a NEW visual surface — a two-layer slideshow —
 * a deterministic phase anchor so the crossfade reads as a slow
 * breath against the beat instead of a hard cut.
 *
 * Why pure, no React:
 *   - the alpha curve is testable without a renderer / DOM / audio
 *     engine; pin it in a node test (PIN-001).
 *   - the consumer (Slideshow.tsx) reads `layerAtBeat(...)` on every
 *     frame and applies the result to `style.opacity`. No state,
 *     no rAF, no refs in this file.
 *
 * Contract:
 *   - beat is integer (the rail's `activeStepIndex`, 0-based, 1 step
 *     = 1 bar — the "ONE step per bar" F3 law that already
 *     drives every other visual surface).
 *   - barsPerLayer is the dwell for each layer BEFORE swap.
 *   - alpha(beat) is a cosine "breath" ramp: 1.0 at the swap
 *     boundary, 0.0 at the midpoint of the dwell, back to 1.0
 *     at the next swap. So at beat = 0 (start of layer 0), alpha
 *     is 1.0 and layer 0 is fully opaque; at beat =
 *     barsPerLayer - 1 (last beat of layer 0's dwell), alpha is
 *     ~0.0 and the next layer has fully crossfaded in.
 *
 * Defensive (PIN-001):
 *   - layerCount <= 0 returns safe defaults (alpha 1.0, layer 0)
 *     — the slideshow is a viewer, not a validator; a blank screen
 *     is worse than a wrong-but-visible layer.
 *   - barsPerLayer <= 0 returns the same safe defaults.
 *   - NaN / non-finite beats return safe defaults (alpha 1.0,
 *     activeLayer 0) so a stale tick from a desynced transport
 *     never blanks the screen.
 */

export interface SlideLayer {
  /** Stable id used by tests + aria announcements. */
  id: string;
  /** Display title (rendered inside the layer card). */
  title?: string;
  /** Display subtitle / one-line context. */
  subtitle?: string;
  /** Optional accent color (CSS color string) for the layer card. */
  accent?: string;
}

export interface SlideshowConfig {
  /** Two or more layers; the slideshow cycles through them. */
  layers: SlideLayer[];
  /** Dwell in bars per layer before swap. Must be >= 1. */
  barsPerLayer: number;
}

export interface LayerAtBeatResult {
  /** Index of the layer currently fading IN / on top (alpha ~ 1.0). */
  activeLayer: number;
  /** Index of the layer currently fading OUT / behind (alpha ~ 0.0). */
  otherLayer: number;
  /**
   * Opacity of the ACTIVE layer, in [0, 1]. The other layer
   * is implicitly `1 - alpha`. A cosine breath: 1.0 at the
   * swap boundary, 0.0 at the midpoint of the dwell.
   */
  alpha: number;
}

/**
 * Which layer is on top at the given beat, and how visible it is.
 *
 * The curve is `cos(pi * t)` where `t = beatWithinDwell /
 * (barsPerLayer - 1)`, mapped to `[1, 0]` and clamped. So:
 *   - beat = 0             -> alpha = 1.0 (active = 0)
 *   - beat = barsPerLayer  -> alpha = 1.0 (just swapped; active = 1)
 *   - beat = (barsPerLayer-1)  -> alpha ~ 0.0 (fully crossfaded)
 *
 * Multi-layer wraps: at beat = 3 * barsPerLayer with layerCount = 3
 * and barsPerLayer = 4, activeLayer = 3 % 3 = 0 (next dwell starts).
 */
export function layerAtBeat(args: {
  beat: number;
  barsPerLayer: number;
  layerCount: number;
}): LayerAtBeatResult {
  const { beat, barsPerLayer, layerCount } = args;

  // Defensive: bad inputs must NEVER blank the screen (PIN-001).
  // The transport can hand us NaN if its own timer glitched; the
  // slideshow is a viewer, not the transport — degrade gracefully.
  if (
    !Number.isFinite(beat) ||
    !Number.isFinite(barsPerLayer) ||
    !Number.isFinite(layerCount) ||
    layerCount <= 0
  ) {
    return { activeLayer: 0, otherLayer: 0, alpha: 1 };
  }
  if (barsPerLayer <= 0) {
    return { activeLayer: 0, otherLayer: 0, alpha: 1 };
  }

  // layerCount === 1 is a legal degenerate case (single layer
  // pinned, no crossfade). activeLayer = otherLayer = 0, alpha
  // always 1.0 so the layer never disappears.
  if (layerCount === 1) {
    return { activeLayer: 0, otherLayer: 0, alpha: 1 };
  }

  // Wrap the beat into [0, barsPerLayer * layerCount) so we don't
  // grow without bound across a long session. Math.floor on a
  // negative beat would round the wrong way for negative inputs;
  // clamp first to keep behavior sane if a caller hands us -1
  // (e.g. before the rail has ticked).
  const safeBeat = Math.max(0, beat);
  const dwell = Math.floor(safeBeat / barsPerLayer);
  const beatWithinDwell = safeBeat - dwell * barsPerLayer;
  const activeLayer = dwell % layerCount;
  const otherLayer = (activeLayer + 1) % layerCount;

  // Cosine breath: cos(pi * t) where t in [0, 1]. We map that
  // [-1, +1] swing to [1, 0] so alpha starts at 1 (just swapped
  // IN), drops to 0 at the midpoint, and climbs back to 1 at
  // the next swap. For barsPerLayer === 1 we short-circuit to 1
  // (no crossfade room) — the divisor would divide by zero.
  let alpha: number;
  if (barsPerLayer <= 1) {
    alpha = 1;
  } else {
    const t = beatWithinDwell / (barsPerLayer - 1);
    alpha = (1 + Math.cos(Math.PI * t)) / 2;
  }

  return {
    activeLayer,
    otherLayer,
    alpha,
  };
}

/**
 * The beat index at which the next layer swap will happen.
 * Useful for "next: Bb chord chart in 2 bars" labels.
 *
 * Examples (barsPerLayer = 4):
 *   beat = 0   -> returns 4 (next swap is 4 beats away)
 *   beat = 3   -> returns 4 (we're in the LAST beat of this dwell)
 *   beat = 4   -> returns 8 (we just swapped; next in 4 more)
 *   beat = 100 -> returns 104
 *
 * Defensive: NaN / non-positive barsPerLayer returns 0 so a stale
 * consumer never renders "swap in -4 bars".
 */
export function swapBeat(args: { beat: number; barsPerLayer: number }): number {
  const { beat, barsPerLayer } = args;
  if (!Number.isFinite(beat) || !Number.isFinite(barsPerLayer) || barsPerLayer <= 0) {
    return 0;
  }
  const safeBeat = Math.max(0, beat);
  const dwell = Math.floor(safeBeat / barsPerLayer);
  return (dwell + 1) * barsPerLayer;
}