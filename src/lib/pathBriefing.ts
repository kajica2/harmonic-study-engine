/**
 * src/lib/pathBriefing.ts — pure briefing derivation for paths.
 *
 * Given a path id, look it up in the masterclass catalog and produce
 * the data needed to render a practice-loop briefing card:
 *   - the curated `objective` line (when the path is in the live set)
 *   - a generic `mainExercise` line (when it's not yet wired in)
 *   - the `description` line (always, when found)
 *
 * Pure function so it's unit-testable without React or the DOM.
 *
 * Lookup is id-based. If the id isn't in the catalog, briefingForPath
 * returns null and the calling component decides whether to render
 * nothing (most paths today) or a generic "no briefing yet" stub.
 */

import {
  MASTERCLASS_TUNES,
  tuneById,
  type MasterclassEntry,
} from "../data/masterclass";

export interface PathBriefing {
  /** Source-of-truth entry from masterclass.ts. */
  entry: MasterclassEntry;
  /** "When you open this path, …" — curated when inApp, templated when not. */
  objective: string;
  /** Always-present description (composer / era / form). */
  description: string;
  /** True for paths in the live path set; false for "coming soon". */
  inApp: boolean;
}

/**
 * Templated objective for paths that don't have a hand-curated one.
 * Kept short (one sentence) so the briefing card stays scannable.
 */
function fallbackObjective(entry: MasterclassEntry): string {
  return `Coming soon — in the meantime: ${entry.mainExercise}`;
}

/**
 * Look up the masterclass entry for a path id and produce a briefing.
 * Returns null when the id isn't in the catalog (synthesized paths,
 * user-imported Real Book charts, generator output).
 */
export function briefingForPath(pathId: string | undefined): PathBriefing | null {
  if (!pathId) return null;
  const entry = tuneById(pathId);
  if (!entry) return null;
  return {
    entry,
    objective: entry.objective ?? fallbackObjective(entry),
    description: entry.description,
    inApp: entry.inApp,
  };
}

/**
 * Total number of paths with curated `objective` fields. Used by
 * the briefing-empty-state copy ("X paths have briefings so far").
 * Exposed for tests.
 */
export function curatedBriefingCount(): number {
  return MASTERCLASS_TUNES.filter((t) => t.objective).length;
}
