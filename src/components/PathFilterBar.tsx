import React, { useState, useMemo } from "react";
import {
  applyFilter,
  clearFilters,
  EMPTY_FILTER,
  isFiltering,
  selectedByCategory,
  toggleTag,
  TAG_CATEGORIES,
  TAG_LABEL,
  type PathFilterState,
  type PathTag,
} from "../lib/pathFilters";
import { X, Filter } from "lucide-react";

/**
 * PathFilterBar — chip-row filter UI for the masterclass picker.
 *
 * Renders one chip-row per category (Difficulty / Topic / Goal).
 * Click a chip to toggle. Multiple chips within a category act as
 * OR (any-of). Across categories the selection is AND (all-of).
 *
 * Untagged entries are hidden while a filter is active. The bar
 * shows a "N matching / M total" count so the user knows how
 * aggressive the filter is; with no filters active, all entries
 * are visible (the picker preserves its existing behavior).
 */

interface PathFilterBarProps {
  /** Current filter state. */
  filter: PathFilterState;
  /** Called when the user toggles a tag. */
  onChange: (next: PathFilterState) => void;
  /** Total catalog size, used in the "N matching / M total" copy. */
  totalCount: number;
  /** Number of entries that pass the filter, used in the copy. */
  filteredCount: number;
}

export const PathFilterBar: React.FC<PathFilterBarProps> = ({
  filter,
  onChange,
  totalCount,
  filteredCount,
}) => {
  const grouped = useMemo(() => selectedByCategory(filter), [filter]);

  if (!isFiltering(filter)) {
    return (
      <div className="text-[10px] t-mono text-neutral-500 flex items-center gap-1.5">
        <Filter size={11} aria-hidden />
        <span>
          Filter by difficulty / topic / goal —{" "}
          {totalCount} tunes total
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] t-mono text-neutral-400">
          Showing{" "}
          <span className="text-[color:var(--color-brand-strong)] font-semibold">
            {filteredCount}
          </span>{" "}
          of {totalCount} tunes
          {Object.keys(grouped).length > 0 && (
            <>
              {" "}— filtering by{" "}
              {(Object.entries(grouped) as [string, PathTag[]][])
                .flatMap(([cat, tags]) => tags.map((t) => `${TAG_LABEL[t]} (${cat})`))
                .join(", ")}
            </>
          )}
        </div>
        <button
          onClick={() => onChange(clearFilters())}
          className="flex items-center gap-1 text-[10px] t-mono text-neutral-400 hover:text-neutral-200 px-2 py-0.5 rounded surface-1"
          title="Clear all filters"
        >
          <X size={11} aria-hidden /> Clear
        </button>
      </div>
      <div className="space-y-1.5">
        {TAG_CATEGORIES.map((cat) => (
          <div
            key={cat.label}
            className="flex items-baseline gap-2 flex-wrap"
          >
            <span className="text-[9px] uppercase tracking-wider font-mono text-neutral-500 w-20 flex-shrink-0">
              {cat.label}
            </span>
            <div className="flex flex-wrap gap-1">
              {cat.tags.map((tag) => (
                <FilterChip
                  key={tag}
                  tag={tag}
                  active={filter.selected.includes(tag)}
                  onToggle={() => onChange(toggleTag(filter, tag))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{
  tag: PathTag;
  active: boolean;
  onToggle: () => void;
}> = ({ tag, active, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={`px-2 py-0.5 rounded-full text-[10px] t-mono border transition-colors ${
        active
          ? "border-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] bg-[color:var(--color-brand)]"
          : "border-[color:var(--color-border)] text-neutral-400 hover:text-neutral-100 hover:border-[color:var(--color-brand-muted)] surface-1"
      }`}
    >
      {TAG_LABEL[tag]}
    </button>
  );
};

/** Initial state for the picker's useState. */
export const initialFilterState: PathFilterState = EMPTY_FILTER;
