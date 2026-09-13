/**
 * src/lib/pathFilters.ts — pure filter logic for the masterclass picker.
 *
 * The filter UI (PathFilterBar) lets the user narrow the catalog by
 * Difficulty / Topic / Goal. Within a category, multiple selected
 * tags are OR'd (match any). Across categories, selections are AND'd
 * (must match all categories that have selections).
 *
 * Untagged entries are excluded from filter results (so a fresh
 * curation pass doesn't accidentally hide paths the user expects
 * to see). When no filters are active, all entries are returned
 * regardless of tagging — preserves the existing "all 38 entries"
 * picker behavior.
 *
 * Pure function. The reducer + tag vocabulary live here so the
 * test suite can pin the logic without React.
 */

import type { MasterclassEntry } from "../data/masterclass";

/**
 * Canonical tag vocabulary. Mirrored from the type union in
 * masterclass.ts so filter UI and the picker share one source of
 * truth. If you add a tag to the union, add it here too.
 */
export type PathTag =
  // Difficulty
  | "foundation"
  | "intermediate"
  | "advanced"
  // Topic
  | "ii-v-i"
  | "modal-interchange"
  | "rhythm-changes"
  | "chromatic-approach"
  | "coltrane-cycle"
  // Goal
  | "voice-leading"
  | "ear-training"
  | "sight-reading"
  | "transposition"
  | "improv";

/**
 * Display labels for the filter UI. Short, sentence-case, no
 * hyphen-noise — what the player sees in the chips.
 */
export const TAG_LABEL: Record<PathTag, string> = {
  foundation: "Foundation",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "ii-v-i": "II-V-I",
  "modal-interchange": "Modal interchange",
  "rhythm-changes": "Rhythm changes",
  "chromatic-approach": "Chromatic approach",
  "coltrane-cycle": "Coltrane cycle",
  "voice-leading": "Voice-leading",
  "ear-training": "Ear training",
  "sight-reading": "Sight reading",
  transposition: "Transposition",
  improv: "Improv",
};

/**
 * Tags grouped by category. The filter UI renders one chip-row per
 * category. Adding a tag to a category here automatically surfaces
 * it in the bar.
 */
export const TAG_CATEGORIES: { label: string; tags: PathTag[] }[] = [
  {
    label: "Difficulty",
    tags: ["foundation", "intermediate", "advanced"],
  },
  {
    label: "Topic",
    tags: [
      "ii-v-i",
      "modal-interchange",
      "rhythm-changes",
      "chromatic-approach",
      "coltrane-cycle",
    ],
  },
  {
    label: "Goal",
    tags: [
      "voice-leading",
      "ear-training",
      "sight-reading",
      "transposition",
      "improv",
    ],
  },
];

export interface PathFilterState {
  selected: PathTag[];
}

/** Initial state — no filters active. */
export const EMPTY_FILTER: PathFilterState = { selected: [] };

/** True when the user has at least one tag selected. */
export function isFiltering(state: PathFilterState): boolean {
  return state.selected.length > 0;
}

/**
 * Toggle a tag in/out of the filter selection. Pure: returns a
 * new state object (immutable update). Duplicates are deduped.
 */
export function toggleTag(
  state: PathFilterState,
  tag: PathTag,
): PathFilterState {
  const has = state.selected.includes(tag);
  return {
    selected: has
      ? state.selected.filter((t) => t !== tag)
      : [...state.selected, tag],
  };
}

/** Clear all selected tags. */
export function clearFilters(): PathFilterState {
  return EMPTY_FILTER;
}

/**
 * Group the currently selected tags by category. Used by the UI
 * to render a "Filtering by: …" summary.
 */
export function selectedByCategory(
  state: PathFilterState,
): Record<string, PathTag[]> {
  const out: Record<string, PathTag[]> = {};
  for (const cat of TAG_CATEGORIES) {
    const inCat = state.selected.filter((t) => cat.tags.includes(t));
    if (inCat.length > 0) out[cat.label] = inCat;
  }
  return out;
}

/**
 * Apply the filter to a catalog of entries. Pure function of the
 * entries + the filter state.
 *
 * Rules:
 *   - When no tags are selected, return ALL entries unchanged.
 *   - When tags are selected, an entry passes if:
 *       - It has a `tags` field (untagged entries are excluded
 *         while a filter is active — they're "uncategorized", and
 *         we don't want to silently include them when the user
 *         is narrowing by tag).
 *       - For every category that has at least one selected tag,
 *         the entry has at least one of those tags (AND across
 *         categories, OR within a category).
 */
export function applyFilter(
  entries: MasterclassEntry[],
  state: PathFilterState,
): MasterclassEntry[] {
  if (!isFiltering(state)) return entries;

  // Build a map: tag -> category label
  const tagToCategory = new Map<PathTag, string>();
  for (const cat of TAG_CATEGORIES) {
    for (const tag of cat.tags) tagToCategory.set(tag, cat.label);
  }

  // Group selected tags by their category
  const selectedByCat = new Map<string, PathTag[]>();
  for (const tag of state.selected) {
    const cat = tagToCategory.get(tag);
    if (!cat) continue;
    if (!selectedByCat.has(cat)) selectedByCat.set(cat, []);
    selectedByCat.get(cat)!.push(tag);
  }

  return entries.filter((entry) => {
    if (!entry.tags || entry.tags.length === 0) return false;
    // For each category the user selected, the entry must have
    // at least one tag from that category.
    for (const [, tagsInCat] of selectedByCat) {
      const hasMatch = tagsInCat.some((t) => entry.tags!.includes(t));
      if (!hasMatch) return false;
    }
    return true;
  });
}

/**
 * Total count of paths with at least one tag — exposed so the UI
 * can show "X paths match your filter" or "0 tagged paths; show
 * all" messaging.
 */
export function taggedEntryCount(entries: MasterclassEntry[]): number {
  return entries.filter((e) => e.tags && e.tags.length > 0).length;
}
