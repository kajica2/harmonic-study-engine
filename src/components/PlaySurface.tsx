/**
 * src/components/PlaySurface.tsx - PRD-001 Phase 8 S1 (D148): the
 * /play?idea=<base64> minimal page (REQ-IO-52).
 *
 * NOT a router surface: main.tsx branches here on one pathname check
 * and App NEVER mounts - no boot effects, no URL writer, so the
 * shared link stays pristine (no mode/transpose pollution; the
 * minimal UI the PRD asked for).
 *
 * THE AUTOPLAY CONTRACT (honest): "immediately plays it" is
 * physically impossible cold - browsers suspend AudioContext until a
 * user gesture. The ARMED state is the answer: the idea is shown
 * with ONE big Play button (autofocus - Space/Enter IS the gesture);
 * the click plays through the shipped exploreHear machinery
 * (ideaHear -> composePreviewPlayer singleton; no new AudioContext,
 * no new transport - ADR-020). NO auto-play attempt on load (D148
 * rejected option (d): a gesture-less suspended context is a leak +
 * console noise).
 *
 * States: ARMED (playable kind) / PLAYING (Stop; auto-return to
 * Replay on end - the data-preview pattern) / EMPTY (missing,
 * malformed, or the scale/seed carve - idea summary if decodable +
 * the honest CTA line + a plain <a href="/"> into the full app).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Idea } from "../../engine/core/idea";
import { decodeIdeaParam } from "../lib/ideaShare";
import { ideaToPlayCard, playIdea, stopIdea } from "../lib/ideaHear";
import { composePreviewPlayer } from "../lib/composePreview";

/** Kind + payload summary - ASCII only (the hyphen is deliberate). */
export function ideaSummaryText(idea: Idea): string {
  switch (idea.kind) {
    case "chord":
      return `chord - ${idea.chord ?? ""}`;
    case "progression":
      return `progression - ${(idea.progression ?? []).join(" ")}`;
    case "melody":
      return `melody - ${idea.melody?.length ?? 0} notes`;
    case "scale":
      return `scale - ${idea.scale ?? ""}`;
    case "seed":
      return `seed - ${idea.seed ?? ""}`;
  }
}

export const PlaySurface: React.FC = () => {
  // Decode ONCE from the pristine URL (App's writer never runs here).
  const idea = useMemo<Idea | null>(
    () =>
      decodeIdeaParam(
        new URLSearchParams(window.location.search).get("idea"),
      ),
    [],
  );
  // null card = the honest carve (scale/seed/empty payload).
  const playable = idea !== null && ideaToPlayCard(idea) !== null;

  // The shipped singleton's state machine drives PLAYING (one
  // subscription, StrictMode-safe; unmount stops - the singleton's
  // own law, the ExploreSurface mirror pattern).
  const [playerState, setPlayerState] = useState(() =>
    composePreviewPlayer.getState(),
  );
  useEffect(() => composePreviewPlayer.subscribe(setPlayerState), []);
  useEffect(
    () => () => {
      composePreviewPlayer.stop();
    },
    [],
  );

  const handlePlay = useCallback(() => {
    if (idea === null) return;
    // The click is the gesture autoplay requires; playIdea renders
    // through the shipped machinery (false = non-playable kind - the
    // armed state should never have offered it, belt + braces).
    playIdea(idea);
  }, [idea]);

  const handleStop = useCallback(() => {
    stopIdea();
  }, []);

  const isPlaying = playerState === "playing" || playerState === "rendering";
  const phase = !playable ? "empty" : isPlaying ? "playing" : "armed";

  return (
    <main
      data-testid="play-surface"
      data-state={phase}
      className="min-h-screen bg-[color:var(--color-bg-1)] flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6 rounded-2xl border border-[color:var(--color-border)] surface-1 p-8 text-center">
        <span className="t-label text-[color:var(--color-text-3)] uppercase tracking-widest">
          Harmonic Study Engine - shared idea
        </span>
        {idea !== null && (
          <p
            data-testid="play-idea-summary"
            className="t-mono text-lg text-[color:var(--color-text-1)] break-all"
          >
            {ideaSummaryText(idea)}
          </p>
        )}
        {phase === "armed" && (
          <div data-testid="play-armed" className="flex flex-col items-center gap-3">
            <button
              type="button"
              data-testid="play-button"
              aria-label="Play idea"
              autoFocus
              onClick={handlePlay}
              className="px-8 py-4 rounded-full text-base font-semibold bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand)]"
            >
              Play
            </button>
            <p className="text-xs t-mono text-[color:var(--color-text-3)]">
              One tap to play - browsers keep audio asleep until you
              interact.
            </p>
          </div>
        )}
        {phase === "playing" && (
          <div data-testid="play-playing" className="flex flex-col items-center gap-3">
            <button
              type="button"
              data-testid="play-stop-button"
              aria-label="Stop idea"
              onClick={handleStop}
              className="px-8 py-4 rounded-full text-base font-semibold border border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10 hover:bg-[color:var(--color-brand)]/20"
            >
              Stop
            </button>
            <p className="text-xs t-mono text-[color:var(--color-text-3)]">
              Playing - it returns to Replay when the idea ends.
            </p>
          </div>
        )}
        {phase === "empty" && (
          <div data-testid="play-empty" className="flex flex-col items-center gap-3">
            <p className="text-sm text-[color:var(--color-text-2)]">
              {idea === null
                ? "This link has no playable idea - open the full app to make one."
                : "This idea kind needs the full app - pick a voicing or generate there."}
            </p>
          </div>
        )}
        {phase !== "playing" && (
          <a
            href="/"
            data-testid="play-open-app"
            className="text-sm t-mono text-[color:var(--color-brand)] hover:underline"
          >
            Open the full app
          </a>
        )}
      </div>
    </main>
  );
};
