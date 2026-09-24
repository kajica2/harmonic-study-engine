/**
 * engine/ear-training/generate.ts - PRD-001 Phase 6 (REQ-PED-20/21, D102).
 *
 * Seeded ear-prompt generator (clean-room; quizEngine/rhythmDrill are
 * anti-precedents and are never imported). ONE Rng handle per prompt
 * (D100); fixed draw order pinned by determinism.test.ts:
 * rootPc -> type payload -> spelling key -> conceptId -> id (hash).
 *
 * Difficulty tables (closed, test-pinned) are in this file. Concept
 * map (REQ-PED-25): interval -> voice-leading; chord-quality ->
 * drop-2; inversion -> voice-leading; progression -> ii-v-i (or
 * cadence for cadential fragments); scale -> modal-interchange;
 * melodic -> voice-leading; harmonic -> cadence.
 *
 * Spelling key rule (builder-test documented): C major default
 * (tonicPc 0, major); minor-flavored prompts (minor-family scales)
 * use A minor (tonicPc 9, minor).
 *
 * Purity: relative imports only, no clock, no Math.random, no console.
 */

import { createRng, hashSeed, type Rng, type Seed } from "../core/rng";
import { QUALITY_INTERVALS, spellChordName } from "../core/chords";
import { parseChordSymbol } from "../compose/chordsym";
import { getConcept } from "../pedagogy/concepts";
import type { EarDifficulty, EarPrompt, EarType } from "./types";
import { earPromptId } from "./types";

export interface EarGenInput {
  readonly type: EarType;
  readonly difficulty: EarDifficulty;
  readonly seed: Seed;
  readonly rng: Rng;
}

/** Interval name -> semitones (aug = 8, same pc as m6 by design). */
const INTERVAL_SEMITONES: Readonly<Record<string, number>> = {
  m2: 1,
  M2: 2,
  m3: 3,
  M3: 4,
  P4: 5,
  tritone: 6,
  P5: 7,
  m6: 8,
  aug: 8,
  M6: 9,
  m7: 10,
  M7: 11,
};

function intervalPool(difficulty: EarDifficulty): readonly string[] {
  const l1: readonly string[] = ["P5", "P4", "M3"];
  if (difficulty === 1) return l1;
  const l2: readonly string[] = [...l1, "m3", "M2", "m7"];
  if (difficulty === 2) return l2;
  const l3: readonly string[] = [...l2, "m6", "M6", "m2", "M7"];
  if (difficulty === 3) return l3;
  const l4: readonly string[] = [...l3, "tritone", "aug"];
  return l4;
}

function qualityPool(difficulty: EarDifficulty): readonly string[] {
  const l1: readonly string[] = ["maj", "min"];
  if (difficulty === 1) return l1;
  const l2: readonly string[] = [...l1, "maj7", "m7", "dom7"];
  if (difficulty === 2) return l2;
  const l3: readonly string[] = [...l2, "dim", "halfdim"];
  if (difficulty === 3) return l3;
  const l4: readonly string[] = [...l3, "maj9", "dom9", "min9"];
  if (difficulty === 4) return l4;
  return [...l4, "alt", "sus4", "maj6"];
}

/** Scale name -> semitone pattern from tonic (incl. octave). */
const SCALE_PATTERNS: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  blues: [0, 3, 5, 6, 7, 10, 12],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7],
};

function scalePool(difficulty: EarDifficulty): readonly string[] {
  const l1: readonly string[] = ["major", "minor"];
  if (difficulty === 1) return l1;
  const l2: readonly string[] = [...l1, "dorian", "mixolydian"];
  if (difficulty === 2) return l2;
  const l3: readonly string[] = [...l2, "lydian", "phrygian"];
  if (difficulty === 3) return l3;
  const l4: readonly string[] = [...l3, "locrian", "blues"];
  if (difficulty === 4) return l4;
  return [...l4, "chromatic"];
}

/** Minor-family scales use the A-minor spelling key. */
function isMinorFlavoredScale(name: string): boolean {
  return name === "minor" || name === "dorian" || name === "phrygian" || name === "locrian";
}

/** Deterministic spelling-key rule (builder-test pinned). */
export function spellingKeyFor(
  type: EarType,
  answerKey: string,
): { readonly tonicPc: number; readonly mode: "major" | "minor" } {
  if (type === "scale" && isMinorFlavoredScale(answerKey)) {
    return { tonicPc: 9, mode: "minor" };
  }
  if (type === "progression" && /m/i.test(answerKey)) {
    return { tonicPc: 9, mode: "minor" };
  }
  return { tonicPc: 0, mode: "major" };
}

/** Base progression templates in C (transposed by rootPc, spelled via D11). */
function progressionPool(difficulty: EarDifficulty): readonly (readonly string[])[] {
  const l1: readonly (readonly string[])[] = [
    ["C", "G"],
    ["C", "F"],
  ];
  if (difficulty === 1) return l1;
  const l2: readonly (readonly string[])[] = [
    ...l1,
    ["Dm7", "G7", "Cmaj7"],
  ];
  if (difficulty === 2) return l2;
  const l3: readonly (readonly string[])[] = [
    ...l2,
    ["C7", "F7", "C7", "G7"],
  ];
  if (difficulty === 3) return l3;
  const l4: readonly (readonly string[])[] = [
    ...l3,
    ["D7", "G7", "C7", "F7"],
  ];
  if (difficulty === 4) return l4;
  return [
    ...l4,
    ["Bmaj7", "D7", "Gmaj7", "Bb7"],
  ];
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Transpose one symbol by delta semitones, spelled in the given key. */
function transposeSymbol(
  symbol: string,
  delta: number,
  keyTonicPc: number,
  keyMode: "major" | "minor",
): string | null {
  const parsed = parseChordSymbol(symbol);
  if (parsed === null) return null;
  const nextRoot = mod12(parsed.rootPc + delta);
  const nextBass = parsed.bassPc === null ? null : mod12(parsed.bassPc + delta);
  const base = spellChordName(nextRoot, parsed.qualitySymbol, keyTonicPc, keyMode);
  if (nextBass === null) return base;
  return `${base}/${spellChordName(nextBass, "", keyTonicPc, keyMode)}`;
}

function dictationLength(difficulty: EarDifficulty): number {
  if (difficulty <= 2) return 4;
  if (difficulty <= 4) return 6;
  return 8;
}

function clampMidi(n: number): number {
  if (n < 0) return 0;
  if (n > 127) return 127;
  return n;
}

/** Stepwise melody from base (L1-3 diatonic-ish steps, L4+ chromatic). */
function stepwiseMelody(base: number, length: number, difficulty: EarDifficulty, rng: Rng): number[] {
  const out: number[] = [clampMidi(base)];
  let cur = base;
  for (let i = 1; i < length; i++) {
    let step: number;
    if (difficulty <= 3) {
      const steps: readonly number[] = [-2, -1, -1, 1, 1, 2];
      step = rng.pick(steps);
    } else {
      const steps: readonly number[] = [-2, -1, -1, -1, 1, 1, 1, 2];
      step = rng.pick(steps);
    }
    cur += step;
    if (cur < 48) cur = 48 + (48 - cur);
    if (cur > 84) cur = 84 - (cur - 84);
    out.push(clampMidi(cur));
  }
  return out;
}

/** Inversion labels per difficulty. */
function inversionChoices(difficulty: EarDifficulty, rng: Rng): { quality: string; label: string; depth: number } {
  if (difficulty === 1) {
    return { quality: rng.pick(["maj", "min"] as const), label: "root", depth: 0 };
  }
  if (difficulty === 2) {
    const quality = rng.pick(["maj", "min"] as const);
    const label = rng.pick(["root", "1st", "2nd"] as const);
    return { quality, label, depth: label === "root" ? 0 : label === "1st" ? 1 : 2 };
  }
  const quality = rng.pick(["maj7", "m7", "dom7"] as const);
  const label = rng.pick(["root", "1st", "2nd", "3rd"] as const);
  const depth = label === "root" ? 0 : label === "1st" ? 1 : label === "2nd" ? 2 : 3;
  return { quality, label, depth };
}

/** Rotate chord tones for the inversion (bass-first, octave-wrapped). */
function inversionMidi(base: number, quality: string, depth: number): number[] {
  const intervals = QUALITY_INTERVALS[quality] ?? [0, 4, 7];
  const tones = intervals.map((iv) => clampMidi(base + iv));
  if (depth === 0) return tones;
  // Honest inversion voicing: take the first `depth` tones up an octave.
  const out = tones.slice(depth).concat(tones.slice(0, depth).map((m) => clampMidi(m + 12)));
  out.sort((a, b) => a - b);
  return out;
}

function questionFor(type: EarType, extra: string): string {
  switch (type) {
    case "interval":
      return "Which interval?";
    case "chord-quality":
      return "Which chord quality?";
    case "chord-inversion":
      return "Which inversion?";
    case "progression":
      return `Which progression? ${extra}`.trim();
    case "scale":
      return "Which scale?";
    case "melodic-dictation":
      return `Notate the ${extra} notes`;
    case "harmonic-dictation":
      return `Notate the ${extra} chord tones`;
  }
}

/**
 * Generate one ear prompt. Deterministic in (type, difficulty, seed):
 * same inputs + same rng stream => byte-identical prompt (the caller
 * creates ONE rng via createRng(seed)).
 */
export function generateEarPrompt(input: EarGenInput): EarPrompt {
  const { type, difficulty, seed, rng } = input;
  const rootPc = rng.int(12);
  const base = 60 + rootPc;
  let midi: readonly number[];
  let chordSymbols: readonly string[] | null = null;
  let answerKey: string;
  let conceptId: string;
  let question: string;

  switch (type) {
    case "interval": {
      const name = rng.pick(intervalPool(difficulty));
      const semis = INTERVAL_SEMITONES[name] ?? 7;
      const compound = difficulty === 5 && rng.bool(0.5);
      const second = clampMidi(base + semis + (compound ? 12 : 0));
      midi = [clampMidi(base), second];
      answerKey = name;
      conceptId = "voice-leading";
      question = questionFor(type, "");
      break;
    }
    case "chord-quality": {
      const quality = rng.pick(qualityPool(difficulty));
      const intervals = QUALITY_INTERVALS[quality] ?? [0, 4, 7];
      midi = intervals.map((iv) => clampMidi(base + iv));
      answerKey = quality;
      conceptId = "drop-2";
      question = questionFor(type, "");
      break;
    }
    case "chord-inversion": {
      const inv = inversionChoices(difficulty, rng);
      midi = inversionMidi(base, inv.quality, inv.depth);
      answerKey = inv.label;
      conceptId = "voice-leading";
      question = questionFor(type, "");
      break;
    }
    case "progression": {
      const template = rng.pick(progressionPool(difficulty));
      const key = template.join(" ").includes("m") || template.join(" ").includes("7")
        ? spellingKeyFor("progression", template.join(" "))
        : { tonicPc: 0, mode: "major" as const };
      const spelled: string[] = [];
      for (const sym of template) {
        const next = transposeSymbol(sym, rootPc, key.tonicPc, key.mode);
        spelled.push(next ?? sym);
      }
      chordSymbols = spelled;
      const roots = spelled.map((s) => {
        const p = parseChordSymbol(s);
        return p === null ? 60 : clampMidi(60 + p.rootPc);
      });
      midi = roots;
      answerKey = spelled.join(" ");
      const cadential = template.length === 2;
      conceptId = cadential ? "cadence" : "ii-v-i";
      question = questionFor(type, `(${spelled.length} chords)`);
      break;
    }
    case "scale": {
      const name = rng.pick(scalePool(difficulty));
      const pattern = SCALE_PATTERNS[name] ?? SCALE_PATTERNS.major;
      midi = pattern.map((iv) => clampMidi(base + iv));
      answerKey = name;
      conceptId = "modal-interchange";
      question = questionFor(type, "");
      break;
    }
    case "melodic-dictation": {
      const len = dictationLength(difficulty);
      midi = stepwiseMelody(base, len, difficulty, rng);
      answerKey = midi.join(",");
      conceptId = "voice-leading";
      question = questionFor(type, String(len));
      break;
    }
    case "harmonic-dictation": {
      const len = dictationLength(difficulty);
      if (len <= 4) {
        const quality = rng.pick(["maj7", "m7", "dom7"] as const);
        const intervals = QUALITY_INTERVALS[quality] ?? [0, 4, 7, 11];
        const tones = intervals.slice(0, 4).map((iv) => clampMidi(base + iv));
        midi = tones;
        const sym = spellChordName(rootPc, quality, 0, "major");
        chordSymbols = [sym];
        answerKey = midi.join(",");
      } else if (len <= 6) {
        const q1 = rng.pick(["maj", "min"] as const);
        const q2 = rng.pick(["maj", "min"] as const);
        const r2 = mod12(rootPc + 7);
        const c1 = (QUALITY_INTERVALS[q1] ?? [0, 4, 7]).map((iv) => clampMidi(base + iv));
        const c2 = (QUALITY_INTERVALS[q2] ?? [0, 4, 7]).map((iv) => clampMidi(60 + r2 + iv));
        midi = [...c1, ...c2].slice(0, 6);
        chordSymbols = [spellChordName(rootPc, q1, 0, "major"), spellChordName(r2, q2, 0, "major")];
        answerKey = midi.join(",");
      } else {
        const q1 = rng.pick(["maj7", "m7", "dom7"] as const);
        const q2 = rng.pick(["maj7", "m7", "dom7"] as const);
        const r2 = mod12(rootPc + 7);
        const c1 = (QUALITY_INTERVALS[q1] ?? [0, 4, 7, 11]).slice(0, 4).map((iv) => clampMidi(base + iv));
        const c2 = (QUALITY_INTERVALS[q2] ?? [0, 4, 7, 11]).slice(0, 4).map((iv) => clampMidi(60 + r2 + iv));
        midi = [...c1, ...c2];
        chordSymbols = [spellChordName(rootPc, q1, 0, "major"), spellChordName(r2, q2, 0, "major")];
        answerKey = midi.join(",");
      }
      conceptId = "cadence";
      question = questionFor(type, String(midi.length));
      break;
    }
  }

  // Defensive: every conceptId must resolve (test-pinned).
  if (getConcept(conceptId) === null) conceptId = "voice-leading";
  const id = earPromptId(type, difficulty, seed, answerKey, rootPc);
  return {
    version: 1,
    id,
    type,
    difficulty,
    seed: seed >>> 0,
    rootPc,
    midi,
    chordSymbols,
    question,
    conceptId,
    answerKey,
  };
}

/** Convenience: generate with a fresh handle (ONE handle per prompt). */
export function generateEarPromptSeeded(
  type: EarType,
  difficulty: EarDifficulty,
  seed: Seed,
): EarPrompt {
  return generateEarPrompt({ type, difficulty, seed, rng: createRng(seed) });
}

export { hashSeed };
