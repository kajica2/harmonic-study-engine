/**
 * src/components/Slideshow.tsx — beat-timed two-layer slideshow.
 *
 * Renders two absolutely-positioned layer cards stacked inside
 * one wrapper. The active layer's opacity is driven by
 * `layerAtBeat(...)` from src/lib/slideshow.ts, phase-locked to
 * the rail's `activeStepIndex` (1 step = 1 bar, the F3 honest
 * bar unit every other visual surface uses).
 *
 * Behavior:
 *   - isPlaying=true AND not reduced-motion: crossfade between
 *     layers on a cosine breath over `barsPerLayer` beats.
 *   - isPlaying=true AND reduced-motion: pin to the first layer
 *     (no animation, no surprise).
 *   - isPlaying=false: pin to the first layer at full alpha
 *     (a "paused" slideshow should look stable, not frozen mid-
 *     fade).
 *
 * Accessibility:
 *   - aria-live="polite" announces layer transitions to screen
 *     readers.
 *   - Focus-visible ring on the wrapper.
 *   - Compositor-only transforms/opacity (no layout thrash).
 *
 * MVP scope: 2-3 default layers per practice session ("Chord
 * chart" / "Voicing inspector" / "Take recent"). Layers are a
 * prop so callers can swap them; the slideshow itself is dumb.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  layerAtBeat,
  swapBeat,
  type SlideLayer,
} from "../lib/slideshow";
import { Sparkles } from "lucide-react";

export interface SlideshowProps {
  /** Two or more layers; the slideshow cycles through them. */
  layers: SlideLayer[];
  /** Dwell in bars per layer before swap. */
  barsPerLayer?: number;
  /** When false, the slideshow pins to layer 0 (no animation). */
  isPlaying: boolean;
  /**
   * Current beat index (0-based). Provided by the parent — the
   * rail uses activeStepIndex (1 step = 1 bar per F3 D110).
   */
  beat: number;
  /** Optional className passthrough (width / margin). */
  className?: string;
}

/**
 * Read `prefers-reduced-motion: reduce` once per mount. Returns
 * false during SSR (no `window`) so the first render uses the
 * full animation; an effect upgrades to reduced-motion if the
 * user has it set. Cheap, no listener subscription — the slideshow
 * is mounted for a session, the user's setting rarely changes.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    // No listener — slideshow lifetime is short, refreshes pick
    // up the new value. Adding a listener here would need a
    // teardown, more code for a marginal UX gain.
  }, []);
  return reduced;
}

export const Slideshow: React.FC<SlideshowProps> = ({
  layers,
  barsPerLayer = 4,
  isPlaying,
  beat,
  className = "",
}) => {
  const reducedMotion = usePrefersReducedMotion();

  // Stable IDs for the aria-live announcement. Memoized so the
  // last-announced-id survives re-renders (avoids spamming the
  // screen reader every frame).
  const lastAnnouncedIdRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");

  // Defensive: empty layers array — render nothing instead of
  // throwing. A user with a malformed config shouldn't get a
  // crashed practice session.
  const safeLayers = layers.length > 0 ? layers : [];
  const safeBarsPerLayer = barsPerLayer > 0 ? barsPerLayer : 1;

  // Derive the active layer + alpha on every render. The math
  // is pure + cheap (no allocations beyond the result object).
  // When paused, pin to layer 0 at alpha 1 — a stable frame is
  // better than a frozen mid-fade.
  const derived = useMemo(() => {
    if (!isPlaying || reducedMotion) {
      return {
        activeLayer: 0,
        otherLayer: 0,
        alpha: 1,
        swapInBeats: 0,
      };
    }
    const r = layerAtBeat({
      beat,
      barsPerLayer: safeBarsPerLayer,
      layerCount: safeLayers.length,
    });
    return {
      activeLayer: r.activeLayer,
      otherLayer: r.otherLayer,
      alpha: r.alpha,
      swapInBeats: swapBeat({ beat, barsPerLayer: safeBarsPerLayer }) - beat,
    };
  }, [isPlaying, reducedMotion, beat, safeBarsPerLayer, safeLayers.length]);

  // Update the aria-live announcement only when the active layer
  // CHANGES (not on every alpha tick). Cheap: one ref read per
  // frame, one setState on transition.
  useEffect(() => {
    const layer = safeLayers[derived.activeLayer];
    if (!layer) return;
    if (lastAnnouncedIdRef.current === layer.id) return;
    lastAnnouncedIdRef.current = layer.id;
    setAnnouncement(
      layer.title
        ? `Layer ${layer.title}`
        : `Layer ${layer.id}`,
    );
  }, [derived.activeLayer, safeLayers]);

  if (safeLayers.length === 0) {
    return null;
  }

  const activeLayerObj = safeLayers[derived.activeLayer];
  const otherLayerObj = safeLayers[derived.otherLayer] ?? safeLayers[0];

  // Wrapper height fixed by the tallest layer's content; in MVP
  // both layers are short text blocks so a single height suffices.
  // The accent color falls back to brass if a layer didn't pass one.
  const activeAccent = activeLayerObj.accent ?? "var(--color-brand)";
  const otherAccent = otherLayerObj.accent ?? "var(--color-brand)";

  return (
    <section
      aria-label="Practice slideshow"
      aria-live="polite"
      className={`relative surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-brand)] ${className}`}
      tabIndex={0}
    >
      {/* Eyebrow / status row — what layer is on top, and how
          many beats until the swap. Uses the same t-label rhythm
          as the rest of the app. */}
      <header className="flex items-baseline justify-between gap-3 px-4 sm:px-5 pt-3 pb-2 border-b border-[color:var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles
            size={14}
            className="text-[color:var(--color-brand-strong)] flex-shrink-0"
            aria-hidden="true"
          />
          <span className="t-label text-[color:var(--color-text-3)]">
            Slideshow
          </span>
          {isPlaying && !reducedMotion && derived.swapInBeats > 0 && (
            <span className="t-mono text-[color:var(--color-text-3)] truncate">
              next swap in {derived.swapInBeats} {derived.swapInBeats === 1 ? "beat" : "beats"}
            </span>
          )}
          {!isPlaying && (
            <span className="t-mono text-[color:var(--color-text-3)] truncate">
              paused
            </span>
          )}
          {isPlaying && reducedMotion && (
            <span className="t-mono text-[color:var(--color-text-3)] truncate">
              reduced motion
            </span>
          )}
        </div>
        <span className="t-mono text-[color:var(--color-text-3)] whitespace-nowrap">
          {derived.activeLayer + 1}/{safeLayers.length}
        </span>
      </header>

      {/* Layer stack — two absolutely-positioned cards, opacity
          driven by the pure helper. compositor-only animation. */}
      <div
        className="relative w-full"
        style={{ minHeight: 92 }}
        aria-hidden="true"
      >
        {/* The OTHER layer sits BELOW. Its opacity is (1 - alpha)
            so the two layers always sum to 1 — no flash, no
            blank frame. */}
        <LayerCard
          layer={otherLayerObj}
          opacity={1 - derived.alpha}
          accent={otherAccent}
          zIndex={0}
        />
        {/* The ACTIVE layer sits ON TOP. opacity = alpha. */}
        <LayerCard
          layer={activeLayerObj}
          opacity={derived.alpha}
          accent={activeAccent}
          zIndex={1}
        />
      </div>

      {/* sr-only announcement string — populated only on layer
          transitions, so screen readers hear "Layer Bb chart"
          instead of a tick spam. */}
      <span className="sr-only">{announcement}</span>
    </section>
  );
};

interface LayerCardProps {
  layer: SlideLayer;
  /** 0..1 — driven by layerAtBeat / paused state. */
  opacity: number;
  /** CSS color for the accent strip + title. */
  accent: string;
  /** Stacking — active on top. */
  zIndex: number;
}

const LayerCard: React.FC<LayerCardProps> = ({
  layer,
  opacity,
  accent,
  zIndex,
}) => {
  return (
    <div
      className="absolute inset-0 px-4 sm:px-5 py-4 flex flex-col gap-1.5"
      style={{
        opacity,
        // `will-change: opacity` hints the compositor this layer
        // is animatable; harmless if unsupported.
        willChange: "opacity",
        zIndex,
        // visibility:hidden at alpha 0 lets the browser skip
        // hit-testing but keeps the layer painted for the
        // compositor to flip back without a reflow.
        visibility: opacity <= 0.001 ? "hidden" : "visible",
      }}
      data-layer-id={layer.id}
    >
      <div
        className="h-1 w-10 rounded-full"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
      <div className="t-h1 text-[color:var(--color-text-1)] truncate">
        {layer.title ?? layer.id}
      </div>
      {layer.subtitle && (
        <div className="t-small text-[color:var(--color-text-2)] truncate">
          {layer.subtitle}
        </div>
      )}
    </div>
  );
};