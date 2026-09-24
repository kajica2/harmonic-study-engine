/**
 * engine/ear-training/check.ts - PRD-001 Phase 6 (REQ-PED-23/24, D113).
 *
 * Answer checking is PURE: note-name answers compare by PITCH CLASS
 * (mod12 via pitchClassOfToken), NEVER by string. Distractor pools
 * use the same predicate (see distractors.ts).
 *
 * Dictation answers are pc-lists ("60,62,64" or "C D E" spellings,
 * both accepted, pc-compared positionally). Timing tolerance: onset
 * within max(120ms, 15% slot) counts (latencyMs subtracted first).
 * Partial credit: melodic-dictation ONLY (hit fraction + 0.1 contour
 * bonus, capped 1.0; correct = partial >= 0.85). All other types are
 * exact (partial null).
 *
 * Purity: relative imports only, no clock, no Math.random, no console.
 */

import type { EarPrompt } from "./types";
import { pitchClassOfToken } from "./distractors";

export interface EarGrade {
  readonly correct: boolean;
  readonly partial: number | null;
  readonly conceptId: string;
  readonly detail: string;
}

export interface EarGradeOpts {
  readonly latencyMs?: number;
  /** Onset error in ms (absolute); when provided, timing gates correctness. */
  readonly onsetErrorMs?: number;
  /** Slot duration in ms for the 15% rule (default 250). */
  readonly slotMs?: number;
}

/** Quality aliases (ASCII, case-folded): "m7b5" == "halfdim". */
const QUALITY_ALIASES: Readonly<Record<string, string>> = {
  m7b5: "halfdim",
  halfdim: "halfdim",
  "m7(b5)": "halfdim",
  o7: "dim7",
  o: "dim",
  "-": "min",
  min: "min",
  m: "min",
};

function canonicalToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalQuality(raw: string): string {
  const t = canonicalToken(raw);
  return QUALITY_ALIASES[t] ?? t;
}

/** True when the string looks like a pc-list (comma or multi-token). */
function isPcList(s: string): boolean {
  const t = s.trim();
  if (t === "") return false;
  if (t.includes(",")) return true;
  return t.split(/\s+/).filter((p) => p !== "").length > 1;
}

function tokenToPc(token: string): number | null {
  const t = token.trim();
  if (t === "") return null;
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 127) return null;
    return ((n % 12) + 12) % 12;
  }
  return pitchClassOfToken(t);
}

function parsePcList(s: string): number[] | null {
  const parts = s.split(/[\s,]+/).filter((p) => p !== "");
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    const pc = tokenToPc(p);
    if (pc === null) return null;
    out.push(pc);
  }
  return out;
}

function midiToPc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function contourSign(a: number, b: number): number {
  if (b > a) return 1;
  if (b < a) return -1;
  return 0;
}

/**
 * Timing gate (REQ-PED-23): effective error = |onsetErrorMs| minus
 * latencyMs (floored at 0); tolerance = max(120ms, 15% slotMs).
 */
export function dictationTimingOk(
  onsetErrorMs: number,
  slotMs: number,
  latencyMs?: number,
): boolean {
  const slot = Number.isFinite(slotMs) && slotMs > 0 ? slotMs : 250;
  const latency = Number.isFinite(latencyMs ?? 0) && (latencyMs ?? 0) > 0 ? (latencyMs ?? 0) : 0;
  const effective = Math.max(0, Math.abs(onsetErrorMs) - latency);
  const tolerance = Math.max(120, 0.15 * slot);
  return effective <= tolerance;
}

function asciiDetail(correct: boolean, prompt: EarPrompt, extra: string): string {
  const base = correct ? "Correct" : "Not quite";
  const suffix = extra === "" ? "" : ` (${extra})`;
  return `${base}: ${prompt.question} Answer ${prompt.answerKey}${suffix}`;
}

export function gradeEarAnswer(
  prompt: EarPrompt,
  answer: string,
  opts?: EarGradeOpts,
): EarGrade {
  const conceptId = prompt.conceptId;
  const raw = (answer ?? "").trim();
  const latencyMs = opts?.latencyMs;
  const timingProvided = opts?.onsetErrorMs !== undefined;
  const timingOk =
    timingProvided
      ? dictationTimingOk(opts?.onsetErrorMs ?? 0, opts?.slotMs ?? 250, latencyMs)
      : true;

  // Dictation types: pc-list positional compare.
  if (prompt.type === "melodic-dictation" || prompt.type === "harmonic-dictation") {
    const expectedPcs = prompt.midi.map(midiToPc);
    const gotPcs = parsePcList(raw);
    if (gotPcs === null) {
      return {
        correct: false,
        partial: prompt.type === "melodic-dictation" ? 0 : null,
        conceptId,
        detail: asciiDetail(false, prompt, "unreadable answer"),
      };
    }
    const n = Math.max(expectedPcs.length, gotPcs.length);
    const positions = expectedPcs.length;
    let hits = 0;
    for (let i = 0; i < expectedPcs.length; i++) {
      if (gotPcs[i] === expectedPcs[i]) hits++;
    }
    void n;
    if (prompt.type === "melodic-dictation") {
      const hitFraction = positions === 0 ? 0 : hits / positions;
      let contourBonus = 0;
      if (expectedPcs.length >= 2 && gotPcs.length >= 2) {
        let match = true;
        const steps = Math.min(expectedPcs.length, gotPcs.length) - 1;
        for (let i = 0; i < steps; i++) {
          const e = contourSign(prompt.midi[i], prompt.midi[i + 1]);
          // Compare answer contour in PITCH-CLASS space is lossy
          // across octaves; use pc direction as the documented
          // approximation (builder test pins the bonus on exact match).
          const g = contourSign(gotPcs[i], gotPcs[i + 1]);
          if (e !== g) {
            match = false;
            break;
          }
        }
        if (match) contourBonus = 0.1;
      }
      const partial = Math.min(1, hitFraction + contourBonus);
      const pitchCorrect = partial >= 0.85;
      const correct = pitchCorrect && timingOk;
      const extra = timingProvided && !timingOk ? "timing outside tolerance" : `${hits}/${positions} pcs`;
      return { correct, partial, conceptId, detail: asciiDetail(correct, prompt, extra) };
    }
    // Harmonic: exact, partial null.
    const exact =
      gotPcs.length === expectedPcs.length && gotPcs.every((pc, i) => pc === expectedPcs[i]);
    const correct = exact && timingOk;
    const extra =
      timingProvided && !timingOk ? "timing outside tolerance" : `${hits}/${positions} pcs`;
    return { correct, partial: null, conceptId, detail: asciiDetail(correct, prompt, extra) };
  }

  // Single note-name answers: pitch-class equality.
  const keyPc = pitchClassOfToken(prompt.answerKey);
  const ansPc = pitchClassOfToken(raw);
  if (keyPc !== null && ansPc !== null) {
    const correct = keyPc === ansPc;
    return { correct, partial: null, conceptId, detail: asciiDetail(correct, prompt, "") };
  }
  // One side parses as a note but the other does not: reject (a note
  // name is never equal to a quality token).
  if (keyPc !== null || ansPc !== null) {
    // Except: dictation-style pc-lists already handled above; a single
    // midi number ("60") is a valid single-pc answer.
    const keyNum = tokenToPc(prompt.answerKey);
    const ansNum = tokenToPc(raw);
    if (keyNum !== null && ansNum !== null) {
      const correct = keyNum === ansNum;
      return { correct, partial: null, conceptId, detail: asciiDetail(correct, prompt, "") };
    }
    return { correct: false, partial: null, conceptId, detail: asciiDetail(false, prompt, "") };
  }

  // Progression answers: symbol lists compared token-wise (case-folded,
  // quality-alias aware per token suffix).
  if (prompt.type === "progression" && isPcList(prompt.answerKey)) {
    const expTokens = prompt.answerKey.split(/\s+/).filter((p) => p !== "");
    const gotTokens = raw.split(/\s+/).filter((p) => p !== "");
    if (expTokens.length !== gotTokens.length) {
      return { correct: false, partial: null, conceptId, detail: asciiDetail(false, prompt, "") };
    }
    for (let i = 0; i < expTokens.length; i++) {
      if (canonicalQuality(expTokens[i]) !== canonicalQuality(gotTokens[i])) {
        return { correct: false, partial: null, conceptId, detail: asciiDetail(false, prompt, "") };
      }
    }
    return { correct: true, partial: null, conceptId, detail: asciiDetail(true, prompt, "") };
  }

  // Canonical token compare (interval/quality/inversion/scale).
  const correct = canonicalQuality(prompt.answerKey) === canonicalQuality(raw);
  return { correct, partial: null, conceptId, detail: asciiDetail(correct, prompt, "") };
}
