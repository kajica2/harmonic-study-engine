/**
 * src/components/IdeaBar.tsx - PRD-001 REQ-MODE-6, REQ-IDEA-3.
 *
 * Sticky-bottom bar inside <main> (per D8). Sits above the existing
 * fixed MobileCommandBar on mobile via an extra pb wrapper. Shows the
 * current Idea as a chip + Send-to-Mode / Save / Share actions.
 *
 * Phase 5 completion (D98): all three Send arms are wired.
 *   - Send-to-Compose: chord/progression Ideas transplant literally
 *     via the chart-text path (D97); other kinds warn honestly (the
 *     surface boots from currentIdea - never a dead end).
 *   - Send-to-Etude: constraints-carry (D97b) via setEtudeConstraints
 *     (NOT acceptEtude - no dirty; the user presses Generate).
 *   - Send-to-Explore: requestMode only (currentIdea is the carrier;
 *     ExploreSurface boots its seed from it).
 *   - Save button writes the current Idea to `hse.ideas` (capped 100).
 *   - Share button builds a `?idea=<base64>` URL and copies it to the
 *     clipboard. Server-less; the URL is the share channel
 *     (REQ-IO-50). Emits a console.warn for now per D6 (the warn is
 *     allowed by tests/no-debug-logs.test.ts).
 *
 * The bar's action cluster renders disabled when there is no current
 * idea (Save/Share) - matching the affordance honesty rule from D8.
 *
 * HIGH-003 (Phase 1 fix-round): the empty-state `+` button is no
 * longer a placeholder. When a path is loaded it mints an Idea from
 * the active step (transposed by the global transposeShift) via
 * setCurrentIdea(ideaFromChord(...)). When no path is loaded the
 * button stays visible as a permanent affordance but renders disabled
 * with a "No chord yet" title so the user knows why.
 */

import React, { useCallback, useState } from "react";
import { X } from "lucide-react";
import { useSessionStore, type Mode } from "../state/sessionStore";
import type { Idea } from "../../engine/core/idea";
import { ideaFromChord } from "../../engine/core/idea";
import {
  ideaToSeedText,
  parseExploreSeed,
} from "../../engine/explore/seeds";
import {
  cardToEtudeConstraints,
  progressionToChartText,
} from "../../engine/explore/cards";
import { cardId } from "../../engine/explore/types";
import {
  buildChartSession,
  parseChordChart,
} from "../../engine/compose/chordchart";
import { DEFAULT_ETUDE_CONSTRAINTS } from "../lib/etudeEngine";
import { transposeChordName } from "../lib/theory";
import type { HarmonicStep } from "../lib/paths";

const EMPTY_COPY = "Play something or generate an etude to start an idea.";

const SEND_OPTIONS: ReadonlyArray<{
  value: Mode | "__placeholder";
  label: string;
  disabled?: boolean;
  hint?: string;
}> = [
  { value: "compose", label: "Send to Compose", hint: "Send chord/progression to the chart grid" },
  { value: "etude", label: "Send to Etude" },
  { value: "explore", label: "Send to Explore", hint: "Open in Explore" },
];

function buildShareUrl(idea: Idea): string {
  const json = JSON.stringify(idea);
  // base64 of UTF-8 (btoa requires latin-1; we encodeURIComponent
  // first to escape non-ASCII bytes defensively).
  const b64 = btoa(encodeURIComponent(json));
  const search = `?idea=${encodeURIComponent(b64)}`;
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}${search}`;
}

export interface IdeaBarProps {
  /** The currently active step in the loaded path, or null when no
   *  path is loaded. Drives the empty-state + button. */
  activeStep?: HarmonicStep | null;
  /** Global transpose shift (semitones). Applied to the chord name
   *  when minting an Idea from the active step. */
  transposeShift?: number;
}

export const IdeaBar: React.FC<IdeaBarProps> = ({
  activeStep = null,
  transposeShift = 0,
}) => {
  const idea = useSessionStore((s) => s.currentIdea);
  const saveCurrentIdea = useSessionStore((s) => s.saveCurrentIdea);
  const setCurrentIdea = useSessionStore((s) => s.setCurrentIdea);
  const requestMode = useSessionStore((s) => s.requestMode);

  const [sendTarget, setSendTarget] = useState<string>("__placeholder");
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const handleSend = useCallback(
    (target: Mode | "__placeholder") => {
      if (target === "__placeholder") return;
      const store = useSessionStore.getState();
      const current = store.currentIdea;
      if (target === "compose") {
        // D97: chord/progression Ideas transplant literally through
        // the chart-text path; other kinds warn + still navigate (the
        // surface boots from currentIdea - never a dead end).
        const seed = parseExploreSeed(
          current === null ? "" : ideaToSeedText(current),
        );
        const progression =
          seed.kind === "chord" && seed.chord !== null
            ? [seed.chord]
            : seed.kind === "progression" && seed.progression !== null
              ? [...seed.progression]
              : null;
        if (progression === null) {
          // eslint-disable-next-line no-console
          console.warn(
            "[IdeaBar] Send-to-Compose: only chord/progression ideas transplant literally",
          );
        } else {
          const text = progressionToChartText(progression, null);
          const parsed = parseChordChart(text);
          if (!parsed.ok) {
            // eslint-disable-next-line no-console
            console.warn(
              "[IdeaBar] Send-to-Compose: chart parse failed, opening Compose anyway",
            );
          } else {
            const { project, analysis } = buildChartSession(parsed.value);
            store.setComposeChart(text, project, analysis);
          }
        }
      } else if (target === "etude") {
        // D97b: constraints-carry (key/mode/bars/seed), never a
        // literal symbol transplant. setEtudeConstraints, NOT
        // acceptEtude - no dirty; the user presses Generate.
        if (current !== null) {
          const base = store.etudeConstraints ?? DEFAULT_ETUDE_CONSTRAINTS;
          const text = ideaToSeedText(current);
          const seed = parseExploreSeed(text);
          const carried = cardToEtudeConstraints(
            {
              id: cardId(text, "substitute", 0),
              progression:
                seed.kind === "chord" && seed.chord !== null
                  ? [seed.chord]
                  : seed.kind === "progression" && seed.progression !== null
                    ? [...seed.progression]
                    : null,
              melody: current.melody,
            },
            base,
          );
          store.setEtudeConstraints(
            current.kind === "seed" && current.seed !== null
              ? { ...carried, seed: current.seed }
              : carried,
          );
        }
      }
      // Explore arm: requestMode only - currentIdea is already the
      // carrier (ExploreSurface boots its seed from it).
      requestMode(target);
      setSendTarget("__placeholder");
    },
    [requestMode],
  );

  const handleSave = useCallback(() => {
    saveCurrentIdea();
    // eslint-disable-next-line no-console
    console.warn("[IdeaBar] Save: snapshot stored at hse.ideas");
  }, [saveCurrentIdea]);

  const handleShare = useCallback(async () => {
    if (!idea) return;
    const url = buildShareUrl(idea);
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Share link copied to clipboard.");
      } else {
        setShareStatus("Share link ready (clipboard unavailable).");
      }
    } catch {
      setShareStatus("Share link ready (clipboard blocked).");
    }
    // eslint-disable-next-line no-console
    console.warn("[IdeaBar] Share: not yet implemented -- Phase 8");
  }, [idea]);

  const handleClear = useCallback(() => {
    setCurrentIdea(null);
  }, [setCurrentIdea]);

  const handleMintFromActiveStep = useCallback(() => {
    if (!activeStep) return;
    const chord = transposeChordName(activeStep.name, transposeShift);
    setCurrentIdea(ideaFromChord("etude", chord, Date.now()));
  }, [activeStep, transposeShift, setCurrentIdea]);

  return (
    <div
      data-testid="idea-bar"
      className="sticky bottom-0 z-10 mt-4 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 surface-1 border-t border-[color:var(--color-border)] h-16"
    >
      <div className="flex items-center gap-3 max-w-screen-2xl mx-auto h-full">
        {/* LEFT: idea chip */}
        {idea ? (
          <div
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 surface-2 border-l-2 border-[color:var(--color-brand-strong)] max-w-[40ch]"
          >
            <span className="t-mono text-sm text-[color:var(--color-text-1)] truncate">
              {idea.chord ?? idea.scale ?? idea.kind}
            </span>
            <span className="text-[10px] t-mono text-[color:var(--color-text-3)] uppercase tracking-wider">
              from {idea.source}
            </span>
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear current idea"
              className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded text-neutral-400 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 text-[color:var(--color-text-3)] italic text-xs">
            <span>{EMPTY_COPY}</span>
            <button
              type="button"
              aria-label="Create idea from current chord"
              title={activeStep ? "Create idea from current chord" : "No chord yet"}
              onClick={handleMintFromActiveStep}
              disabled={!activeStep}
              className={
                activeStep
                  ? "inline-flex items-center justify-center w-6 h-6 rounded surface-2 border border-[color:var(--color-border)] text-neutral-400 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
                  : "inline-flex items-center justify-center w-6 h-6 rounded surface-2 border border-[color:var(--color-border)] text-neutral-400 opacity-50 cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
              }
            >
              +
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* RIGHT: actions */}
        <select
          aria-label="Send idea to mode"
          value={sendTarget}
          onChange={(e) => handleSend(e.target.value as Mode | "__placeholder")}
          disabled={!idea}
          className="bg-neutral-900 border border-[color:var(--color-border)] text-neutral-300 text-xs rounded px-2 py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="__placeholder">Send to...</option>
          {SEND_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              title={opt.hint}
            >
              {opt.label}
              {opt.disabled ? " (coming soon)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={!idea}
          className="px-3 py-1.5 rounded bg-neutral-900 border border-[color:var(--color-border)] text-neutral-300 text-xs font-medium hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleShare}
          disabled={!idea}
          className="px-3 py-1.5 rounded bg-neutral-900 border border-[color:var(--color-border)] text-neutral-300 text-xs font-medium hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Share
        </button>
      </div>
      {shareStatus && (
        <div
          role="status"
          aria-live="polite"
          className="text-[10px] t-mono text-[color:var(--color-text-3)] mt-1 max-w-screen-2xl mx-auto"
        >
          {shareStatus}
        </div>
      )}
    </div>
  );
};