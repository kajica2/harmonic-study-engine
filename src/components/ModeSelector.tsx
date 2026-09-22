/**
 * src/components/ModeSelector.tsx - PRD-001 REQ-MODE-1..7.
 *
 * Persistent top-bar segmented control with three modes:
 *   Compose / Etude / Explore
 *
 * Reads `mode` from the zustand sessionStore via a slice selector (so
 * only this component re-renders on mode change). Writes go through
 * `requestMode`, which consults the per-mode dirty flag and either
 * commits or opens the dirty-prompt modal.
 *
 * Document-level keyboard handler in App.tsx owns the `1` / `2` / `3`
 * shortcuts (additive to the existing handler) so the shortcuts work
 * even when focus is on the canvas or a modal-trigger button. The
 * tablist here adds WAI-ARIA-compliant roving tabindex for keyboard
 * users who land on the tablist directly (Tab cycles within).
 *
 * Visual: 3 segments separated by 1px dividers; active segment has
 * brand-muted bg + brand-strong text; inactive is surface-1 text.
 *
 * Compact mode (mobile): 3 icons only, no labels, 36x36 squares.
 */

import React, { useCallback } from "react";
import { useSessionStore, MODES, MODE_LABELS, type Mode } from "../state/sessionStore";

export interface ModeSelectorProps {
  /** Optional override; defaults to reading from the store. */
  value?: Mode;
  /** Optional override for the change handler; defaults to requestMode. */
  onChange?: (next: Mode) => void;
  /** When true, renders a compact icon-only row (used in MobileCommandBar). */
  compact?: boolean;
  /** Test-only id prefix for the tablist; defaults to 'mode-selector'. */
  idPrefix?: string;
}

const SHORTCUT_NUMBER: Readonly<Record<Mode, number>> = {
  compose: 1,
  etude: 2,
  explore: 3,
};

const TABLIST_BASE =
  "inline-flex items-stretch rounded-lg border border-[color:var(--color-border)] surface-1 overflow-hidden";

const TAB_BASE =
  "relative inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold t-mono " +
  "transition-colors focus-visible:outline-none " +
  "focus-visible:ring-1 focus-visible:ring-neutral-400/60 " +
  "border-r border-[color:var(--color-border)] last:border-r-0 " +
  "aria-selected:bg-[color:var(--color-brand-muted)] " +
  "aria-selected:text-[color:var(--color-brand-strong)] " +
  "aria-selected:hover:bg-[color:var(--color-brand-muted)] " +
  "text-neutral-300 hover:text-white";

const COMPACT_TAB_BASE =
  "w-9 h-9 text-[10px] font-bold t-mono rounded-md " +
  "transition-colors focus-visible:outline-none " +
  "focus-visible:ring-1 focus-visible:ring-neutral-400/60 " +
  "aria-selected:bg-[color:var(--color-brand-muted)] " +
  "aria-selected:text-[color:var(--color-brand-strong)] " +
  "text-neutral-400 hover:text-white";

const KBD_BASE =
  "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 " +
  "rounded border border-[color:var(--color-border)] " +
  "bg-neutral-900 text-[10px] t-mono text-neutral-400 " +
  "aria-selected:border-[color:var(--color-brand-strong)] " +
  "aria-selected:text-[color:var(--color-brand-strong)]";

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  value,
  onChange,
  compact = false,
  idPrefix = "mode-selector",
}) => {
  // Selector subscription: only this component re-renders on mode change.
  const storedMode = useSessionStore((s) => s.mode);
  const effective: Mode | null = value ?? storedMode;

  // We display the active mode; when the store is null (legacy / first
  // run) we visually highlight Etude so the user sees where they will
  // land. Clicking still calls requestMode which goes through the
  // resolver and respects the dirty-state guard.
  const displayMode: Mode | null = effective ?? "etude";

  const handleClick = useCallback(
    (next: Mode) => {
      if (onChange) onChange(next);
      else useSessionStore.getState().requestMode(next);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      // Roving tabindex per WAI-ARIA tablist pattern. ArrowLeft /
      // ArrowRight move focus across the 3 tabs (no wrap - the
      // document-level `1`/`2`/`3` handler is the cross-mode shortcut).
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = idx + delta;
        if (nextIdx >= 0 && nextIdx < MODES.length) {
          const nextMode = MODES[nextIdx];
          const el = document.getElementById(
            `${idPrefix}-tab-${nextMode}`,
          );
          if (el) (el as HTMLButtonElement).focus();
        }
      }
    },
    [idPrefix],
  );

  if (compact) {
    return (
      <div
        role="tablist"
        aria-label="Mode"
        className="inline-flex items-center gap-1"
      >
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            id={`${idPrefix}-tab-${m}`}
            aria-selected={displayMode === m}
            aria-controls={`${idPrefix}-panel-${m}`}
            tabIndex={displayMode === m ? 0 : -1}
            onClick={() => handleClick(m)}
            onKeyDown={(e) => handleKeyDown(e, MODES.indexOf(m))}
            className={COMPACT_TAB_BASE}
            title={`${MODE_LABELS[m]} (${SHORTCUT_NUMBER[m]})`}
            aria-label={`${MODE_LABELS[m]} mode (shortcut ${SHORTCUT_NUMBER[m]})`}
          >
            {SHORTCUT_NUMBER[m]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Mode"
      className={TABLIST_BASE}
    >
      {MODES.map((m) => {
        const isActive = displayMode === m;
        const num = SHORTCUT_NUMBER[m];
        return (
          <button
            key={m}
            role="tab"
            id={`${idPrefix}-tab-${m}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${m}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => handleClick(m)}
            onKeyDown={(e) => handleKeyDown(e, MODES.indexOf(m))}
            className={TAB_BASE}
            title={`${MODE_LABELS[m]} (press ${num})`}
            aria-label={`${MODE_LABELS[m]} mode (shortcut ${num})`}
          >
            <span className={KBD_BASE} aria-hidden="true">
              {num}
            </span>
            <span>{MODE_LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
};