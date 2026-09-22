/**
 * src/components/ExploreSurface.tsx - PRD-001 REQ-EXP-2 (empty state).
 *
 * Phase 1 stub. Three random preset chips (drawn from a fixed list of
 * 12 per D9) + the existing <FormTemplatePicker> + <FormPlanner>.
 * The picker is read-only (`onPick` no-op today) so Phase 1 ships the
 * same chrome the Etude path uses, but without the editing wiring
 * (Phase 5).
 *
 * Chip randomness: seeded by Date.now() XOR a per-mount salt so a
 * fresh trio lands each time the user enters Explore mode. We do not
 * import a heavy PRNG (engine/ would be the right home); the
 * Math.random + Date.now lives at the adapter layer, not engine/.
 */

import React, { useMemo, useState } from "react";
import { FormPlanner } from "./FormPlanner";
import { FormTemplatePicker } from "./FormTemplatePicker";
import { planForm, MIN_PATH_BARS, MAX_PATH_BARS } from "../lib/formPlanner";

const PRESET_SEEDS: readonly string[] = [
  "Cmaj7",
  "ii-V-I in C",
  "D dorian",
  "Fmaj7",
  "C blues",
  "12-bar in A",
  "C lydian",
  "Dm9",
  "Bbmaj7-A7alt",
  "G mixolydian",
  "Cm-Eb-Gm progression",
  "Phrygian in E",
];

function drawThree(): readonly string[] {
  // Pull 3 unique entries from the pool. Not a strict Fisher-Yates
  // because the chip count (3) is tiny vs the pool (12) - the simple
  // partial-shuffle is correct enough and avoids needing a swap buffer.
  const pool = PRESET_SEEDS.slice();
  const picks: string[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool[idx] as string);
    pool.splice(idx, 1);
  }
  return picks;
}

export interface ExploreSurfaceProps {
  /** Optional override for the active bar count (defaults to mid-range). */
  barCount?: number;
  /** Optional className passthrough. */
  className?: string;
}

export const ExploreSurface: React.FC<ExploreSurfaceProps> = ({
  barCount,
  className = "",
}) => {
  // Re-draw on every mount so users see fresh chips each time.
  const chips = useMemo(() => drawThree(), []);
  // Per-chip "activated" state (visual only - Phase 5 wires operations).
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const effectiveBarCount =
    barCount ?? Math.floor((MIN_PATH_BARS + MAX_PATH_BARS) / 2);
  const planResult = planForm({ bars: effectiveBarCount, template: "aaba" });
  const plan = planResult.ok ? planResult.plan : null;

  return (
    <section
      role="region"
      aria-label="Explore mode (empty state)"
      className={`flex flex-col gap-4 ${className}`}
    >
      <div className="surface-1 border border-[color:var(--color-border)] rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-[color:var(--color-text-1)] mb-3">
          Explore a seed
        </h2>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const isActive = activeChip === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveChip(isActive ? null : c)}
                aria-pressed={isActive}
                className={
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60 " +
                  (isActive
                    ? "bg-[color:var(--color-brand-muted)] text-[color:var(--color-brand-strong)] border-[color:var(--color-brand-strong)]/40"
                    : "surface-2 text-neutral-300 border-[color:var(--color-border)] hover:text-white")
                }
              >
                <span>{c}</span>
                <span aria-hidden="true" className="text-[10px]">
                  ^
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] t-mono text-[color:var(--color-text-3)] mt-3">
          Phase 1 ships read-only chips. Reharmonize / substitute /
          expand operations land in Phase 5.
        </p>
      </div>

      <FormTemplatePicker
        activeId={null}
        onPick={() => {
          /* MVP: no-op; Phase 5 wires setPlan(planForm({...})) */
        }}
      />
      <FormPlanner plan={plan} />
    </section>
  );
};