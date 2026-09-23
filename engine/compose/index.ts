/**
 * engine/compose/index.ts - PRD-001 Phase 4 Slice 1 (D49 pipeline +
 * the public Compose surface S2/S3/S4 import).
 *
 * analyzeProject(project, opts) wraps every analyzer stage into one
 * Outcome<ComposeAnalysis> and NEVER throws into the UI (REQ-COMP-15 /
 * NFR-5): a stage bug is caught and surfaced as an "internal" error arm
 * with a generic message (never a stack). Truthful annotations ride
 * alongside (REQ-PED-1) using the EXISTING pedagogy target kinds.
 *
 * This file is the "assemble / index surface" the Slice 1 brief names;
 * the design's file tree lists the seven feature modules but D49 /
 * section 3 require the top-level pipeline, so it lives here.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { spellTonic } from "../core/spelling";
import type { Annotation } from "../pedagogy/types";
import { classifyRoles } from "./roles";
import { detectKey } from "./key";
import { extractMelody } from "./melody";
import { inferChords, segmentGrid } from "./harmony";
import { defaultWindow } from "./tempo";
import type {
  AnalysisWindow,
  ChordGrid,
  ComposeAnalysis,
  KeyCandidate,
  KeyResult,
  MelodyResult,
  NormalizedProject,
  Outcome,
} from "./types";

export const COMPOSE_ANALYSIS_VERSION = 1;

export interface AnalyzeOptions {
  readonly window?: AnalysisWindow;
  readonly slotsPerBar?: number;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function inferenceKey(key: KeyResult): KeyCandidate {
  if (key.declared) {
    return { tonicPc: key.declared.tonicPc, mode: key.declared.mode, correlation: 1 };
  }
  return key.candidates[0] ?? { tonicPc: 0, mode: "major", correlation: 0 };
}

function buildAnnotations(
  key: KeyResult,
  melody: MelodyResult,
  grid: ChordGrid,
): readonly Annotation[] {
  const anns: Annotation[] = [];

  if (!key.chromaticFallback && key.candidates.length > 0) {
    const top = key.candidates[0];
    const tonic = spellTonic(top.tonicPc, top.mode, "");
    anns.push({
      version: 1,
      id: "ann-key-0",
      target: { kind: "scale" },
      label: "Key",
      text: `Detected ${tonic} ${top.mode} (r=${top.correlation.toFixed(2)}).`,
      conceptId: null,
      confidence: top.correlation,
    });
  }

  // ii-V-I over single-slot bars (the S1 default grid).
  if (grid.slotsPerBar === 1) {
    const cells = grid.bars.map((b) => b.slots[0]);
    for (let i = 0; i + 2 < cells.length; i++) {
      const a = cells[i];
      const b = cells[i + 1];
      const c = cells[i + 2];
      if (a.isRest || b.isRest || c.isRest) continue;
      const resolves = c.qualitySymbol === "maj7" || c.qualitySymbol === "maj" || c.qualitySymbol === "m7";
      if (
        a.qualitySymbol === "m7" &&
        b.qualitySymbol === "dom7" &&
        resolves &&
        mod12(a.rootPc + 5) === b.rootPc &&
        mod12(b.rootPc + 5) === c.rootPc
      ) {
        anns.push({
          version: 1,
          id: `ann-iivi-${i}`,
          target: { kind: "progression", fromBar: i, toBar: i + 2 },
          label: "ii-V-I",
          text: `ii-V-I detected bars ${i + 1}-${i + 3}.`,
          conceptId: "ii-v-i",
          confidence: 1,
        });
      }
    }
  }

  anns.push({
    version: 1,
    id: "ann-melody-0",
    target: { kind: "melody" },
    label: "Melody",
    text: melody.synthesized
      ? "Melody synthesized from the top sounding line."
      : `Melody taken from track ${melody.sourceTrackIndex}.`,
    conceptId: null,
    confidence: null,
  });

  return anns;
}

export function analyzeProject(
  project: NormalizedProject,
  opts: AnalyzeOptions = {},
): Outcome<ComposeAnalysis> {
  try {
    const slotsPerBar = opts.slotsPerBar ?? 1;
    const window = opts.window ?? defaultWindow(project);
    const truncated = project.endTick > window.toTick;
    const roles = classifyRoles(project);
    const percussionOnly = !project.tracks.some((t) => !t.isPercussion && t.notes.length > 0);
    const key = detectKey(project, window);
    const melody = extractMelody(project, roles, window);
    const grid = inferChords(project, segmentGrid(project, window, slotsPerBar), inferenceKey(key));
    const annotations = buildAnnotations(key, melody, grid);
    return {
      ok: true,
      value: {
        version: COMPOSE_ANALYSIS_VERSION,
        roles,
        key,
        melody,
        grid,
        window,
        truncated,
        percussionOnly,
        annotations,
      },
    };
  } catch {
    return { ok: false, error: { code: "internal", message: "analysis failed" } };
  }
}

// Public surface (S2/S3/S4 import from here or the feature modules).
export * from "./types";
export { normalizeMidiJson, MAX_NOTES } from "./normalize";
export { ticksPerBar, barBoundaries, ticksToSeconds, secondsToTicks, defaultWindow } from "./tempo";
export { classifyRoles, ROLE_WEIGHTS, ROLE_THRESHOLDS } from "./roles";
export { detectKey, pcProfile, pearson, KK_MAJOR, KK_MINOR, KEY_THRESHOLDS } from "./key";
export { extractMelody } from "./melody";
export { segmentGrid, inferChords, reinferBar, HARMONY_WEIGHTS } from "./harmony";
