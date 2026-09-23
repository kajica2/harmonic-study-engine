/**
 * engine/etude/melody.ts - PRD-001 Phase 3 Slice 1 (REQ-ETU-11/12).
 *
 * Weighted interval walk over the 8-slot-per-bar eighth-note grid:
 * strong-beat onsets are certain, weak/off-beat onsets are gated by
 * scaleProbability(syncopation, difficulty) (forced 0 by
 * rhythm.straightRhythmsOnly), chromatic targets are gated by
 * scaleProbability(chromaticism, difficulty), and strong-beat chord-
 * tone landings are gated by chordToneStrongBeat (forced 1.0 by
 * melody.chordTonesOnStrongBeats).
 *
 * Determinism contract: runs on the SAME rng handle as harmony.ts,
 * AFTER all harmony draws, BEFORE the title draws. Per-slot draw order
 * is fixed: [onset bool] -> [repeat bool] -> [direction bool] ->
 * [interval weighted] -> [chromatic gate bool (+ optional re-pick)] ->
 * [chord-tone gate bool]. Velocity/strongBeat/syncopated fields are
 * derived, never drawn.
 *
 * Purity: relative imports only; all randomness through the Rng.
 */

import type { Rng } from "../core/rng";
import type { StyleProfile } from "../styles/types";
import { scaleProbability } from "../styles/difficulty";
import type { EtudeChord, EtudeConstraints, EtudeNote } from "./types";
import { MODE_OFFSETS } from "./harmony";

/** Absolute eighth-note grid: 8 slots per 4/4 bar. */
export const SLOTS_PER_BAR = 8;

export interface MelodyInput {
  readonly profile: StyleProfile;
  readonly constraints: EtudeConstraints;
  readonly chords: readonly EtudeChord[];
  readonly rng: Rng;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** profile.melody.range intersected with voicing.registers.melody,
 *  then with the explicit constraint range (an explicit constraint that
 *  is disjoint from the profile wins - documented user override). */
function resolveRange(
  profile: StyleProfile,
  constraints: EtudeConstraints,
): readonly [number, number] {
  let lo = Math.max(profile.melody.range[0], profile.voicing.registers.melody[0]);
  let hi = Math.min(profile.melody.range[1], profile.voicing.registers.melody[1]);
  if (constraints.melody.range !== null) {
    const clo = constraints.melody.range[0];
    const chi = constraints.melody.range[1];
    const nlo = Math.max(lo, clo);
    const nhi = Math.min(hi, chi);
    if (nlo <= nhi) {
      lo = nlo;
      hi = nhi;
    } else {
      lo = clo;
      hi = chi;
    }
  }
  return [lo, hi];
}

/** Weighted interval candidates per contour (REQ-ETU-11): stepwise
 *  favors [1,2], leapy favors [3,4,5,7], mixed weights both evenly.
 *  Filtered to the semitone cap; cap >= 1 guarantees non-empty. */
function intervalCandidates(
  contour: StyleProfile["melody"]["contour"],
  cap: number,
): readonly { item: number; weight: number }[] {
  const step = [1, 2];
  const leap = [3, 4, 5, 7];
  const all = [...step, ...leap].filter((i) => i <= cap);
  return all.map((i) => {
    const isStep = step.includes(i);
    let weight: number;
    if (contour === "stepwise") weight = isStep ? 4 : 1;
    else if (contour === "leapy") weight = isStep ? 1 : 4;
    else weight = 2;
    return { item: i, weight };
  });
}

/** Nearest in-range octave of `n`'s pitch class; boundary clamp if the
 *  range window holds no such octave (possible only for very narrow
 *  constraint ranges). */
function clampToRange(n: number, lo: number, hi: number): number {
  const pc = mod12(n);
  let best = -1;
  let bestDist = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (mod12(m) !== pc) continue;
    const d = Math.abs(m - n);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  if (best >= 0) return best;
  return Math.min(hi, Math.max(lo, n));
}

/** Snap to the chord tone (pc + octave) closest to `target`; prefer
 *  candidates within `cap` of `prev` so the interval bound survives
 *  forced chord-tone beats; ties resolve to the lower MIDI. */
function snapToChord(
  target: number,
  chordPcs: readonly number[],
  lo: number,
  hi: number,
  cap: number,
  prev: number | null,
): number {
  const cands: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (chordPcs.includes(mod12(m))) cands.push(m);
  }
  if (cands.length === 0) return clampToRange(target, lo, hi);
  let pool = cands;
  if (prev !== null) {
    const within = cands.filter((c) => Math.abs(c - prev) <= cap);
    if (within.length > 0) pool = within;
  }
  let best = pool[0];
  for (const c of pool) {
    const d = Math.abs(c - target);
    const bd = Math.abs(best - target);
    if (d < bd || (d === bd && c < best)) {
      best = c;
    }
  }
  return best;
}

/**
 * Generate the melody slot grid for a generated etude. Returns notes
 * ascending by slot, no overlaps, durationSlots >= 1; the final note
 * is cadentially snapped to a chord tone of the last chord.
 */
export function generateMelody(input: MelodyInput): readonly EtudeNote[] {
  const { profile, constraints, chords, rng } = input;
  const bars = constraints.bars;
  const total = bars * SLOTS_PER_BAR;
  const [lo, hi] = resolveRange(profile, constraints);
  const cap = Math.min(
    profile.melody.maxLeapSemitones,
    constraints.melody.maxIntervalSemitones ?? 24,
  );
  const pSync = constraints.rhythm.straightRhythmsOnly
    ? 0
    : scaleProbability(profile.melody.syncopation, constraints.difficulty);
  const pChrom = scaleProbability(profile.melody.chromaticism, constraints.difficulty);
  const pCT = constraints.melody.chordTonesOnStrongBeats
    ? 1
    : scaleProbability(profile.melody.chordToneStrongBeat, constraints.difficulty);
  const scalePcs = MODE_OFFSETS[constraints.mode].map((o) => mod12(constraints.key + o));
  const cands = intervalCandidates(profile.melody.contour, cap);

  const onsets: { slot: number; midi: number }[] = [];
  let prev: number | null = null;

  for (let slot = 0; slot < total; slot++) {
    const bar = Math.floor(slot / SLOTS_PER_BAR);
    const chord = chords[bar];
    const chordPcs: number[] = [];
    for (const n of chord.notes) {
      const pc = mod12(n);
      if (!chordPcs.includes(pc)) chordPcs.push(pc);
    }

    // Rhythm: strong beats (1 and 3) always onset; everything else is
    // gated by the (possibly forced-zero) syncopation probability.
    const onset = slot % 4 === 0 ? true : rng.bool(pSync);
    if (!onset) continue;
    // Repeat-note rate sustains the previous note instead of a new one.
    // The draw is ALWAYS consumed (stream shape is fixed), but its
    // effect is suppressed on the final bar's downbeat so the last bar
    // always carries a fresh onset for the cadential snap below.
    const sustain = prev !== null && rng.bool(profile.melody.repeatNoteRate);
    if (sustain && slot !== (bars - 1) * SLOTS_PER_BAR) continue;

    let midi: number;
    if (prev === null) {
      // First note: a chord tone of bar 0 near the register middle.
      midi = snapToChord(Math.round((lo + hi) / 2), chordPcs, lo, hi, 24, null);
    } else {
      const from = prev; // narrow once: closures below see `number`
      const up = rng.bool(0.5);
      const dir = up ? 1 : -1;
      const iv = rng.weighted(cands);
      let target = from + dir * iv;
      const isChromatic = (t: number): boolean =>
        !scalePcs.includes(mod12(t)) && !chordPcs.includes(mod12(t));
      if (isChromatic(target)) {
        if (!rng.bool(pChrom)) {
          const nonChrom = (d: number) =>
            cands.filter((c) => !isChromatic(from + d * c.item));
          const same = nonChrom(dir);
          if (same.length > 0) {
            target = from + dir * rng.weighted(same);
          } else {
            const opp = nonChrom(-dir);
            if (opp.length > 0) target = from - dir * rng.weighted(opp);
            // all candidates chromatic in both directions: accept it
          }
        }
      }
      if (slot % 2 === 0 && rng.bool(pCT)) {
        midi = snapToChord(clampToRange(target, lo, hi), chordPcs, lo, hi, cap, from);
      } else {
        // Range-boundary mirror: a walk that steps off the end of the
        // range flips direction (exact same interval) before falling
        // back to octave placement, so maxInterval survives edges.
        if (target < lo || target > hi) {
          const mirrored = from - dir * iv;
          if (mirrored >= lo && mirrored <= hi) target = mirrored;
        }
        midi = clampToRange(target, lo, hi);
      }
    }
    onsets.push({ slot, midi });
    prev = midi;
  }

  // Cadential close: final note lands on a chord tone of the last chord.
  const lastChord = chords[bars - 1];
  const lastPcs: number[] = [];
  for (const n of lastChord.notes) {
    const pc = mod12(n);
    if (!lastPcs.includes(pc)) lastPcs.push(pc);
  }
  const lastIdx = onsets.length - 1;
  const prevPrev = onsets.length > 1 ? onsets[lastIdx - 1].midi : null;
  onsets[lastIdx] = {
    slot: onsets[lastIdx].slot,
    midi: snapToChord(onsets[lastIdx].midi, lastPcs, lo, hi, cap, prevPrev),
  };

  const notes: EtudeNote[] = [];
  for (let i = 0; i < onsets.length; i++) {
    const end = i + 1 < onsets.length ? onsets[i + 1].slot : total;
    const strong = onsets[i].slot % 2 === 0;
    const velocity = onsets[i].slot % 4 === 0 ? 0.85 : strong ? 0.65 : 0.75;
    notes.push({
      slot: onsets[i].slot,
      midi: onsets[i].midi,
      durationSlots: Math.max(1, end - onsets[i].slot),
      velocity,
      strongBeat: strong,
      syncopated: !strong,
    });
  }
  return notes;
}
