import React from "react";
import type { GuideToneTarget } from "../lib/gtTargets";

export interface GtCoverageRowProps {
  targets: GuideToneTarget[];
  loopStartBar?: number | null;
  loopEndBar?: number | null;
  /** 1-based bar number (matches PerformStage currentBar). */
  currentBar: number;
}

/**
 * GtCoverageRow — pure presentational path-level guide-tone coverage map.
 *
 * RAW-CANONICAL LIMITATION: each cell reflects the RAW canonical chord
 * intent (the bar's first step notes as authored in the HarmonicPath),
 * not the post-voicing sonority the player hears after persona voicing,
 * octave placement, or inversions are applied. An inversion can move the
 * bass so the sounding 3rd/7th diverges from this map — that divergence
 * is accepted by design. This row answers "where did the writer put 3rds
 * and 7ths", never "what did you just play".
 *
 * Visual contract (per architect):
 * - role=list / aria-label="Guide-tone targets per bar"; cells are
 *   role=listitem DIVs (never <button>), zero focusable elements.
 * - Glyphs: "✓" iff the bar has at least one guide tone, else "—".
 *   Muted neutrals only (never green/red, never "✗") — the glyph shape
 *   plus the per-cell aria-label carry meaning, not color alone.
 * - Title tooltip names the target set ("3rd + 7th" / "3rd only" /
 *   "7th only" / "no 3rd/7th") plus a "not your hits" disclaimer and the
 *   raw-intent note above.
 * - Loop band mirrors the bar-strip brass wash at lower opacity; active
 *   bar gets a subtle border/opacity lift with NO aria-current (the bar
 *   strip button already announces position — a second announcement
 *   would double-announce).
 * - Layout mirrors the bar strip (flex-1 min-w-[60px] gap-1) inside the
 *   parent's shared overflow-x-auto scroller; fixed min-h avoids CLS.
 */

function isInLoopRange(
  bar: number,
  loopStartBar: number | null | undefined,
  loopEndBar: number | null | undefined,
): boolean {
  if (loopStartBar === null || loopStartBar === undefined) return false;
  const lo = Math.min(loopStartBar, loopEndBar ?? loopStartBar);
  const hi = Math.max(loopEndBar ?? loopStartBar, loopStartBar);
  return bar >= lo && bar <= hi;
}

function targetLabel(t: GuideToneTarget): string {
  const has3 = t.targets.includes("3rd");
  const has7 = t.targets.includes("7th");
  if (has3 && has7) return "3rd + 7th";
  if (has3) return "3rd only";
  if (has7) return "7th only";
  return "no 3rd/7th";
}

const RAW_NOTE =
  "Raw chord intent (first step per bar); post-voicing sonority or inversions may differ.";

function GtCoverageRowInner({
  targets,
  loopStartBar = null,
  loopEndBar = null,
  currentBar,
}: GtCoverageRowProps): React.JSX.Element {
  if (targets.length === 0) {
    return (
      <div
        role="list"
        aria-label="Guide-tone targets per bar"
        className="mt-1 flex gap-1 min-h-[24px] items-center"
      >
        <div className="text-[10px] font-mono text-neutral-500 italic px-1">
          No guide-tone targets for this path.
        </div>
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="Guide-tone targets per bar"
      title={`Guide-tone targets per bar. ${RAW_NOTE} Targets — not your hits.`}
      className="mt-1 flex gap-1 min-h-[24px]"
    >
      {targets.map((t) => {
        const label = targetLabel(t);
        const isActive = currentBar === t.bar + 1;
        const inLoop = isInLoopRange(t.bar, loopStartBar, loopEndBar);
        return (
          <div
            key={t.bar}
            role="listitem"
            aria-label={`Bar ${t.bar + 1}: ${label} targets`}
            title={`Bar ${t.bar + 1}: ${label} targets — not your hits. ${RAW_NOTE}`}
            className={`relative flex-1 min-w-[60px] rounded-md border px-2 py-0.5 text-center text-[11px] font-mono leading-5 overflow-hidden ${
              isActive
                ? "border-neutral-300/60 bg-white/10 opacity-100"
                : "border-white/5 bg-white/[0.02] opacity-90"
            }`}
          >
            {inLoop && (
              <div
                className="absolute inset-0 rounded-md pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(212,168,87,0.14), rgba(212,168,87,0.06))",
                  boxShadow: "inset 0 0 0 1px rgba(212,168,87,0.28)",
                }}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative pointer-events-none ${
                t.hasGuideTone ? "text-neutral-200" : "text-neutral-400"
              }`}
              aria-hidden="true"
            >
              {t.hasGuideTone ? "✓" : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const GtCoverageRow = React.memo(GtCoverageRowInner);
