/**
 * src/components/SeedPicker.tsx - PRD-001 Phase 5 (REQ-EXP-1/2, D93).
 *
 * First-entry + preset chips for Explore seeds. The kind tabs are
 * FILTER HINTS ONLY: selecting one fills an example into the input,
 * never constrains the parser (parseExploreSeed is authoritative).
 * Commits on Enter or chip click; the live "parses as" readout keeps
 * the parse honest in front of the user.
 */

import React, { useEffect, useRef } from "react";
import {
  EXPLORE_PRESETS,
  parseExploreSeed,
} from "../../engine/explore/seeds";
import type { ExploreSeedKind } from "../../engine/explore/types";

export interface SeedPickerProps {
  value: string;
  onChange: (text: string) => void;
  /** Receives the parsed seed (parseExploreSeed never throws). */
  onCommit: (seed: import("../../engine/explore/types").ExploreSeed) => void;
  presets?: readonly string[];
  autoFocus?: boolean;
}

const KIND_EXAMPLES: Readonly<Record<ExploreSeedKind, string>> = {
  chord: "Cmaj7",
  progression: "Dm7 G7 Cmaj7",
  scale: "D dorian",
  interval: "P5 up",
  free: "hello world",
};

const KIND_ORDER: readonly ExploreSeedKind[] = [
  "chord",
  "progression",
  "scale",
  "interval",
  "free",
];

export const SeedPicker: React.FC<SeedPickerProps> = ({
  value,
  onChange,
  onCommit,
  presets = EXPLORE_PRESETS.slice(0, 3),
  autoFocus = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusedRef = useRef(false);
  useEffect(() => {
    // One-shot focus (PHASE-3-03: StrictMode double-invoke safe).
    if (autoFocus && !focusedRef.current && inputRef.current !== null) {
      focusedRef.current = true;
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const parsedKind = parseExploreSeed(value).kind;

  const commit = (text: string): void => {
    onCommit(parseExploreSeed(text));
  };

  return (
    <div className="flex flex-col gap-2" data-testid="seed-picker">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Seed kind hints">
        {KIND_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`seed-kind-${kind}`}
            title={`Fill a ${kind} example`}
            onClick={() => onChange(KIND_EXAMPLES[kind])}
            className="px-2 py-0.5 rounded-full text-[11px] t-mono border border-[color:var(--color-border)] text-[color:var(--color-text-3)] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
          >
            {kind}
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        data-testid="seed-input"
        aria-label="Explore seed"
        placeholder="Cmaj7, Dm7 G7 Cmaj7, D dorian, P5 up..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value);
        }}
        className="w-full bg-neutral-900 border border-[color:var(--color-border)] rounded px-3 py-2 text-sm t-mono text-[color:var(--color-text-1)] outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
      />
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset, i) => (
          <button
            key={`${preset}-${i}`}
            type="button"
            data-testid={`seed-chip-${i}`}
            onClick={() => {
              onChange(preset);
              commit(preset);
            }}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-mono border surface-2 text-neutral-300 border-[color:var(--color-border)] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
          >
            {preset}
          </button>
        ))}
        <span
          className="text-[11px] t-mono text-[color:var(--color-text-3)]"
          data-testid="seed-parse-kind"
        >
          {value.trim() === "" ? "type a seed" : `parses as: ${parsedKind}`}
        </span>
      </div>
    </div>
  );
};
