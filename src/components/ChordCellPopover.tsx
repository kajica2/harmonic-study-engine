/**
 * src/components/ChordCellPopover.tsx - PRD-001 Phase 4 Slice 2
 * (D61, REQ-COMP-23).
 *
 * Inline chord-cell editor: NOT a modal (ModalShell's focus trap +
 * scroll lock is the wrong tool for grid editing - D61). An
 * absolutely-positioned card inside the cell wrapper (the parent owns
 * the relative positioning + focus return).
 *
 * - text input (role=combobox) with listbox autocomplete from the
 *   chordInput grammar (alternatives first, recents, prefix filter);
 *   arrow keys + Enter drive the list;
 * - the cell's top-3 alternatives as buttons ("common options");
 * - Delete -> rest (a null override);
 * - Split bar in two -> ONE patchComposeOverrides writing both cells
 *   (the parent runs reinferBar on the MERGED grid + MERGED key and
 *   applies; one undo entry - D59/D60);
 * - close: Escape (own onKeyDown, stopPropagation so the global
 *   ladder never sees it), pointerdown-outside, or apply.
 *
 * Symbols the grid cannot hold ("C13") show an inline error and never
 * apply - parseChordSymbol is the single validator.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCellFromSymbol,
  parseChordSymbol,
  suggestChordSymbols,
} from "../lib/chordInput";
import type { ChordCell, KeyCandidate } from "../../engine/compose/types";

export interface ChordCellPopoverProps {
  cell: ChordCell;
  /** Spelling context: the merged selected key candidate. */
  keyCandidate: KeyCandidate;
  /** Last-8-edit buffer owned by the surface (chordInput stays pure). */
  recentSymbols: readonly string[];
  onApply: (cell: ChordCell) => void;
  /** -> null override (rest). */
  onDelete: () => void;
  /** reinferBar(2 slots) + write both cells in ONE patch. */
  onSplit: () => void;
  onClose: () => void;
}

const LISTBOX_ID = "chord-suggestion-listbox";

export function ChordCellPopover({
  cell,
  keyCandidate,
  recentSymbols,
  onApply,
  onDelete,
  onSplit,
  onClose,
}: ChordCellPopoverProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  // Combobox semantics: a TYPED query wins on Enter; ARROW navigation
  // switches Enter to apply the highlighted option (a suggestion that
  // merely shares the query's prefix must never shadow the exact
  // symbol the user typed).
  const [navigated, setNavigated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo(
    () => suggestChordSymbols(query, keyCandidate, 8, cell.alternatives, recentSymbols),
    [query, keyCandidate, cell.alternatives, recentSymbols],
  );

  // Manual tier opens with the input focused (D61); pointerdown
  // outside closes (the popover is deliberately NOT focus-trapped).
  useEffect(() => {
    inputRef.current?.focus();
    const onPointerDown = (e: PointerEvent): void => {
      const el = containerRef.current;
      if (el !== null && e.target instanceof Node && !el.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const applySymbol = (symbol: string): void => {
    const parsed = parseChordSymbol(symbol);
    if (parsed === null) {
      setError(`"${symbol.trim()}" is not a chord symbol the grid can hold (try Cm7, G7, Fmaj7)`);
      return;
    }
    onApply(buildCellFromSymbol(parsed, keyCandidate));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // stopPropagation: the global arrow handler moves the ETUDE step
      // index - inside the listbox it must not (collision table).
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx((i) => (i + delta + suggestions.length) % suggestions.length);
      setNavigated(true);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = query.trim();
      const pick =
        navigated && suggestions.length > 0
          ? suggestions[activeIdx]
          : trimmed !== ""
            ? trimmed
            : (suggestions[0] ?? "");
      if (pick !== "") applySymbol(pick);
    }
  };

  const onQueryChange = (next: string): void => {
    setQuery(next);
    setActiveIdx(0);
    setNavigated(false);
    setError(null);
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Edit chord cell"
      className="absolute left-0 top-full z-40 mt-1 w-56 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-bg-1)] p-2 shadow-lg"
      data-testid="chord-cell-popover"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={
          suggestions.length > 0 ? `chord-option-${activeIdx}` : undefined
        }
        aria-label="Chord symbol"
        placeholder="Chord symbol (Cm7, G7/B...)"
        className="w-full rounded border border-[color:var(--color-border)] bg-black/20 px-2 py-1 text-sm text-[color:var(--color-text-1)]"
        data-testid="chord-symbol-input"
      />
      {suggestions.length > 0 && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Chord suggestions"
          className="mt-1 max-h-40 overflow-y-auto rounded border border-[color:var(--color-border)]"
          data-testid="chord-suggestions"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s}-${i}`}
              id={`chord-option-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => applySymbol(s)}
              className={`cursor-pointer px-2 py-0.5 text-sm ${
                i === activeIdx
                  ? "bg-[color:var(--color-brand)]/25 text-[color:var(--color-text-1)]"
                  : "text-[color:var(--color-text-2)]"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-red-400" data-testid="chord-symbol-error">
          {error}
        </p>
      )}
      {cell.alternatives.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Common options">
          {cell.alternatives.slice(0, 3).map((alt) => (
            <button
              key={`${alt.name}-${alt.qualitySymbol}`}
              type="button"
              onClick={() => onApply(alt)}
              className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
              data-testid={`chord-alternative-${alt.name}`}
            >
              {alt.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applySymbol(query)}
          className="rounded border border-[color:var(--color-brand)] px-2 py-0.5 text-xs text-[color:var(--color-brand-strong)]"
          data-testid="chord-apply"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)]"
          data-testid="chord-delete"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onSplit}
          className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)]"
          data-testid="chord-split"
        >
          Split bar in two
        </button>
      </div>
    </div>
  );
}
