/**
 * src/lib/displayMode.ts — pure score-display mode selection.
 *
 * IMPROVEMENT_PLAN step 7 ("display modes for the live score")
 * called for 4 modes — full / guide-tone / trumpet-transposition /
 * rhythm-first. The full 4-mode set is multi-week work (each mode
 * is a separate rendering path). This commit ships the data
 * layer for the FIRST mode pair (Full / Zoom), which captures
 * the bulk of the value (clearer "where am I in the form") at
 * small blast radius.
 *
 * Future modes (guide-tone, trumpet-transposition, rhythm-first)
 * can join the same `ScoreDisplayMode` union when their rendering
 * paths are built.
 *
 * Pure function. The reducer + label map live here so the unit
 * tests can pin the data contract without mounting React.
 */

export type ScoreDisplayMode = "full" | "zoom";

/** Display label shown in the dropdown. */
export const SCORE_MODE_LABEL: Record<ScoreDisplayMode, string> = {
  full: "Full score",
  zoom: "Active-bar zoom",
};

/** Short helper text shown in a tooltip next to the picker. */
export const SCORE_MODE_HINT: Record<ScoreDisplayMode, string> = {
  full:
    "Show the whole form. Use this when learning the structure of a tune.",
  zoom:
    "Highlight the current bar and dim the rest. Use this when sight-reading or holding the line in a long form.",
};

const ALL_MODES: ScoreDisplayMode[] = ["full", "zoom"];

/** Cycle to the next mode in display order. */
export function nextMode(current: ScoreDisplayMode): ScoreDisplayMode {
  const i = ALL_MODES.indexOf(current);
  return ALL_MODES[(i + 1) % ALL_MODES.length];
}

/** True when the score should apply the active-bar dim treatment. */
export function isZoomMode(mode: ScoreDisplayMode): boolean {
  return mode === "zoom";
}

/** All modes, in display order. */
export function allScoreModes(): ScoreDisplayMode[] {
  return [...ALL_MODES];
}
