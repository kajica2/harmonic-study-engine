/**
 * engine/ear-training/distractors.ts - PRD-001 Phase 6 (REQ-PED-22, D113).
 *
 * Same-pool distractors minus the answer ENHARMONICALLY (pitch-class
 * equality via NOTE_PC, never string equality). A "Bb" distractor
 * when the answer is "A#" is excluded by design (false negative).
 *
 * Purity: relative imports only, no clock, no Math.random, no console.
 */

import type { Rng } from "../core/rng";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

const BASE_PC: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Pitch class of a note-name token (Cb==B, Fb==E, B#==C, E#==F pinned;
 * double sharps/flats via accidental count). Null for unparseable
 * (dictation pc-lists bypass this path).
 *
 * Accepts ASCII "#" and "b" accidentals (any count, e.g. "A##",
 * "Dbb"); single "x" is treated as double-sharp for convenience.
 */
export function pitchClassOfToken(token: string): number | null {
  if (typeof token !== "string") return null;
  const s = token.trim();
  if (s === "") return null;
  const m = /^([A-Ga-g])([#bxbB]*)$/.exec(s);
  if (m === null) return null;
  const base = BASE_PC[m[1].toUpperCase()];
  if (base === undefined) return null;
  const acc = m[2];
  if (acc === "") return mod12(base);
  let offset = 0;
  for (let i = 0; i < acc.length; i++) {
    const c = acc[i];
    if (c === "#") offset += 1;
    else if (c === "b" || c === "B") offset -= 1;
    else if (c === "x" || c === "X") offset += 2;
    else return null;
  }
  // Guard: more than two accidentals is outside the pinned grammar.
  if (Math.abs(offset) > 2) return null;
  return mod12(base + offset);
}

/**
 * Same-pool distractors (REQ-PED-22 + D113 filter).
 *
 * Contract: candidates from the same pool, answer EXCLUDED
 * ENHARMONICALLY (pc-equality). Fill order: pc-distinct pool members
 * shuffled (rng.shuffle on a COPY) then truncated; short pools recycle
 * with octave suffixes (never the answer pc). Returns exactly `count`
 * items; throws RangeError on empty pool (programmer error).
 */
export function distractorsFor(
  answer: string,
  pool: readonly string[],
  rng: Rng,
  count: number,
): readonly string[] {
  if (pool.length === 0) {
    throw new RangeError("distractorsFor: empty pool");
  }
  if (count < 0) {
    throw new RangeError(`distractorsFor: negative count ${count}`);
  }
  if (count === 0) return [];
  const answerPc = pitchClassOfToken(answer);
  const distinct = pool.filter((cand) => {
    if (cand === answer) return false;
    if (answerPc === null) return cand !== answer;
    const candPc = pitchClassOfToken(cand);
    // Unparseable candidates (quality names, progression labels) fall
    // back to string inequality; note names filter by pc.
    if (candPc === null) return cand !== answer;
    return candPc !== answerPc;
  });
  const shuffled = rng.shuffle(distinct);
  const out: string[] = [];
  let i = 0;
  while (out.length < count) {
    if (i < shuffled.length) {
      out.push(shuffled[i]);
      i++;
    } else {
      // Short-pool recycle: suffix an octave marker that never
      // collides enharmonically with the answer pc.
      if (shuffled.length === 0) {
        // Degenerate pool (only the answer): synthesize neighbors.
        const fallback = answerPc === null ? `${answer} (alt ${out.length + 1})` : `pc${mod12((answerPc + 3 + out.length) % 12)}`;
        out.push(fallback);
      } else {
        const base = shuffled[out.length % shuffled.length];
        out.push(`${base} 8va${out.length > shuffled.length ? `-${out.length}` : ""}`.trim());
      }
      i++;
      // Safety: never loop forever on pathological pools.
      if (out.length > count + 32) break;
    }
  }
  return out.slice(0, count);
}
