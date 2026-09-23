/**
 * engine/compose/voicing.ts - PRD-001 Phase 4 Slice 3 (D68).
 *
 * Clean-room SEQUENTIAL voice-lead for the accompaniment engine. The
 * etude path (engine/etude/harmony.ts step 7) realizes EACH chord
 * INDEPENDENTLY - no prev-chord state - so REQ-COMP-31 "smooth across
 * chord changes" needs what the etude never had. D47 precedent: shared
 * TABLES in core, algorithms may duplicate where semantics differ. The
 * drop2 PERMUTATION formula is one line of shared knowledge (same as
 * etude step 7, cross-referenced below); the surrounding voice-lead is
 * new.
 *
 * DRAW-ORDER CONTRACT (part of REQ-FND-3 reproducibility, pinned by
 * the accompany.ts determinism matrix; model: engine/etude/assemble.ts
 * header): chords pass (bars ascending, slots ascending, rootless bool
 * per eligible cell) -> pad pass (same shape, NO rootless draws) ->
 * bass pass (bass.ts). Density NEVER enters draw order (D67 filters
 * AFTER pitching).
 *
 * Every VoicingProfile field has teeth (D68): style (5 shapes),
 * rootlessRate (draws), spreadBias (anchor + tie-break direction),
 * registers (containment), inversionAwareness (bassPc bottoms +
 * per-chord re-anchoring).
 *
 * Purity: relative imports only, no clock, no randomness of its own
 * (Rng INJECTED), no console.
 */

import { qualityIntervals } from "../core/chords";
import type { Rng } from "../core/rng";
import type { MidiRange, StyleProfile } from "../styles/types";
import type { ChordCell } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/**
 * TONE MAP (D68 rule 1, data, tested): qualitySymbol -> 3-4 selected
 * pitch classes as ASCENDING intervals above the root. Selection:
 * root, 3rd (4th for sus), 7th if present, top extension. 5-tone
 * qualities (alt/maj9/dom9/min9) DROP the 5th; intervals >= 12 fold
 * mod 12 (alt's b13 ships as interval 20 - the documented dedup).
 */
export const TONE_MAP: Readonly<Record<string, readonly number[]>> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  halfdim: [0, 3, 6, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  alt: [0, 4, 8, 10], // dom7 + b13 (20 mod 12 = 8); 5th dropped
  sus4: [0, 5, 7, 10], // 7sus4: root, 4th, 5th, b7
  maj6: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  majadd9: [0, 2, 4, 7], // add9 = 14 mod 12 = 2, folded ascending
  minadd9: [0, 2, 3, 7],
  maj9: [0, 2, 4, 11], // 5th dropped, 9th folded
  dom9: [0, 2, 4, 10],
  min9: [0, 2, 3, 10],
};

/** Tone intervals for a quality, or null when unknown (defensive path:
 *  the CALLER treats the cell as a rest and counts it, D68 rule 7). */
export function toneMap(qualitySymbol: string): readonly number[] | null {
  if (qualityIntervals(qualitySymbol) === null) return null;
  return TONE_MAP[qualitySymbol] ?? null;
}

/** Block style reads the RAW quality table (D68 rule 4: triad-only -
 *  root, 3rd-or-4th, 5th-or-b5; extensions dropped). */
export function blockTriadMap(qualitySymbol: string): readonly number[] | null {
  const iv = qualityIntervals(qualitySymbol);
  if (iv === null) return null;
  const pcs = [...new Set(iv.map(mod12))];
  const out = [0];
  const third = [4, 3, 5].find((t) => pcs.includes(t));
  const fifth = [7, 6, 8].find((t) => pcs.includes(t));
  if (third !== undefined) out.push(third);
  if (fifth !== undefined) out.push(fifth);
  return out.sort((a, b) => a - b);
}

export interface VoicingInput {
  /** Per bar, per slot (variable length - TD-043). */
  readonly cells: readonly (readonly ChordCell[])[];
  readonly profile: StyleProfile;
  /** Draws: rootless decisions ONLY (see draw-order header). */
  readonly rng: Rng;
  /** False unless the bass role is selected (D68 rule 5). */
  readonly allowRootless: boolean;
  /** Chords OR pad register (two independent passes). */
  readonly register: MidiRange;
  readonly rootlessRate?: number;
}

export interface VoicingResult {
  /** Per bar per slot: null = rest/unknown; ascending pitches inside
   *  the register. */
  readonly voicings: readonly (readonly (readonly number[] | null)[])[];
  /** Per bar per slot: the rootless DECISION actually applied. */
  readonly rootlessFlags: readonly (readonly boolean[])[];
  readonly quartalFallbackCount: number;
  readonly unknownQualityCount: number;
  /** rng.bool draws consumed (draw-order contract observability). */
  readonly drawCount: number;
  /** First bar where the drop2 permutation actually applied (>= 4
   *  voices) - the D74 drop-2 annotation gate; null = never. */
  readonly firstDrop2Bar: number | null;
}

/** Smallest pitch with `pc` at or above `at`. */
function atOrAbove(pc: number, at: number): number {
  return at + mod12(pc - at);
}

/** Pitch with `pc` nearest `around` (tie -> lower). */
function nearestOctave(pc: number, around: number): number {
  const base = around - mod12(around - pc);
  const cands = [base, base + 12, base - 12];
  let best = cands[0];
  for (const c of cands) {
    if (Math.abs(c - around) < Math.abs(best - around)) best = c;
  }
  return best;
}

/** Octave-shift `pitch` minimally into [lo, hi] (windows >= 21 st
 *  contain every pc - D68 rule 6 feasibility). */
function clampRegister(pitch: number, reg: MidiRange): number {
  let p = pitch;
  while (p < reg[0]) p += 12;
  while (p > reg[1]) p -= 12;
  return p;
}

/** Ascending stack: bottom `root`, then each pc at the first placement
 *  above the previous voice. */
function buildStack(root: number, restPcs: readonly number[]): number[] {
  const stack = [root];
  for (const pc of restPcs) stack.push(atOrAbove(pc, stack[stack.length - 1] + 1));
  return stack;
}

/**
 * Root-position-style stack (D68 rule 2): anchored at
 * `regLo + round(spreadBias * (regHi - regLo - span))` (span = the
 * tone set's top interval), bottom at the first placement >= anchor,
 * tones ascending nearest-octave-above, octave-fitted into register.
 */
export function firstVoicing(
  bottomPc: number,
  restPcs: readonly number[],
  span: number,
  profile: StyleProfile,
  register: MidiRange,
): readonly number[] {
  const [lo, hi] = register;
  const anchor = lo + Math.round(profile.voicing.spreadBias * Math.max(0, hi - lo - span));
  let bottom = atOrAbove(bottomPc, anchor);
  let stack = buildStack(bottom, restPcs);
  while (stack[stack.length - 1] > hi && stack[0] - 12 >= lo) {
    bottom -= 12;
    stack = buildStack(bottom, restPcs);
  }
  while (stack[0] < lo) {
    bottom += 12;
    stack = buildStack(bottom, restPcs);
  }
  // Defensive containment (feasible windows make this a no-op beyond
  // octave-fitting; the sort restores ascending order if a clamp ever
  // crossed voices).
  return stack.map((p) => clampRegister(p, register)).sort((a, b) => a - b);
}

/** Root-position-style stack re-anchored NEAR a previous bottom
 *  (voice-count changes + block parallel motion). */
function firstVoicingAt(
  bottomPc: number,
  restPcs: readonly number[],
  around: number,
  register: MidiRange,
): readonly number[] {
  let bottom = clampRegister(nearestOctave(bottomPc, around), register);
  let stack = buildStack(bottom, restPcs);
  while (stack[stack.length - 1] > register[1] && stack[0] - 12 >= register[0]) {
    bottom -= 12;
    stack = buildStack(bottom, restPcs);
  }
  while (stack[0] < register[0]) {
    bottom += 12;
    stack = buildStack(bottom, restPcs);
  }
  return stack.map((p) => clampRegister(p, register)).sort((a, b) => a - b);
}

/** Greedy nearest-pc per voice, TOP-DOWN (D68 rule 3). prev and
 *  targetPcs are the same length; result is ascending, register-safe.
 *  Collision-free by construction (distinct pcs -> distinct pitches);
 *  the completeness repair below is the documented safety net.
 *  Exported for the tie-break pin (voicing.test.ts) + the D47
 *  equivalence surface. */
export function greedyVoicing(
  prev: readonly number[],
  targetPcs: readonly number[],
  profile: StyleProfile,
  register: MidiRange,
): readonly number[] {
  const highTie = profile.voicing.spreadBias >= 0.5; // the field has teeth
  const unassigned = [...targetPcs];
  const out = new Array<number>(prev.length);
  for (let i = prev.length - 1; i >= 0; i--) {
    let bestIdx = 0;
    let bestPitch = 0;
    let bestDist = Infinity;
    for (let j = 0; j < unassigned.length; j++) {
      const cand = clampRegister(nearestOctave(unassigned[j], prev[i]), register);
      const dist = Math.abs(cand - prev[i]);
      const better =
        dist < bestDist ||
        (dist === bestDist && (highTie ? cand > bestPitch : cand < bestPitch));
      if (better) {
        bestDist = dist;
        bestIdx = j;
        bestPitch = cand;
      }
    }
    out[i] = bestPitch;
    unassigned.splice(bestIdx, 1);
  }
  // Completeness repair (defensive): a duplicate pitch swaps to the
  // nearest unused target pc; unassigned pcs join at the end.
  const used = new Set<number>();
  const repaired: number[] = [];
  for (const p of out) {
    if (!used.has(p)) {
      used.add(p);
      repaired.push(p);
      continue;
    }
    const alt = unassigned.shift();
    repaired.push(
      alt === undefined
        ? clampRegister(p + 12, register)
        : clampRegister(nearestOctave(alt, p), register),
    );
  }
  for (const pc of unassigned) repaired.push(clampRegister(nearestOctave(pc, p0(prev)), register));
  return repaired.sort((a, b) => a - b);
}

function p0(arr: readonly number[]): number {
  return arr.length > 0 ? arr[0] : 60;
}

/** Spread shape (D68 rule 4): bottom-up with a MINIMUM 5-semitone
 *  inter-voice gap (nearest chord tone >= a 4th above the previous). */
function spreadStack(bottom: number, restPcs: readonly number[]): number[] {
  const stack = [bottom];
  const left = [...restPcs];
  while (left.length > 0) {
    const prev = stack[stack.length - 1];
    let bestIdx = 0;
    let bestPitch = Infinity;
    for (let j = 0; j < left.length; j++) {
      const cand = atOrAbove(left[j], prev + 5);
      if (cand < bestPitch || (cand === bestPitch && mod12(left[j]) < mod12(left[bestIdx]))) {
        bestPitch = cand;
        bestIdx = j;
      }
    }
    stack.push(bestPitch);
    left.splice(bestIdx, 1);
  }
  return stack;
}

function spreadVoicing(
  bottomPc: number,
  restPcs: readonly number[],
  prevBottom: number | null,
  span: number,
  profile: StyleProfile,
  register: MidiRange,
): readonly number[] {
  const [lo, hi] = register;
  const start =
    prevBottom === null
      ? firstVoicing(bottomPc, [], span, profile, register)[0]
      : clampRegister(nearestOctave(bottomPc, prevBottom), register);
  // Containment is absolute (rule 6) and the 5-semitone gap is the
  // shape rule: search the bottom octave (nearest first, then down,
  // then up) for a placement where BOTH hold.
  const candidates = [start, start - 12, start + 12].filter((b) => b >= lo && b <= hi);
  let chosen: number[] | null = null;
  for (const b of candidates) {
    const stack = spreadStack(b, restPcs);
    if (stack[stack.length - 1] <= hi) {
      chosen = stack;
      break;
    }
    if (chosen === null) chosen = stack;
  }
  const stack = chosen ?? spreadStack(start, restPcs);
  // Last resort: octave-shift the whole stack in, then per-voice clamp.
  let shift = 0;
  while (stack[stack.length - 1] + shift > hi && stack[0] + shift - 12 >= lo) shift -= 12;
  while (stack[0] + shift < lo) shift += 12;
  return stack
    .map((p) => clampRegister(p + shift, register))
    .sort((a, b) => a - b);
}

/** Quartal shape (D68 rule 4): 4ths rooted on each chord tone, scored
 *  by covered target pcs; ties -> bottom nearest previous bottom.
 *  Returns null when coverage < 3 (close fallback, counted). */
function quartalVoicing(
  targetPcs: readonly number[],
  prevBottom: number | null,
  register: MidiRange,
): readonly number[] | null {
  let bestRoot: number | null = null;
  let bestScore = -1;
  let bestTie = Infinity;
  for (const rootPc of targetPcs) {
    const stack = [rootPc, rootPc + 5, rootPc + 10, rootPc + 15].map(mod12);
    const score = stack.filter((pc) => targetPcs.includes(pc)).length;
    const tie = prevBottom === null ? 0 : Math.abs(mod12(rootPc - mod12(prevBottom) + 6) - 6);
    if (score > bestScore || (score === bestScore && tie < bestTie)) {
      bestScore = score;
      bestTie = tie;
      bestRoot = rootPc;
    }
  }
  if (bestRoot === null || bestScore < 3) return null;
  const bottom =
    prevBottom === null
      ? atOrAbove(bestRoot, register[0])
      : clampRegister(nearestOctave(bestRoot, prevBottom), register);
  const stack = [bottom, bottom + 5, bottom + 10, bottom + 15].map((p) =>
    clampRegister(p, register),
  );
  return stack.sort((a, b) => a - b);
}

/** The drop2 permutation - SAME one-line formula as etude step 7
 *  (engine/etude/harmony.ts: [n2-12, n0, n1, n3]); D47 duplication is
 *  legal where the surrounding semantics differ (here: sequential
 *  voice-lead + register re-clamp). */
function drop2Permute(close4: readonly number[]): readonly number[] {
  const perm = [close4[2] - 12, close4[0], close4[1], close4[3]];
  return perm.sort((a, b) => a - b);
}

/** close/drop2 base: first-chord root position, else greedy lead.
 *  inversionAwareness: false re-anchors root position at EVERY chord
 *  (parallel motion = the pop block sound, D68 rule 2). Voice-count
 *  changes re-anchor near the previous bottom (documented corner -
 *  greedy needs equal voice counts). */
function placeClose(
  bottomPc: number,
  restPcs: readonly number[],
  span: number,
  prev: readonly number[] | null,
  profile: StyleProfile,
  register: MidiRange,
): readonly number[] {
  const aware = profile.voicing.inversionAwareness;
  if (prev === null || !aware) return firstVoicing(bottomPc, restPcs, span, profile, register);
  const target = [bottomPc, ...restPcs];
  if (target.length === prev.length) return greedyVoicing(prev, target, profile, register);
  return firstVoicingAt(bottomPc, restPcs, prev[0], register);
}

/**
 * Sequential voice-lead over a chord grid for ONE role pass.
 * Deterministic given the rng stream; every path returns ascending,
 * register-contained pitch arrays (null = rest / unknown quality).
 */
export function voiceSequence(input: VoicingInput): VoicingResult {
  const { cells, profile, rng, allowRootless, register } = input;
  const rate = input.rootlessRate ?? profile.voicing.rootlessRate;
  const style = profile.voicing.style;
  const aware = profile.voicing.inversionAwareness;
  const voicings: (readonly number[] | null)[][] = [];
  const rootlessFlags: boolean[][] = [];
  let prev: readonly number[] | null = null;
  let quartalFallbackCount = 0;
  let unknownQualityCount = 0;
  let drawCount = 0;
  let firstDrop2Bar: number | null = null;

  for (let bar = 0; bar < cells.length; bar++) {
    const slotVoicings: (readonly number[] | null)[] = [];
    const slotFlags: boolean[] = [];
    for (const cell of cells[bar]) {
      if (cell.isRest) {
        slotVoicings.push(null);
        slotFlags.push(false);
        prev = null; // post-rest re-anchor (D68 rule 2)
        continue;
      }
      const tones = toneMap(cell.qualitySymbol);
      if (tones === null) {
        // Unknown quality -> rest, counted (D68 rule 7, never throws).
        slotVoicings.push(null);
        slotFlags.push(false);
        unknownQualityCount++;
        prev = null;
        continue;
      }
      const eligible = allowRootless && tones.length >= 4 && rate > 0;
      let rootless = false;
      if (eligible) {
        drawCount++;
        rootless = rng.bool(rate);
      }
      const tonePcs = (rootless ? tones.filter((iv) => iv !== 0) : tones).map(
        (iv) => mod12(cell.rootPc + iv),
      );
      const span = tones[tones.length - 1];
      let bottomPc = mod12(cell.rootPc);
      if (aware && cell.bassPc !== null) bottomPc = mod12(cell.bassPc);
      else if (rootless && tonePcs.length > 0) bottomPc = tonePcs[0]; // 3rd up
      const restPcs = tonePcs.filter((pc) => pc !== bottomPc);
      let voicing: readonly number[];
      let appliedRootless = rootless;
      if (style === "block") {
        const triad = (blockTriadMap(cell.qualitySymbol) ?? [0]).map((iv) =>
          mod12(cell.rootPc + iv),
        );
        const bPc = mod12(cell.rootPc); // block: root ALWAYS bottom
        const rest = triad.filter((pc) => pc !== bPc);
        voicing =
          prev === null
            ? firstVoicing(bPc, rest, 7, profile, register)
            : firstVoicingAt(bPc, rest, prev[0], register);
        appliedRootless = false; // triad-only shape never goes rootless
      } else if (style === "quartal") {
        const q = quartalVoicing(tonePcs, prev === null ? null : prev[0], register);
        if (q === null) {
          quartalFallbackCount++;
          voicing = placeClose(bottomPc, restPcs, span, prev, profile, register);
        } else {
          voicing = q;
        }
      } else if (style === "spread") {
        voicing = spreadVoicing(
          bottomPc,
          restPcs,
          prev === null ? null : prev[0],
          span,
          profile,
          register,
        );
      } else {
        // close + drop2 share the greedy close stack; drop2 permutes.
        voicing = placeClose(bottomPc, restPcs, span, prev, profile, register);
        if (style === "drop2" && voicing.length === 4) {
          voicing = drop2Permute(voicing)
            .map((p) => clampRegister(p, register))
            .sort((a, b) => a - b);
          if (firstDrop2Bar === null) firstDrop2Bar = bar;
        }
      }
      slotVoicings.push(voicing);
      slotFlags.push(appliedRootless);
      prev = voicing;
    }
    voicings.push(slotVoicings);
    rootlessFlags.push(slotFlags);
  }

  return {
    voicings,
    rootlessFlags,
    quartalFallbackCount,
    unknownQualityCount,
    drawCount,
    firstDrop2Bar,
  };
}
