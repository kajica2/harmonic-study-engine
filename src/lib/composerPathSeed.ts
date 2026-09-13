/**
 * composerPathSeed.ts — turn a catalog composer's chart into a
 * HarmonicPath. v1 supports bar-by-bar composers (Beethoven through
 * Piazzolla — the 16 with BarCharts). Section-only composers return
 * null from `seedPathFromComposer` and are exposed via
 * `sectionComposerIds`.
 *
 * The generated path:
 *   - Uses the BarChart's chord labels as step `name`s.
 *   - Reuses the chord's first note as step `notes[0]` (so the
 *     engine has at least one MIDI pitch to play).
 *   - Pads/cycles to MIN_PATH_BARS via `padPath()`.
 *   - Tags with `composer`, `key`, `techniques`, `mvpReady: true`,
 *     and a `seededFromComposer` marker so callers can tell the path
 *     was synthesized from the catalog rather than authored by hand.
 *
 * Use case: a "study in the style of X" entry in the path picker.
 * The path is functionally playable (the engine can render it), but
 * the user knows it's a study reduction (per the catalog disclaimer:
 * "study reductions, not literal bar-by-bar transcriptions").
 */

import {
  getComposerChart,
  pcFromNoteName,
  type ComposerId,
  type BarChart,
  type ChartBar,
} from "./composerCatalog";
import type { HarmonicPath, HarmonicStep } from "./pathsHelpers";
import {
  padPath,
  MIN_PATH_BARS,
  STEPS_PER_BAR,
} from "./pathsHelpers";

/** Composer ids that have bar-by-bar charts and can be seeded. */
export const BAR_COMPOSER_IDS: ComposerId[] = [
  "beethoven", "schubert", "berlioz", "chopin", "liszt",
  "wagner", "verdi", "ellington", "armstrong", "miles-davis",
  "john-coltrane", "the-beatles", "kraftwerk", "wendy-carlos",
  "fela-kuti", "piazzolla",
];

/** Composer ids that have only section charts (return null from seed). */
export const SECTION_COMPOSER_IDS: ComposerId[] = [
  "debussy", "stravinsky", "schoenberg", "bartok", "cage",
  "stockhausen", "minimalists", "ornette-coleman", "brian-eno",
  "ravi-shankar",
];

/** Map a chart chord string (e.g. "Cm", "Bb7", "F#") to a MIDI root. */
function chordToMidiRoot(chord: string): number {
  // Strip suffix characters (m, 7, M7, dim, aug, etc.) and grab the
  // root note name.
  const m = chord.match(/^([A-G][#b]?)/);
  if (!m) return 60; // C4 fallback
  const pc = pcFromNoteName(m[1]);
  if (pc === undefined) return 60;
  // Use octave 4 (middle C area) as the default.
  return 60 + pc;
}

/** Build one HarmonicStep from a ChartBar (multiplied by STEPS_PER_BAR). */
function barToSteps(bar: ChartBar, baseOctave = 4): HarmonicStep[] {
  const midi = chordToMidiRoot(bar.chord);
  const octShift = (baseOctave - 4) * 12;
  const step: HarmonicStep = {
    name: bar.chord,
    notes: [midi + octShift],
    descriptions: bar.roman,
  };
  // Repeat STEPS_PER_BAR times so the bar holds its chord for a full bar.
  return Array(STEPS_PER_BAR).fill(step);
}

/**
 * Generate a HarmonicPath from a bar-chart composer. Returns null
 * if the composer has no bar chart (callers should check
 * `BAR_COMPOSER_IDS` first).
 */
export function seedPathFromComposer(
  composerId: ComposerId,
  opts: { targetBars?: number; idPrefix?: string } = {},
): HarmonicPath | null {
  const chart = getComposerChart(composerId);
  if (!chart || chart.kind !== "bar") return null;
  const barChart = chart as BarChart;

  const targetBars = opts.targetBars ?? MIN_PATH_BARS;
  const idPrefix = opts.idPrefix ?? `seed-${composerId}`;

  // Convert each bar to STEPS_PER_BAR steps
  const steps: HarmonicStep[] = [];
  for (const bar of barChart.bars) {
    steps.push(...barToSteps(bar));
  }

  // Cycle to targetBars, then pad/trim via padPath to satisfy invariant
  const cycled: HarmonicPath = {
    id: `${idPrefix}-${targetBars}b`,
    title: `${barChart.composerName} study (${targetBars} bars, seeded from catalog)`,
    name: `${barChart.composerName} study (${targetBars} bars, seeded from catalog)`,
    description: `Bar-by-bar reduction of ${barChart.composerName}'s work, seeded from docs/COMPOSER-HARMONIC-INNOVATIONS.md. ${barChart.workContext}. Study reduction, not literal transcription.`,
    steps,
    mvpReady: true,
    composer: barChart.composerName,
    // Try to extract the key from the work context (e.g. "(C minor)").
    key: extractKey(barChart.workContext),
    techniques: ["composer-seed", "catalog-driven"],
  };

  // Cycle to targetBars (targetBars * STEPS_PER_BAR), then padPath enforces
  // MIN/MAX invariant.
  let cycledToTarget = cycled;
  while (
    cycledToTarget.steps.length <
    targetBars * STEPS_PER_BAR
  ) {
    cycledToTarget = {
      ...cycledToTarget,
      steps: cycledToTarget.steps.concat(cycledToTarget.steps.slice(0, targetBars * STEPS_PER_BAR - cycledToTarget.steps.length)),
    };
  }
  return padPath(cycledToTarget);
}

/** Extract a key signature from a work-context string like "(C minor)". */
function extractKey(workContext: string): string | undefined {
  // Find a key signature inside parens. The workContext may have
  // arbitrary text inside the parens before the key (e.g. "(exposition
  // opening, C minor)" or "(Bb major, 12-bar blues)"). Look for the
  // first match of `<letter>[#b]? <mode>?` after a `(`.
  const idx = workContext.indexOf("(");
  if (idx < 0) return undefined;
  const after = workContext.slice(idx + 1);
  const m = after.match(/([A-G][#b]?)\s*(major|minor|m|M)?/);
  if (!m) return undefined;
  const root = m[1];
  const mode = m[2]?.toLowerCase();
  if (mode === "minor" || mode === "m") return `${root}m`;
  if (mode === "major") return root;
  return root;
}

/** Generate one demo path per bar-chart composer (16 paths). */
export function seedAllDemoPaths(): HarmonicPath[] {
  const paths: HarmonicPath[] = [];
  for (const id of BAR_COMPOSER_IDS) {
    const p = seedPathFromComposer(id);
    if (p) paths.push(p);
  }
  return paths;
}

/** True if the path was synthesized from a composer chart. */
export function isComposerSeededPath(path: HarmonicPath): boolean {
  return path.techniques?.includes("composer-seed") === true;
}
