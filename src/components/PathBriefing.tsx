import React, { useEffect, useState } from "react";
import { briefingForPath } from "../lib/pathBriefing";
import { X, Sparkles } from "lucide-react";

/**
 * PathBriefing — practice-loop briefing card.
 *
 * Renders a 2-3 line card above the live score when the active
 * path has a masterclass entry. The card surfaces the curated
 * "when you open this path, …" objective, plus the canonical
 * description (composer / era / form) for context.
 *
 * Dismissable per-session via the × button. The dismissal persists
 * to localStorage so the same path doesn't re-prompt the user on
 * the next reload — they have to opt back in by reloading or by
 * hitting "reset briefings" elsewhere (not built yet).
 *
 * Pure presentational component. All logic lives in
 * src/lib/pathBriefing.ts (lookup + templated fallback). This
 * component does no IO besides the localStorage read/write and
 * the React render itself.
 */

const STORAGE_KEY = "hse.pathBriefing.dismissed";

interface PathBriefingProps {
  /** The active path id (from HarmonicPath.id). */
  pathId: string | undefined;
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    const ids: string[] = [];
    for (const entry of parsed) {
      if (typeof entry === "string") ids.push(entry);
    }
    return new Set<string>(ids);
  } catch {
    return new Set<string>();
  }
}

function writeDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* localStorage may be unavailable (Safari private mode,
       quota exceeded). The briefing still works in-session; it
       just won't remember dismissal across reloads. */
  }
}

export const PathBriefing: React.FC<PathBriefingProps> = ({ pathId }) => {
  const briefing = briefingForPath(pathId);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => readDismissed(),
  );

  // If the path changes (e.g. user picks a new masterclass tune),
  // re-read localStorage so a stale in-memory dismissal set from a
  // different mount doesn't leak. Cheap (one localStorage read per
  // path change) and correct.
  useEffect(() => {
    if (!pathId) return;
    setDismissedIds(readDismissed());
  }, [pathId]);

  if (!briefing) return null;
  if (dismissedIds.has(pathId!)) return null;

  const dismiss = () => {
    if (!pathId) return;
    const next = new Set<string>(dismissedIds);
    next.add(pathId);
    setDismissedIds(next);
    writeDismissed(next);
  };

  return (
    <div
      className="w-full mt-2 mb-2 rounded-[var(--radius-md)] border border-[color:var(--color-brand-muted)] bg-[color:var(--color-brand)]/5 px-3 py-2.5 flex items-start gap-3"
      role="note"
      aria-label="Practice-loop briefing"
    >
      <Sparkles
        size={16}
        className="text-[color:var(--color-brand-strong)] flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest font-mono text-[color:var(--color-brand-strong)] font-semibold">
            {briefing.inApp ? "Objective" : "Masterclass brief"}
          </span>
          {!briefing.inApp && (
            <span className="text-[10px] font-mono text-neutral-500 italic">
              (coming soon — path not yet wired into the app)
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-200 mt-1 leading-snug">
          {briefing.objective}
        </p>
        {briefing.description && (
          <p className="text-xs text-neutral-400 mt-1 italic">
            {briefing.description}
          </p>
        )}
      </div>
      <button
        onClick={dismiss}
        title="Dismiss this briefing (you can bring it back by reloading)"
        aria-label="Dismiss briefing"
        className="flex-shrink-0 text-neutral-500 hover:text-neutral-200 transition-colors p-1 rounded"
      >
        <X size={14} />
      </button>
    </div>
  );
};
