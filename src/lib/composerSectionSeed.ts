/**
 * composerSectionSeed.ts — turn a SectionChart (non-bar composer) into
 * a HarmonicPath. Complements `composerPathSeed.ts` which only handles
 * bar-by-bar composers. Per-kind synthesizers:
 *
 *   - BitonalBlock (Stravinsky): alternating triads, one bar each
 *   - RowMatrix (Schoenberg): walk the 12-tone row, 3 notes per bar
 *   - AxisSystem (Bartók): rotate through tonic axis, 1 chord/bar
 *   - DurationStructure (Cage): silence placeholders, 1 bar each
 *   - LayerStack (Eno): drone + layer-description per bar
 *   - GenericSectionChart: iterate raw lines as chord-name steps
 *
 * All paths cycle to MIN_PATH_BARS via padPath().
 *
 * v1 limitation: no audio playback. The path is structurally valid
 * (satisfies the bar invariant) and visually shows the chart content
 * in the bar strip, but the user hears silence (or a placeholder
 * drone). Future: per-kind audio synthesis.
 */

import {
  getComposerChart,
  type ComposerId,
  type BitonalBlock,
  type RowMatrix,
  type AxisSystem,
  type DurationStructure,
  type LayerStack,
  type GenericSectionChart,
} from "./composerCatalog";
import type { HarmonicPath, HarmonicStep } from "./pathsHelpers";
import { padPath, MIN_PATH_BARS, STEPS_PER_BAR } from "./pathsHelpers";
import { pcFromNoteName } from "./composerCatalog";

/** Composer ids that have only section charts (handled here). */
export const SECTION_COMPOSER_IDS: ComposerId[] = [
  "debussy", "stravinsky", "schoenberg", "bartok", "cage",
  "stockhausen", "minimalists", "ornette-coleman", "brian-eno",
  "ravi-shankar",
];

// ---------------------------------------------------------------------------
// Per-kind step builders
// ---------------------------------------------------------------------------

/** One step holding a single MIDI pitch (used for drone + silence bars). */
function droneStep(name: string, pc: number, description: string): HarmonicStep {
  return { name, notes: [60 + pc], descriptions: description };
}

/** One step with multi-note chord (used for triads / quartals). */
function chordStep(
  name: string,
  pcs: number[],
  description: string,
): HarmonicStep {
  return { name, notes: pcs.map((pc) => 60 + pc), descriptions: description };
}

/** Three voices of a triad in root position. */
function triad(root: number, quality: "maj" | "min" | "aug" | "dim"): number[] {
  const third = quality === "min" ? 3 : quality === "dim" ? 3 : quality === "aug" ? 4 : 4;
  const fifth = quality === "dim" ? 6 : quality === "aug" ? 8 : 7;
  return [root, root + third, root + fifth];
}

// ---------------------------------------------------------------------------
// Per-kind synthesizers
// ---------------------------------------------------------------------------

function seedBitonalPath(chart: BitonalBlock, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  const [pair] = chart.pairs;
  const root1 = pair.root1;
  const root2 = pair.root2;
  // Alternate the two triads: bar 1 = triad1, bar 2 = triad2, etc.
  const stepPairs: HarmonicStep[] = [];
  for (let i = 0; i < opts.targetBars; i++) {
    const root = i % 2 === 0 ? root1 : root2;
    const triadNotes = triad(root, "maj");
    const name = i % 2 === 0
      ? `${noteName(root1)} major`
      : `${noteName(root2)} major`;
    const desc = `Bitonal (tritone): ${noteName(root1)} + ${noteName(root2)} — two major triads a tritone apart (Stravinsky)`;
    stepPairs.push(chordStep(name, triadNotes, desc));
    // Repeat STEPS_PER_BAR times to fill one bar
    for (let s = 1; s < STEPS_PER_BAR; s++) {
      stepPairs.push({ name, notes: triadNotes, descriptions: desc });
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

function seedRowPath(chart: RowMatrix, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  // Walk P0, 3 notes per bar (4-step groups → 4 bars = 12 notes → cycle)
  const stepPairs: HarmonicStep[] = [];
  const row = chart.forms.P0;
  let idx = 0;
  for (let bar = 0; bar < opts.targetBars; bar++) {
    const group: number[] = [];
    for (let n = 0; n < 3; n++) {
      group.push(row[idx % row.length]);
      idx++;
    }
    const name = `Row group ${bar + 1}: ${group.map(noteName).join(" – ")}`;
    const desc = "Schoenberg twelve-tone row (P0) — 3 notes per bar, full row cycles every 4 bars.";
    stepPairs.push(chordStep(name, group, desc));
    for (let s = 1; s < STEPS_PER_BAR; s++) {
      stepPairs.push({ name, notes: group, descriptions: desc });
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

function seedAxisPath(chart: AxisSystem, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  // Rotate through the tonic axis (4 keys), one chord per bar, then cycle
  const stepPairs: HarmonicStep[] = [];
  for (let bar = 0; bar < opts.targetBars; bar++) {
    const root = chart.tonicAxis[bar % chart.tonicAxis.length];
    const notes = triad(root, "maj");
    const name = `${noteName(root)} (tonic axis)`;
    const desc = `Bartók tonic axis: ${chart.tonicAxis.map(noteName).join(" – ")} — symmetrical, non-functional.`;
    stepPairs.push(chordStep(name, notes, desc));
    for (let s = 1; s < STEPS_PER_BAR; s++) {
      stepPairs.push({ name, notes, descriptions: desc });
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

function seedDurationPath(chart: DurationStructure, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  // "Silence" — each bar is a single C4 drone with the movement's
  // description. No audio content (C4 is just a placeholder for the
  // engine to play something), but the path is structurally valid.
  const stepPairs: HarmonicStep[] = [];
  for (let bar = 0; bar < opts.targetBars; bar++) {
    const mov = chart.movements[bar % chart.movements.length];
    const seconds = mov.seconds;
    const name = `Silence (Movement ${mov.label})`;
    const desc = `4′33″ — Movement ${mov.label}, ${seconds}s of intentional silence. Structural duration, not literal performance.`;
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      stepPairs.push(droneStep(name, 0, desc));
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

function seedLayerPath(chart: LayerStack, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  // Drone chord (C major triad) sustained + per-bar layer name as
  // description. Polyrhythm of differently-paced loops is the
  // compositional idea; this path renders the drone only.
  const drone = triad(0, "maj"); // C major
  const stepPairs: HarmonicStep[] = [];
  for (let bar = 0; bar < opts.targetBars; bar++) {
    const layer = chart.layers[bar % chart.layers.length];
    const name = `Drone + Layer ${layer.index}`;
    const desc = `${layer.description} (Eno Music for Airports). Drone sustains; loop layers polyrhythm against it.`;
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      stepPairs.push(chordStep(name, drone, desc));
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

function seedGenericSectionPath(chart: GenericSectionChart, opts: { targetBars: number; idPrefix: string }): HarmonicPath {
  const stepPairs: HarmonicStep[] = [];
  for (let bar = 0; bar < opts.targetBars; bar++) {
    const line = chart.raw[bar % chart.raw.length] ?? `${chart.composerName} section ${bar + 1}`;
    const name = line.length > 32 ? line.slice(0, 32) + "…" : line;
    const desc = line;
    // Use a drone on pc 0 (C) as a structural placeholder. For composers
    // whose charts are drone-based (Shankar's tanpura), this is musically
    // honest. For others, the path is a visual reference, not audio.
    const step = bar % 4 < 2
      ? droneStep(name, 0, desc)
      : chordStep(name, [0, 7], desc); // C5 + G5 for variety
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      stepPairs.push({ ...step });
    }
  }
  return buildSectionPath(chart, opts, stepPairs);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const noteName = (pc: number): string => {
  const names = [
    "C", "C#", "D", "Eb", "E", "F",
    "F#", "G", "Ab", "A", "Bb", "B",
  ];
  return names[((pc % 12) + 12) % 12];
};

function buildSectionPath(
  chart: { composerId: ComposerId; composerName: string; description: string; kind: string },
  opts: { targetBars: number; idPrefix: string },
  steps: HarmonicStep[],
): HarmonicPath {
  const path: HarmonicPath = {
    id: `${opts.idPrefix}-${opts.targetBars}b`,
    title: `${chart.composerName} study (${opts.targetBars} bars, ${chart.kind})`,
    name: `${chart.composerName} study (${opts.targetBars} bars, ${chart.kind})`,
    description: `${chart.composerName} ${chart.kind} reduction, seeded from docs/COMPOSER-HARMONIC-INNOVATIONS.md. ${chart.description}. Study reduction, not literal transcription.`,
    steps,
    mvpReady: true,
    composer: chart.composerName,
    techniques: ["composer-seed", "catalog-driven", `kind:${chart.kind}`],
  };
  return padPath(path);
}

/**
 * Seed a HarmonicPath from any section-chart composer. Returns null
 * if the composer has no section chart (callers should check
 * `SECTION_COMPOSER_IDS` first).
 */
export function seedSectionPathFromComposer(
  composerId: ComposerId,
  opts: { targetBars?: number; idPrefix?: string } = {},
): HarmonicPath | null {
  const chart = getComposerChart(composerId);
  if (!chart) return null;
  if (chart.kind === "bar") return null; // bar composers use the other seeder

  const targetBars = opts.targetBars ?? MIN_PATH_BARS;
  const idPrefix = opts.idPrefix ?? `seed-${composerId}`;

  switch (chart.kind) {
    case "bitonal":
      return seedBitonalPath(chart, { targetBars, idPrefix });
    case "row":
      return seedRowPath(chart, { targetBars, idPrefix });
    case "axis":
      return seedAxisPath(chart, { targetBars, idPrefix });
    case "duration":
      return seedDurationPath(chart, { targetBars, idPrefix });
    case "layer":
      return seedLayerPath(chart, { targetBars, idPrefix });
    case "section":
      return seedGenericSectionPath(chart, { targetBars, idPrefix });
  }
}

/** Generate one demo path per section composer (10 paths). */
export function seedAllSectionDemoPaths(): HarmonicPath[] {
  const paths: HarmonicPath[] = [];
  for (const id of SECTION_COMPOSER_IDS) {
    const p = seedSectionPathFromComposer(id);
    if (p) paths.push(p);
  }
  return paths;
}
