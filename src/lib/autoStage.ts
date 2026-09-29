/**
 * src/lib/autoStage.ts — infer a sensible StageConfig (chord root +
 * quality + degree sequence) from a HarmonicPath.
 *
 * Combines three signals:
 *   1. `path.key` if set (e.g. "F", "G-", "D minor", "F minor → Ab major").
 *      Progressive keys (with "→") take the starting key.
 *   2. Pitch-class histogram of `path.steps[*].notes` — used to
 *      cross-check the declared key and to vote on the chord root
 *      when no key is declared (e.g. curated concept exercises).
 *   3. Chord-quality vote against a small template bank (maj7 / m7 /
 *      7 / m7b5 / dim7) over the most common 4-note window of the
 *      path. Template with the best cosine similarity wins.
 *
 * Pure: callers pass a HarmonicPath and get a StageConfig back. No
 * React, no audio. The Trumpet Stage modal calls this on mount and
 * whenever the active path changes.
 */

import type { HarmonicPath } from "./paths";
import { type ChordQuality } from "./trumpetStage";
import type { StageConfig } from "./trumpetStage";

// Mirror of NOTE_NAMES_FLAT (kept local so this lib has no theory.ts
// dependency and stays small enough to be the eager chunk's only
// on-deck helper for the banner).
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;
const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

interface ParsedKey {
  root: string; // e.g. "F", "G-", "F minor"
  isMinor: boolean;
  raw: string;
}

const KEY_TO_PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

function parseKey(raw: string | undefined): ParsedKey | null {
  if (!raw) return null;
  const starting = raw.split("→")[0].trim();
  if (!starting) return null;
  const isMinor =
    starting.endsWith("-") ||
    /\s(minor|min|m)$/i.test(starting);
  // Strip minor markers to find the root.
  let root = starting
    .replace(/-$/, "")
    .replace(/\s*(minor|min)$/i, "")
    .replace(/m$/i, "")
    .trim();
  return { root, isMinor, raw };
}

const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  m6: [0, 3, 7, 9],
};

function templateFor(
  rootPc: number,
  quality: ChordQuality,
): number[] {
  return QUALITY_INTERVALS[quality].map((iv) => (rootPc + iv) % 12);
}

function flatName(pc: number): string {
  return FLAT_NAMES[((pc % 12) + 12) % 12];
}

function sharpName(pc: number): string {
  return SHARP_NAMES[((pc % 12) + 12) % 12];
}

function buildHistogram(steps: HarmonicPath["steps"]): number[] {
  const h = new Array(12).fill(0);
  for (const step of steps) {
    for (const n of step.notes) {
      h[((n % 12) + 12) % 12] += 1;
    }
  }
  return h;
}

function topPitchClass(hist: number[]): number {
  let bestPc = 0;
  let bestVal = -1;
  for (let i = 0; i < 12; i++) {
    if (hist[i] > bestVal) {
      bestVal = hist[i];
      bestPc = i;
    }
  }
  return bestPc;
}

function bestQuality(
  hist: number[],
  rootPc: number,
): { quality: ChordQuality; score: number } {
  let best: { quality: ChordQuality; score: number } = {
    quality: "maj7",
    score: -Infinity,
  };
  const histNorm = Math.hypot(...hist) || 1;
  for (const quality of Object.keys(QUALITY_INTERVALS) as ChordQuality[]) {
    const t = templateFor(rootPc, quality);
    let dot = 0;
    for (const pc of t) dot += hist[pc];
    const score = dot / histNorm;
    if (score > best.score) best = { quality, score };
  }
  return best;
}

const FALLBACK_DEGREES_BY_QUALITY: Record<ChordQuality, string[]> = {
  maj7: ["1", "3", "5", "7", "9"],
  m7: ["1", "b3", "5", "b7"],
  "7": ["1", "3", "5", "b7"],
  m7b5: ["1", "b3", "b5", "b7"],
  dim7: ["1", "b3", "b5", "bb7"],
  mMaj7: ["1", "b3", "5", "7"],
  m6: ["1", "b3", "5", "6"],
};

function fallbackRootFor(hist: number[]): { root: string; quality: ChordQuality } {
  const pc = topPitchClass(hist);
  const { quality } = bestQuality(hist, pc);
  return { root: flatName(pc), quality };
}

/**
 * Detect the most likely chord + degree sequence for a HarmonicPath.
 *
 * Priority:
 *   1. `path.key` if declared (with minor marker → that quality;
 *      without → vote quality against the histogram).
 *   2. Histogram top-pitch-class + quality vote when key is missing.
 *
 * Returns a StageConfig ready to feed TrumpetStageModal. The degree
 * sequence targets every chord tone in the detected quality, so the
 * player drills the literal chord tones of whatever they're about to
 * play (not a generic arpeggio template).
 */
export function autoStageConfig(path: HarmonicPath): StageConfig {
  const hist = buildHistogram(path.steps);
  const parsed = parseKey(path.key);
  let root: string;
  let quality: ChordQuality;
  let rootPc: number;

  if (parsed) {
    const pc = KEY_TO_PC[parsed.root];
    if (pc !== undefined) {
      rootPc = pc;
      // Honor explicit minor marker when present; otherwise vote
      // across all qualities against the histogram. Candidates are
      // ordered so that ties break toward the most idiomatic reading:
      // m7 over m7b5 over dim7 over mMaj7 over m6 for minor keys;
      // m7b5 over m7 when the histogram actually prefers b5.
      const minorCandidates: ChordQuality[] = [
        "m7",
        "m7b5",
        "dim7",
        "mMaj7",
        "m6",
      ];
      const allCandidates: ChordQuality[] = parsed.isMinor
        ? minorCandidates
        : (Object.keys(QUALITY_INTERVALS) as ChordQuality[]);
      const hN = Math.hypot(...hist) || 1;
      let bestQ: ChordQuality = parsed.isMinor ? "m7" : "maj7";
      let bestScore = -Infinity;
      for (const q of allCandidates) {
        const t = templateFor(pc, q);
        let dot = 0;
        for (const p of t) dot += hist[p];
        const s = dot / hN;
        // Strict `>` keeps the earlier (more idiomatic) candidate on
        // ties; only beat the incumbent on a strictly better score.
        if (s > bestScore) {
          bestScore = s;
          bestQ = q;
        }
      }
      quality = bestQ;
      root = sharpName(pc);
      // Down-convert to flat spelling when the path's key was flat
      // (Bb / Eb / Ab etc.) — keeps the display jazz-readable.
      if (
        parsed.root === "Bb" ||
        parsed.root === "Eb" ||
        parsed.root === "Ab" ||
        parsed.root === "Db" ||
        parsed.root === "Gb"
      ) {
        root = flatName(pc);
      }
    } else {
      const fb = fallbackRootFor(hist);
      root = fb.root;
      quality = fb.quality;
      rootPc = KEY_TO_PC[root] ?? 0;
    }
  } else {
    const fb = fallbackRootFor(hist);
    root = fb.root;
    quality = fb.quality;
    rootPc = KEY_TO_PC[root] ?? 0;
  }

  return {
    chordRoot: root,
    chordQuality: quality,
    degreeSequence: FALLBACK_DEGREES_BY_QUALITY[quality],
    perNoteToleranceCents: 7,
    sustainSeconds: 0.6,
    timeoutSeconds: 15,
  };
}