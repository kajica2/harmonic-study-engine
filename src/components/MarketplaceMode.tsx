/**
 * src/components/MarketplaceMode.tsx - marketplace surface.
 *
 * Lists published backing tracks from the FastAPI backend and lets
 * the user preview one: selecting a card plays its audio_url through
 * a local HTMLAudioElement and runs the beat-timed <Slideshow />.
 *
 * Standalone by design (per the architect spec): the preview does NOT
 * couple to playbackClock or the practice audio engine. The beat
 * source is a local setInterval ticker derived from the listing's
 * tempo via beatAtElapsed (pure, src/lib/marketplace.ts). The ticker
 * starts on play, stops on pause / audio end / unmount.
 *
 * Degraded states:
 *   - Backend unreachable / non-ok -> "Marketplace backend offline"
 *     mirroring the checkDDSPStatus pattern (typed failure, never
 *     throw).
 *   - Backend reachable but zero listings -> honest empty state.
 *
 * Accessibility:
 *   - Listing cards are real buttons with aria-labels + aria-pressed.
 *   - focus-visible rings on every interactive element.
 *   - aria-live announcements for load state and playback state.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slideshow } from "./Slideshow";
import {
  MARKETPLACE_SERVER,
  fetchListings,
  beatAtElapsed,
  buildSlideshowLayers,
  isActiveAudio,
  type Listing,
} from "../lib/marketplace";

type LoadState = "loading" | "ready" | "offline";

const TICKER_MS = 100;
const FALLBACK_BPM = 120;

const cardClass =
  "surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-lg)] " +
  "p-4 text-left flex flex-col gap-1.5 transition-colors " +
  "hover:border-[color:var(--color-brand-strong)] " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-brand)] " +
  "aria-pressed:border-[color:var(--color-brand-strong)] " +
  "aria-pressed:bg-[color:var(--color-brand-muted)]";

const chipClass =
  "text-[10px] t-mono px-2 py-0.5 rounded-full border border-[color:var(--color-border)] " +
  "text-[color:var(--color-text-3)]";

export const MarketplaceMode: React.FC = () => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  // Fetch listings once on mount. StrictMode double-invoke is safe:
  // the cancelled flag drops the first result and the GET is
  // idempotent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchListings(MARKETPLACE_SERVER);
      if (cancelled) return;
      if (result.ok) {
        setListings(result.listings);
        setLoadState("ready");
      } else {
        setLoadError(result.error);
        setLoadState("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopPlayback = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (audioRef.current !== null) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setBeat(0);
  }, []);

  // Cleanup on unmount (also covers StrictMode's simulated unmount).
  useEffect(() => stopPlayback, [stopPlayback]);

  const startPlayback = useCallback(
    (listing: Listing) => {
      stopPlayback();
      setSelectedId(listing.id);

      const audio = new Audio(listing.audio_url);
      audioRef.current = audio;
      // Identity-guard every callback: play() resolves asynchronously,
      // so Stop or a newer card can supersede this element before its
      // promise settles. A stale .then() must not set isPlaying or
      // start a ticker, and a superseded element's onended/onerror
      // must not kill the current playback (isActiveAudio, PIN-001).
      audio.onended = () => {
        if (isActiveAudio(audioRef.current, audio)) stopPlayback();
      };
      audio.onerror = () => {
        if (isActiveAudio(audioRef.current, audio)) stopPlayback();
      };

      audio
        .play()
        .then(() => {
          if (!isActiveAudio(audioRef.current, audio)) return;
          setIsPlaying(true);
          startedAtRef.current = performance.now();
          const bpm =
            listing.tempo !== null && listing.tempo > 0
              ? listing.tempo
              : FALLBACK_BPM;
          if (tickerRef.current !== null) {
            window.clearInterval(tickerRef.current);
          }
          tickerRef.current = window.setInterval(() => {
            const elapsed = performance.now() - startedAtRef.current;
            setBeat(beatAtElapsed(elapsed, bpm));
          }, TICKER_MS);
        })
        .catch(() => {
          // Autoplay blocked or a bad audio_url - stop cleanly so the
          // card does not look "playing" while silent. A superseded
          // element must NOT stop the current playback.
          if (!isActiveAudio(audioRef.current, audio)) return;
          stopPlayback();
        });
    },
    [stopPlayback],
  );

  const selected = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  const slideshow = useMemo(
    () => (selected !== null ? buildSlideshowLayers(selected) : null),
    [selected],
  );

  return (
    <section
      aria-label="Marketplace"
      className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4"
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="t-h1 text-[color:var(--color-text-1)]">Marketplace</h2>
          <span className="t-label text-[color:var(--color-text-3)]">
            backing tracks
          </span>
        </div>
        {loadState === "ready" && (
          <span className="t-mono text-[color:var(--color-text-3)] whitespace-nowrap">
            {listings.length} {listings.length === 1 ? "listing" : "listings"}
          </span>
        )}
      </header>

      {loadState === "loading" && (
        <p role="status" className="t-small text-[color:var(--color-text-2)]">
          Loading listings...
        </p>
      )}

      {loadState === "offline" && (
        <div
          role="status"
          className="surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-1"
        >
          <p className="text-sm font-semibold text-[color:var(--color-text-1)]">
            Marketplace backend offline
          </p>
          <p className="t-small text-[color:var(--color-text-2)]">
            Start the local backend (npm run dev:backend) to browse
            published backing tracks.
          </p>
          {loadError.length > 0 && (
            <p className="t-mono text-[10px] text-[color:var(--color-text-3)]">
              {loadError}
            </p>
          )}
        </div>
      )}

      {loadState === "ready" && listings.length === 0 && (
        <p role="status" className="t-small text-[color:var(--color-text-2)]">
          No published listings yet.
        </p>
      )}

      {loadState === "ready" && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {listings.map((listing) => {
            const isSelected = selectedId === listing.id;
            return (
              <button
                key={listing.id}
                type="button"
                aria-label={`Play ${listing.title} by ${listing.composer}`}
                aria-pressed={isSelected && isPlaying}
                onClick={() => startPlayback(listing)}
                className={cardClass}
              >
                <span className="text-sm font-semibold text-[color:var(--color-text-1)] truncate">
                  {listing.title}
                </span>
                <span className="t-small text-[color:var(--color-text-2)] truncate">
                  {listing.composer}
                </span>
                <span className="flex flex-wrap gap-1.5 mt-1">
                  {listing.key !== null && (
                    <span className={chipClass}>Key: {listing.key}</span>
                  )}
                  {listing.tempo !== null && (
                    <span className={chipClass}>Tempo: {listing.tempo}</span>
                  )}
                  {listing.form !== null && (
                    <span className={chipClass}>Form: {listing.form}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected !== null && slideshow !== null && (
        <div className="flex flex-col gap-3">
          <Slideshow
            layers={slideshow.layers}
            barsPerLayer={slideshow.barsPerLayer}
            isPlaying={isPlaying}
            beat={beat}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={isPlaying ? "Stop preview" : "Play preview"}
              onClick={() => {
                if (isPlaying) stopPlayback();
                else startPlayback(selected);
              }}
              className="px-3 py-1.5 rounded border border-[color:var(--color-border)] text-xs font-semibold text-neutral-300 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-brand)]"
            >
              {isPlaying ? "Stop" : "Play"}
            </button>
            <span className="t-small text-[color:var(--color-text-2)] truncate">
              {selected.title} - {selected.composer}
            </span>
          </div>
          <span aria-live="polite" className="sr-only">
            {isPlaying
              ? `Now playing ${selected.title}`
              : "Preview stopped"}
          </span>
        </div>
      )}
    </section>
  );
};