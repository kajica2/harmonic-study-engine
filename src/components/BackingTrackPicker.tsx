/**
 * src/components/BackingTrackPicker.tsx — load a user-provided audio
 * source (`.mov`, `.mpg`, `.mp4`) as a backing track for practice.
 *
 * The user clicks "Load backing", picks a video file, and the engine
 * plays its audio track during practice sessions. The video element
 * is hidden — we only care about the audio.
 *
 * Why use `<video>` for audio files: most browsers only decode the
 * audio track of a video container when the file is loaded into a
 * `<video>` element (or `<audio>` for some formats). Using a hidden
 * `<video>` element handles all three requested extensions uniformly
 * without needing codec-specific decoding.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  createBackingTrack,
  formatBackingTrackSize,
  validateBackingTrackFile,
  type BackingTrackFile,
} from "../lib/backingTrack";
import { Music, X } from "lucide-react";

export interface BackingTrackPickerProps {
  /** Currently loaded track, or null. */
  track: BackingTrackFile | null;
  /** Called when the user picks a valid file. */
  onLoaded: (track: BackingTrackFile) => void;
  /** Called when the user removes the current track. */
  onUnloaded: () => void;
  /** Auto-play state from the engine — when true, the backing track
   * should play in sync; when false, pause. */
  isPlayingAuto: boolean;
  /** Whether the backing track is muted (user toggle). */
  muted: boolean;
  /** Toggle the backing track's mute state. */
  onToggleMuted: () => void;
}

export const BackingTrackPicker: React.FC<BackingTrackPickerProps> = ({
  track,
  onLoaded,
  onUnloaded,
  isPlayingAuto,
  muted,
  onToggleMuted,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the video element's playback in sync with the engine's
  // auto-play state. We seek to 0 on each play so the backing track
  // restarts with the path. (Looping within a single path is the
  // engine's job — we just provide the audio source.)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlayingAuto && track) {
      v.currentTime = 0;
      v.play().catch(() => {
        // Autoplay can be blocked if the user hasn't interacted yet;
        // surface a friendly hint and let the next user click resume.
        setError("Click anywhere first, then press Play to start the backing track");
      });
    } else {
      v.pause();
    }
  }, [isPlayingAuto, track]);

  // Keep the muted prop in sync with the underlying element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;
    const verdict = validateBackingTrackFile(file);
    if (!verdict.ok) {
      setError(verdict.reason ?? "Invalid file");
      e.target.value = "";
      return;
    }
    try {
      const t = createBackingTrack(file);
      onLoaded(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    // Reset the input so picking the same file twice in a row still
    // triggers onChange.
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Hidden <input type="file"> — the visible button below clicks
          it. Hidden because we want a styled trigger, not the browser
          default. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={handleChange}
        className="sr-only"
        aria-label="Load backing track (.mov, .mpg, or .mp4)"
        data-testid="backing-track-input"
      />
      {/* The hidden <video> element that does the actual audio
          playback. `display:none` would suppress audio in some
          browsers, so we use absolute positioning off-screen with
          zero size. */}
      {track && (
        <video
          ref={videoRef}
          src={track.url}
          preload="auto"
          loop
          playsInline
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: "none",
            left: -9999,
          }}
        />
      )}
      <div className="flex items-center gap-2">
        {!track ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded border border-neutral-800 transition-colors text-neutral-300 hover:text-white text-xs"
            data-testid="backing-track-load"
            title="Load a .mov, .mpg, or .mp4 file to practice along with"
          >
            <Music size={14} className="text-cyan-400" />
            <span>Backing track</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMuted}
              className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded border border-neutral-800 transition-colors text-neutral-300 hover:text-white text-xs"
              data-testid="backing-track-toggle"
              aria-pressed={muted}
              title={
                muted
                  ? `Resume backing track (${track.name})`
                  : `Mute backing track (${track.name})`
              }
            >
              <Music size={14} className={muted ? "text-neutral-500" : "text-cyan-400"} />
              <span className="font-mono">
                {muted ? "○" : "●"} {shortName(track.name)}
              </span>
            </button>
            <button
              type="button"
              onClick={onUnloaded}
              className="flex items-center justify-center w-7 h-7 rounded border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              data-testid="backing-track-remove"
              aria-label={`Remove backing track (${track.name}, ${formatBackingTrackSize(track.sizeBytes)})`}
              title="Remove backing track"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      {error && (
        <div
          className="text-[11px] text-red-400 font-mono mt-1"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}
    </div>
  );
};

/** Truncate long filenames to keep the toolbar compact. */
function shortName(name: string, max = 18): string {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const stem = name.slice(0, name.length - ext.length);
  return `${stem.slice(0, max - ext.length - 1)}…${ext}`;
}
