/**
 * engine/compose/bass.ts - PRD-001 Phase 4 Slice 3 (D69).
 *
 * Bass PITCH resolution for the authored bass patterns (patterns.ts
 * owns the RHYTHM). Seeded per-idiom resolvers, fully deterministic
 * given the rng stream:
 *
 *  - root/third/fifth/seventh: chord tone of the cell (mod-12 pc off
 *    the RAW quality table - the bass reads the full chord, not the
 *    voicing tone map); octave = nearest to the PREVIOUS bass pitch
 *    clamped into register (voice-lead by proximity); first note =
 *    root at regLo + mod12 offset.
 *  - b7: minor 7th above root (dominant idiom); on a maj7-family
 *    chord it resolves to the maj7 - the boogie cell stays inside the
 *    chord, honest to the label.
 *  - nextApproach (walking only): the last hit before the next
 *    sounding cell targets the next root via rng.pick over the VALID
 *    approach set: chromatic-below, chromatic-above, diatonic-step
 *    (whole/half) below. Members that leave the register or are
 *    unreachable (> 12 st from the previous pitch) are excluded;
 *    empty set -> nearest chord tone (no draw). key === null excludes
 *    the diatonic step (chromatic only - deterministic without a key).
 *    END OF GRID (no next sounding cell) -> approach degrades to the
 *    FIFTH (documented, no draw). Rests BETWEEN cells do NOT degrade:
 *    nextSoundingCell SKIPS rests and targets the next sounding cell
 *    (D69 errata, fix round - pinned in bass.test.ts).
 *  - Slash bass: cell.bassPc != null -> the "root" token plays bassPc
 *    (inversions honored - REQ-COMP-31 adjacent honesty).
 *  - Rest cells: no hits, no draws (rests consume NOTHING from the
 *    stream - documented; grid edits shift the stream by design, seed
 *    semantics).
 *
 * DEVIATION (documented): the D69 sketch signature omits the per-cell
 * BEAT COUNT - but the tiled hit list (D66 tiling) depends on it, so
 * `cellBeats` is a required parallel input. Output alignment is
 * unchanged: pitches per bar per slot, aligned to the PRE-FILTER
 * tiled hit order (D67/D69 contract).
 *
 * Purity: relative imports only, no clock, no randomness of its own
 * (Rng INJECTED), no console.
 */

import { qualityIntervals } from "../core/chords";
import type { Rng } from "../core/rng";
import type { MidiRange, StyleProfile } from "../styles/types";
import type { KeyCandidate } from "./types";
import { tiledHits, type BassTone, type PatternEntry } from "./patterns";
import type { BassHitPitch, ChordCell } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Pitch with `pc` nearest `around` (tie -> lower). */
function nearestOctave(pc: number, around: number): number {
  const base = around - mod12(around - pc);
  let best = base;
  for (const c of [base + 12, base - 12]) {
    if (Math.abs(c - around) < Math.abs(best - around)) best = c;
  }
  return best;
}

function clampRegister(pitch: number, reg: MidiRange): number {
  let p = pitch;
  while (p < reg[0]) p += 12;
  while (p > reg[1]) p -= 12;
  return p;
}

/** The scale pcs of a key (major / natural minor). */
function scalePcs(key: KeyCandidate): readonly number[] {
  const steps = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((s) => mod12(key.tonicPc + s));
}

/** Resolve one tone token to a pitch class for the cell. */
function tonePc(token: BassTone, cell: ChordCell): number | null {
  const iv = qualityIntervals(cell.qualitySymbol);
  if (iv === null) return null;
  const pcs = iv.map((i) => mod12(cell.rootPc + i));
  switch (token) {
    case "root":
      return cell.bassPc !== null ? mod12(cell.bassPc) : mod12(cell.rootPc);
    case "third": {
      const t = [4, 3, 5].find((x) => pcs.some((p) => mod12(p - cell.rootPc) === x));
      return t === undefined ? null : mod12(cell.rootPc + t);
    }
    case "fifth": {
      const t = [7, 6, 8].find((x) => pcs.some((p) => mod12(p - cell.rootPc) === x));
      return t === undefined ? null : mod12(cell.rootPc + t);
    }
    case "seventh": {
      const t = [10, 11, 9].find((x) => pcs.some((p) => mod12(p - cell.rootPc) === x));
      return t === undefined ? null : mod12(cell.rootPc + t);
    }
    case "b7":
      // Dominant idiom; maj7-family chords keep the cell inside the
      // chord (maj7) - honest to the boogie label.
      return pcs.some((p) => mod12(p - cell.rootPc) === 11)
        ? mod12(cell.rootPc + 11)
        : mod12(cell.rootPc + 10);
    case "nextApproach":
      return null; // handled by the approach resolver
  }
}

/** The next sounding (non-rest, known-quality) cell strictly after
 *  (bar, slot), or null at end-of-grid. Carries its BAR for the D74
 *  approach annotation target. */
function nextSoundingCell(
  cells: readonly (readonly ChordCell[])[],
  bar: number,
  slot: number,
): { cell: ChordCell; bar: number } | null {
  for (let b = bar; b < cells.length; b++) {
    const from = b === bar ? slot + 1 : 0;
    for (let s = from; s < cells[b].length; s++) {
      const c = cells[b][s];
      if (!c.isRest && qualityIntervals(c.qualitySymbol) !== null) return { cell: c, bar: b };
    }
  }
  return null;
}

interface ApproachResult {
  readonly pitch: number;
  readonly kind: BassHitPitch["approach"];
  readonly targetPc: number | null;
  readonly targetBar: number | null;
  readonly drew: boolean;
}

/** Resolve the walking approach note (D69): rng.pick over the valid
 *  approach set toward the next root. */
function resolveApproach(
  next: { cell: ChordCell; bar: number },
  prevPitch: number | null,
  current: ChordCell,
  key: KeyCandidate | null,
  rng: Rng,
  register: MidiRange,
): ApproachResult {
  const [lo, hi] = register;
  const targetPc = next.cell.bassPc !== null ? mod12(next.cell.bassPc) : mod12(next.cell.rootPc);
  const around = prevPitch ?? lo;
  const target = clampRegister(nearestOctave(targetPc, around), register);
  const reachable = (p: number): boolean =>
    p >= lo && p <= hi && (prevPitch === null || Math.abs(p - prevPitch) <= 12);

  type Cand = { pitch: number; kind: "chromatic" | "stepwise" };
  const cands: Cand[] = [];
  const below = { pitch: target - 1, kind: "chromatic" as const };
  const above = { pitch: target + 1, kind: "chromatic" as const };
  if (reachable(below.pitch)) cands.push(below);
  if (reachable(above.pitch)) cands.push(above);
  if (key !== null) {
    const scale = scalePcs(key);
    for (let d = 1; d <= 2; d++) {
      const pc = mod12(targetPc - d);
      if (scale.includes(pc)) {
        const step = { pitch: target - d, kind: "stepwise" as const };
        if (reachable(step.pitch)) cands.push(step);
        break; // nearest diatonic step below only
      }
    }
  }
  if (cands.length === 0) {
    // Empty set -> nearest chord tone of the CURRENT cell (no draw).
    const rootPc = mod12(current.rootPc);
    const p = clampRegister(nearestOctave(rootPc, around), register);
    return { pitch: p, kind: "fallback", targetPc, targetBar: next.bar, drew: false };
  }
  // rng.pick consumes exactly one draw when the set is non-empty.
  const chosen = rng.pick(cands);
  return { pitch: chosen.pitch, kind: chosen.kind, targetPc, targetBar: next.bar, drew: true };
}

/**
 * Resolve bass pitches for every sounding cell. `cellBeats` is the
 * per-cell beat budget from the D66 tiling rule (floor of cell ticks /
 * ppq quarters), parallel to `cells`.
 */
export function resolveBassPitches(
  entry: PatternEntry,
  cells: readonly (readonly ChordCell[])[],
  cellBeats: readonly (readonly number[])[],
  profile: StyleProfile,
  key: KeyCandidate | null,
  rng: Rng,
  register: MidiRange,
): readonly (readonly (readonly BassHitPitch[])[])[] {
  void profile; // the resolver reads the DATA (entry + cells), the
  // profile's role is the register + feel affinity at realization.
  let prevPitch: number | null = null;
  return cells.map((slots, bar) =>
    slots.map((cell, slot) => {
      const beats = cellBeats[bar]?.[slot] ?? 0;
      const hits = tiledHits(entry, beats);
      if (cell.isRest || hits.length === 0) return []; // rests consume NOTHING
      if (qualityIntervals(cell.qualitySymbol) === null) return []; // unknown -> silent
      // Chronological walk for voice-lead state; output stays aligned
      // to the authored (hit-major) tiled order.
      const order = hits.map((_, i) => i).sort((a, b) => {
        const ha = hits[a];
        const hb = hits[b];
        return ha.beat !== hb.beat ? ha.beat - hb.beat : ha.step - hb.step;
      });
      const out: BassHitPitch[] = new Array(hits.length);
      for (const idx of order) {
        const h = hits[idx];
        const token = h.tone ?? "root";
        let record: BassHitPitch;
        if (token === "nextApproach") {
          const next = nextSoundingCell(cells, bar, slot);
          if (next === null) {
            // End of grid / no next sounding cell: degrade to fifth.
            const fifthPc = tonePc("fifth", cell);
            const p = clampRegister(
              nearestOctave(fifthPc ?? mod12(cell.rootPc), prevPitch ?? register[0]),
              register,
            );
            record = {
              midi: p,
              approach: "fifth",
              approachTargetPc: null,
              approachTargetBar: null,
            };
            prevPitch = p;
          } else {
            const r = resolveApproach(next, prevPitch, cell, key, rng, register);
            record = {
              midi: r.pitch,
              approach: r.kind,
              approachTargetPc: r.targetPc,
              approachTargetBar: r.targetBar,
            };
            prevPitch = r.pitch;
          }
        } else {
          const pc = tonePc(token, cell);
          if (pc === null) {
            record = {
              midi: clampRegister(
                nearestOctave(mod12(cell.rootPc), prevPitch ?? register[0]),
                register,
              ),
              approach: null,
              approachTargetPc: null,
              approachTargetBar: null,
            };
          } else {
            record = {
              midi:
                prevPitch === null
                  ? register[0] + mod12(pc - register[0])
                  : clampRegister(nearestOctave(pc, prevPitch), register),
              approach: null,
              approachTargetPc: null,
              approachTargetBar: null,
            };
          }
          prevPitch = record.midi;
        }
        out[idx] = record;
      }
      return out;
    }),
  );
}

/** Count the rng draws a resolved bass pass consumed (the pick calls
 *  on non-empty approach sets) - for the plan's drawCount. */
export function countBassDraws(
  pitches: readonly (readonly (readonly BassHitPitch[])[])[],
): number {
  let n = 0;
  for (const bar of pitches) {
    for (const slot of bar) {
      for (const h of slot) {
        if (h.approach === "chromatic" || h.approach === "stepwise") n++;
      }
    }
  }
  return n;
}
