/**
 * engine/compose/harmony.ts - PRD-001 Phase 4 Slice 1 (REQ-COMP-12/13/23).
 *
 * Chord inference over tick-aligned bar regions. segmentGrid lays the
 * empty (all-rest) grid; inferChords fills each slot by template-
 * matching the region's duration- x metric-weighted pitch-class histogram
 * against the shared core/chords qualities, scoring coverage minus
 * foreign mass minus a missing-tone penalty and a wrong-bass penalty,
 * with a small diatonic-to-key bonus that breaks relative major/minor
 * ties. Every cell carries a calibrated confidence and the next three
 * best (root, quality) alternatives (each alternative itself carries an
 * empty nested list). reinferBar re-runs one bar at 1 or 2 slots for the
 * S2 split editor.
 *
 * All arithmetic is pure and deterministic - no rng, no clock.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { QUALITY_INTERVALS, spellChordName } from "../core/chords";
import { barBoundaries } from "./tempo";
import { restCell } from "./types";
import type {
  AnalysisWindow,
  BarRegions,
  ChordCell,
  ChordGrid,
  KeyCandidate,
  NormalizedNote,
  NormalizedProject,
  ProjectTimeSignature,
} from "./types";

/** Scoring constants (named + exported for tests). */
export const HARMONY_WEIGHTS = {
  foreignPenalty: 0.6,
  missingPenalty: 0.3,
  wrongBassPenalty: 0.25,
  diatonicBonus: 0.05,
  twoNoteCap: 0.6, // ambiguous by nature
  carryOverFactor: 0.5, // sus-style continuation
} as const;

const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 10];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

interface RegionNote {
  readonly pc: number;
  readonly midi: number;
  readonly tick: number;
  readonly dur: number;
}

interface TemplateResult {
  readonly root: number;
  readonly quality: string;
  readonly score: number;
  readonly inTemplate: ReadonlySet<number>;
}

function activeTimeSignature(project: NormalizedProject, tick: number): ProjectTimeSignature {
  let active: ProjectTimeSignature | null = null;
  for (const ts of project.timeSignatures) {
    if (ts.tick <= tick) active = ts;
    else break;
  }
  return active ?? { tick: 0, numerator: 4, denominator: 4 };
}

function metricWeight(onsetTick: number, barStart: number, beatTicks: number): number {
  if (beatTicks <= 0) return 0.3;
  const rel = onsetTick - barStart;
  const nearest = Math.round(rel / beatTicks);
  const dist = Math.abs(rel - nearest * beatTicks);
  const onBeat = dist <= beatTicks * 0.15;
  if (onBeat && nearest === 0) return 1.0; // downbeat
  if (onBeat) return 0.6; // other beats
  return 0.3; // off-beats
}

function collectNotes(project: NormalizedProject): RegionNote[] {
  const out: RegionNote[] = [];
  for (const t of project.tracks) {
    if (t.isPercussion) continue;
    for (const n of t.notes) {
      out.push({ pc: mod12(n.midi), midi: n.midi, tick: n.tick, dur: Math.max(1, n.durationTicks) });
    }
  }
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

function lowerBound(notes: readonly RegionNote[], tick: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function diatonicPcs(key: KeyCandidate): ReadonlySet<number> {
  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  return new Set(scale.map((o) => mod12(key.tonicPc + o)));
}

const QUALITY_ORDER: readonly string[] = Object.keys(QUALITY_INTERVALS);

function scoreTemplates(pcW: readonly number[], total: number, bassPc: number, key: KeyCandidate): TemplateResult[] {
  const diatonic = diatonicPcs(key);
  const results: TemplateResult[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITY_ORDER) {
      const intervals = QUALITY_INTERVALS[quality];
      const inTemplate = new Set<number>();
      for (const iv of intervals) inTemplate.add(mod12(root + iv));
      let covered = 0;
      let foreign = 0;
      let present = 0;
      for (let p = 0; p < 12; p++) {
        if (pcW[p] <= 0) continue;
        if (inTemplate.has(p)) covered += pcW[p];
        else foreign += pcW[p];
      }
      for (const p of inTemplate) if (pcW[p] > 0) present++;
      const coverage = covered / total;
      const foreignRatio = foreign / total;
      const missing = (inTemplate.size - present) / inTemplate.size;
      let score = coverage - HARMONY_WEIGHTS.foreignPenalty * foreignRatio - HARMONY_WEIGHTS.missingPenalty * missing;
      if (bassPc !== root && !inTemplate.has(bassPc)) score -= HARMONY_WEIGHTS.wrongBassPenalty;
      if (diatonic.has(root)) score += HARMONY_WEIGHTS.diatonicBonus;
      results.push({ root, quality, score, inTemplate });
    }
  }
  results.sort(
    (a, b) =>
      b.score - a.score ||
      // Symmetric-set ties (e.g. Bm7b5 vs Dm6/B - identical pc sets):
      // prefer ROOT POSITION (bass == chord root) so the plain reading
      // wins and the slash/inversion reading is demoted to alternatives.
      // Root-ascending alone made the alphabetically-lower root steal
      // the cell (tester finding: Bm7b5 reported as Dm6/B, conf 1.00).
      (bassPc === a.root ? 0 : 1) - (bassPc === b.root ? 0 : 1) ||
      a.root - b.root ||
      QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality),
  );
  return results;
}

function buildCell(
  r: TemplateResult,
  key: KeyCandidate,
  bassPc: number,
  distinct: number,
): ChordCell {
  let confidence = clamp01(r.score);
  if (distinct <= 2) confidence = Math.min(confidence, HARMONY_WEIGHTS.twoNoteCap);
  const baseName = spellChordName(r.root, r.quality, key.tonicPc, key.mode);
  const isSlash = bassPc !== r.root && r.inTemplate.has(bassPc);
  const name = isSlash
    ? `${baseName}/${spellChordName(bassPc, "", key.tonicPc, key.mode)}`
    : baseName;
  return {
    rootPc: r.root,
    qualitySymbol: r.quality,
    name,
    bassPc: bassPc !== r.root ? bassPc : null,
    confidence,
    alternatives: [],
    isRest: false,
  };
}

function inferCell(
  notes: readonly RegionNote[],
  slotStart: number,
  slotEnd: number,
  barStart: number,
  beatTicks: number,
  key: KeyCandidate,
  lastChosen: ChordCell | null,
): ChordCell {
  const lo = lowerBound(notes, slotStart);
  const pcW = new Array<number>(12).fill(0);
  let total = 0;
  let firstHalf: RegionNote[] = [];
  let allInRange: RegionNote[] = [];
  const mid = (slotStart + slotEnd) / 2;
  for (let i = lo; i < notes.length; i++) {
    const n = notes[i];
    if (n.tick >= slotEnd) break;
    const w = n.dur * metricWeight(n.tick, barStart, beatTicks);
    if (w <= 0) continue;
    pcW[n.pc] += w;
    total += w;
    allInRange.push(n);
    if (n.tick < mid) firstHalf.push(n);
  }
  if (allInRange.length === 0 || total <= 0) return restCell();

  const distinct = pcW.filter((x) => x > 0).length;

  // Bass: lowest pitch in the first half of the region (fallback: overall lowest).
  const bassSource = firstHalf.length > 0 ? firstHalf : allInRange;
  let bassMidi = bassSource[0].midi;
  for (const n of bassSource) if (n.midi < bassMidi) bassMidi = n.midi;
  const bassPc = mod12(bassMidi);

  if (distinct < 2) {
    if (lastChosen !== null) {
      return {
        ...lastChosen,
        confidence: clamp01(lastChosen.confidence * HARMONY_WEIGHTS.carryOverFactor),
        alternatives: [],
      };
    }
    return restCell();
  }

  const ranked = scoreTemplates(pcW, total, bassPc, key);
  const chosen = buildCell(ranked[0], key, bassPc, distinct);
  const alternatives = ranked.slice(1, 4).map((r) => buildCell(r, key, bassPc, distinct));
  return { ...chosen, alternatives };
}

function regionSlots(
  project: NormalizedProject,
  notes: readonly RegionNote[],
  startTick: number,
  endTick: number,
  slotsPerBar: number,
  key: KeyCandidate,
  lastChosen: ChordCell | null,
): ChordCell[] {
  const ts = activeTimeSignature(project, startTick);
  const barLen = endTick - startTick;
  const beatTicks = ts.numerator > 0 ? barLen / ts.numerator : barLen / 4;
  const cells: ChordCell[] = [];
  let last = lastChosen;
  for (let s = 0; s < slotsPerBar; s++) {
    const sStart = startTick + Math.round((barLen * s) / slotsPerBar);
    const sEnd = startTick + Math.round((barLen * (s + 1)) / slotsPerBar);
    const cell = inferCell(notes, sStart, sEnd, startTick, beatTicks, key, last);
    if (!cell.isRest) last = cell;
    cells.push(cell);
  }
  return cells;
}

/** Empty grid: one BarRegions per bar in the window, all-rest cells. */
export function segmentGrid(
  project: NormalizedProject,
  window: AnalysisWindow,
  slotsPerBar: number,
): ChordGrid {
  const upTo = Math.min(window.toTick, project.endTick);
  const boundaries = barBoundaries(project, upTo);
  const slots = Math.max(1, slotsPerBar);
  const bars: BarRegions[] = boundaries.map((b) => ({
    bar: 0,
    startTick: b.startTick,
    endTick: b.endTick,
    slots: Array.from({ length: slots }, () => restCell()),
  }));
  bars.forEach((_, i) => (bars[i] = { ...bars[i], bar: i }));
  return { slotsPerBar: slots, bars };
}

/** Fill every cell via template inference. Returns a NEW grid. */
export function inferChords(
  project: NormalizedProject,
  grid: ChordGrid,
  key: KeyCandidate,
): ChordGrid {
  const notes = collectNotes(project);
  const bars: BarRegions[] = [];
  let last: ChordCell | null = null;
  for (const region of grid.bars) {
    const cells = regionSlots(project, notes, region.startTick, region.endTick, grid.slotsPerBar, key, last);
    for (const c of cells) if (!c.isRest) last = c;
    bars.push({ bar: region.bar, startTick: region.startTick, endTick: region.endTick, slots: cells });
  }
  return { slotsPerBar: grid.slotsPerBar, bars };
}

/** S2 split support: re-infer one bar at 1 or 2 slots. */
export function reinferBar(
  project: NormalizedProject,
  grid: ChordGrid,
  bar: number,
  key: KeyCandidate,
  slots: 1 | 2,
): readonly ChordCell[] {
  const notes = collectNotes(project);
  const region = grid.bars.find((b) => b.bar === bar);
  if (!region) return [];
  const prevBar = grid.bars.find((b) => b.bar === bar - 1);
  const last = prevBar && prevBar.slots.length > 0 ? prevBar.slots[prevBar.slots.length - 1] : null;
  return regionSlots(project, notes, region.startTick, region.endTick, slots, key, last);
}
