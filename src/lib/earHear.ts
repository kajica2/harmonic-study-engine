/**
 * src/lib/earHear.ts - PRD-001 Phase 6 (REQ-PED-20/21, D105).
 *
 * Ear Hear reuses the EXISTING compose preview singleton - no fork, no
 * new context, no new transport, no audioEngine coupling (F17: the
 * single-voice melody bus would arpeggiate block chords; the recipe
 * table is the polyphonic truth).
 *
 * promptToHearInput is PURE (node-tested): a transient synthetic
 * project (ppq 480, single 4/4 tempo 120, endTick from the prompt
 * span) + a transient AccompanimentResult (chords role only, close
 * style voicings via voiceSequence for progressions, tick-offset
 * stabs on the SAME chords role for intervals/scales, lead-arm
 * melody via mapOriginalTracks for dictations like exploreHear).
 * hearEarPrompt renders through renderAccompaniment (+ renderMixGroups
 * for the lead arm) and plays through composePreviewPlayer - the
 * singleton state machine (rendering -> playing -> idle) is reused
 * byte-identically.
 *
 * Cap: prompts are < 90s by construction (longest: 4-bar progression
 * at 2s/bar = 8s + tail; asserted in the builder test).
 */

import { buildCellFromSymbol, parseChordSymbol } from "../../engine/compose/chordsym";
import { gridFingerprint } from "../../engine/compose/accompany";
import { ticksToSeconds } from "../../engine/compose/tempo";
import { restCell } from "../../engine/compose/types";
import type {
  ChordCell,
  GeneratedNote,
  KeyCandidate,
  NormalizedProject,
  AccompanimentResult,
} from "../../engine/compose/types";
import { voiceSequence } from "../../engine/compose/voicing";
import { createRng, hashSeed } from "../../engine/core/rng";
import { QUALITY_INTERVALS } from "../../engine/core/chords";
import { parseNumeral } from "../../engine/etude/harmony";
import { getStyleProfile } from "../../engine/styles/index";
import type { EarPrompt } from "../../engine/ear-training/types";
import { spellingKeyFor } from "../../engine/ear-training/generate";
import {
  composePreviewPlayer,
  mapOriginalTracks,
  previewFullSec,
  renderAccompaniment,
  renderMixGroups,
  PREVIEW_CAP_SEC,
} from "./composePreview";
import type { OriginalVoiceNote } from "./composePreview";

export const EAR_PPQ = 480;
export const EAR_BPM = 120;
const TICKS_PER_BAR = EAR_PPQ * 4;
const EIGHTH_TICKS = EAR_PPQ / 2;
const QUARTER_TICKS = EAR_PPQ;

export interface EarHearInput {
  readonly project: NormalizedProject;
  readonly result: AccompanimentResult;
  readonly lead: readonly OriginalVoiceNote[];
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function baseProject(endTick: number, key: KeyCandidate): NormalizedProject {
  const base: NormalizedProject = {
    version: 1,
    format: 1,
    ppq: EAR_PPQ,
    name: "Ear audition",
    fileName: "ear-audition",
    tempos: [{ tick: 0, bpm: EAR_BPM }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, tonicPc: key.tonicPc, mode: key.mode }],
    tracks: [],
    endTick,
    durationSec: 0,
    warnings: [],
  };
  return { ...base, durationSec: ticksToSeconds(base, endTick) };
}

function emptyResult(endTick: number, bars: number, seed: number): AccompanimentResult {
  return {
    version: 1,
    generated: { bass: [], chords: [], pad: [] },
    meta: {
      version: 1,
      styleId: "jazz",
      density: 3,
      seed,
      roles: ["chords"],
      patternIds: { bass: "none", chords: "none", pad: "sustain" },
      voicingStyle: "close",
      swingRatioApplied: 1,
      gridDivisions: 2,
      registersUsed: getStyleProfile("jazz").voicing.registers,
      transpose: 0,
      noteCounts: { bass: 0, chords: 0, pad: 0 },
      rootlessCount: 0,
      quartalFallbackCount: 0,
      unknownQualityCount: 0,
      bars,
      endTick,
      gridFingerprint: "ear",
    },
    annotations: [],
  };
}

function withChords(
  base: AccompanimentResult,
  chords: GeneratedNote[],
  cells: ChordCell[],
  bars: number,
  endTick: number,
): AccompanimentResult {
  const sorted = [...chords].sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  const grid = {
    slotsPerBar: 1,
    bars: cells.map((slot, bar) => ({
      bar,
      startTick: bar * TICKS_PER_BAR,
      endTick: (bar + 1) * TICKS_PER_BAR,
      slots: [slot],
    })),
  };
  return {
    ...base,
    generated: { bass: [], chords: sorted, pad: [] },
    meta: {
      ...base.meta,
      bars,
      endTick,
      noteCounts: { bass: 0, chords: sorted.length, pad: 0 },
      gridFingerprint: gridFingerprint(grid),
    },
  };
}

/**
 * PURE builder: prompt -> transient project + result (+ lead for dictations).
 * Deterministic (rng seeded from the prompt id - Hear never jitters).
 */
export function promptToHearInput(prompt: EarPrompt): EarHearInput {
  const keyRaw = spellingKeyFor(prompt.type, prompt.answerKey);
  const key: KeyCandidate = { tonicPc: keyRaw.tonicPc, mode: keyRaw.mode, correlation: 1 };
  const seed = hashSeed(prompt.id);
  const rng = createRng(seed);
  const profile = getStyleProfile("jazz");
  const register = profile.voicing.registers.chords;

  // Sequential stabs use the eighth grid (240 ticks at ppq 480):
  // intervals [0, 480], scales ascending eighths, dictation lead eighths.
  if (prompt.type === "interval") {
    const endTick = QUARTER_TICKS * 2;
    const project = baseProject(endTick, key);
    const chords: GeneratedNote[] = prompt.midi.map((midi, i) => ({
      midi,
      tick: i === 0 ? 0 : QUARTER_TICKS,
      durationTicks: EIGHTH_TICKS,
      velocity: 0.85,
      role: "chords",
      bar: 0,
      slot: i,
    }));
    const result = withChords(emptyResult(endTick, 1, seed), chords, [restCell()], 1, endTick);
    return { project, result, lead: [] };
  }

  if (prompt.type === "scale") {
    const span = prompt.midi.length * EIGHTH_TICKS + QUARTER_TICKS;
    const endTick = Math.max(TICKS_PER_BAR, span);
    const project = baseProject(endTick, key);
    const chords: GeneratedNote[] = prompt.midi.map((midi, i) => ({
      midi,
      tick: i * EIGHTH_TICKS,
      durationTicks: EIGHTH_TICKS,
      velocity: 0.85,
      role: "chords",
      bar: Math.floor((i * EIGHTH_TICKS) / TICKS_PER_BAR),
      slot: 0,
    }));
    const result = withChords(emptyResult(endTick, Math.ceil(endTick / TICKS_PER_BAR), seed), chords, [restCell()], Math.ceil(endTick / TICKS_PER_BAR), endTick);
    return { project, result, lead: [] };
  }

  if (prompt.type === "chord-quality" || prompt.type === "chord-inversion") {
    const endTick = TICKS_PER_BAR;
    const project = baseProject(endTick, key);
    const chords: GeneratedNote[] = prompt.midi.map((midi) => ({
      midi,
      tick: 0,
      durationTicks: TICKS_PER_BAR,
      velocity: 0.8,
      role: "chords",
      bar: 0,
      slot: 0,
    }));
    const result = withChords(emptyResult(endTick, 1, seed), chords, [restCell()], 1, endTick);
    void rng;
    void register;
    return { project, result, lead: [] };
  }

  if (prompt.type === "progression") {
    const symbols = prompt.chordSymbols ?? [];
    const cells: ChordCell[] = symbols.map((symbol) => {
      const parsed = parseChordSymbol(symbol);
      if (parsed === null) return restCell();
      return buildCellFromSymbol(parsed, key);
    });
    const bars = Math.max(1, cells.length);
    const endTick = bars * TICKS_PER_BAR;
    const project = baseProject(endTick, key);
    const voiced = voiceSequence({
      cells: cells.map((c) => [c]),
      profile: { ...profile, voicing: { ...profile.voicing, style: "close" } },
      rng,
      allowRootless: false,
      register,
    });
    const chords: GeneratedNote[] = [];
    let unknownQualityCount = 0;
    voiced.voicings.forEach((slots, bar) => {
      const pitches = slots[0];
      if (pitches === null) {
        unknownQualityCount++;
        return;
      }
      for (const midi of pitches) {
        chords.push({
          midi,
          tick: bar * TICKS_PER_BAR,
          durationTicks: TICKS_PER_BAR,
          velocity: 0.8,
          role: "chords",
          bar,
          slot: 0,
        });
      }
    });
    void unknownQualityCount;
    const result = withChords(emptyResult(endTick, bars, seed), chords, cells, bars, endTick);
    return { project, result, lead: [] };
  }

  // Dictations: lead-arm melody via mapOriginalTracks (exploreHear pattern).
  const span = prompt.midi.length * EIGHTH_TICKS + QUARTER_TICKS;
  const harmonicBars = prompt.chordSymbols !== null ? Math.max(1, prompt.chordSymbols.length) : 0;
  const endTick = Math.max(span, harmonicBars * TICKS_PER_BAR, TICKS_PER_BAR);
  const project = baseProject(endTick, key);
  const artificial = {
    ...project,
    tracks: [
      {
        index: 0,
        name: "Ear dictation",
        channel: 0,
        program: 0,
        isPercussion: false,
        notes: prompt.midi.map((midi, k) => ({
          midi,
          tick: k * EIGHTH_TICKS,
          durationTicks: EIGHTH_TICKS,
          velocity: 0.85,
        })),
        endTick,
        usesPitchBend: false,
      },
    ],
  };
  const lead = mapOriginalTracks(artificial, [{ trackIndex: 0, role: "melody", confidence: 1 }]);

  if (prompt.type === "harmonic-dictation" && prompt.chordSymbols !== null) {
    const cells: ChordCell[] = prompt.chordSymbols.map((symbol) => {
      const parsed = parseChordSymbol(symbol);
      if (parsed === null) return restCell();
      return buildCellFromSymbol(parsed, key);
    });
    const voiced = voiceSequence({
      cells: cells.map((c) => [c]),
      profile: { ...profile, voicing: { ...profile.voicing, style: "close" } },
      rng: createRng(seed),
      allowRootless: false,
      register,
    });
    const chords: GeneratedNote[] = [];
    voiced.voicings.forEach((slots, bar) => {
      const pitches = slots[0];
      if (pitches === null) return;
      for (const midi of pitches) {
        chords.push({
          midi,
          tick: bar * TICKS_PER_BAR,
          durationTicks: TICKS_PER_BAR,
          velocity: 0.75,
          role: "chords",
          bar,
          slot: 0,
        });
      }
    });
    const result = withChords(
      emptyResult(endTick, Math.max(1, Math.ceil(endTick / TICKS_PER_BAR)), seed),
      chords,
      cells,
      Math.max(1, Math.ceil(endTick / TICKS_PER_BAR)),
      endTick,
    );
    return { project, result, lead };
  }

  const result = withChords(
    emptyResult(endTick, Math.max(1, Math.ceil(endTick / TICKS_PER_BAR)), seed),
    [],
    [restCell()],
    Math.max(1, Math.ceil(endTick / TICKS_PER_BAR)),
    endTick,
  );
  return { project, result, lead };
}

/**
 * PURE builder: exampleNumerals (D21 tokens) in C major default
 * (tonicPc 0, major) as 1 bar per numeral via parseNumeral +
 * QUALITY_INTERVALS + close voicing (no new math). Tokens try the
 * major parse first with a per-token minor fallback for spelling;
 * the key stays major.
 */
export function numeralsToHearInput(
  numerals: readonly string[],
  tonicPc: number = 0,
): EarHearInput {
  const key: KeyCandidate = { tonicPc, mode: "major", correlation: 1 };
  const seed = hashSeed(numerals.join("|"));
  const bars = Math.max(1, numerals.length);
  const endTick = bars * TICKS_PER_BAR;
  const project = baseProject(endTick, key);
  const chords: GeneratedNote[] = [];
  numerals.forEach((token, bar) => {
    const real = parseNumeral(token, "major") ?? parseNumeral(token, "minor");
    if (real === null) return;
    const root = mod12(tonicPc + real.rootOffsetSemitones);
    const base = 60 + root;
    for (const iv of real.intervals) {
      chords.push({
        midi: base + iv,
        tick: bar * TICKS_PER_BAR,
        durationTicks: TICKS_PER_BAR,
        velocity: 0.8,
        role: "chords",
        bar,
        slot: 0,
      });
    }
    void QUALITY_INTERVALS;
  });
  const result = withChords(
    emptyResult(endTick, bars, seed),
    chords,
    numerals.map(() => restCell()),
    bars,
    endTick,
  );
  return { project, result, lead: [] };
}

/**
 * Render + play through the existing singleton (live-gated: call from
 * a click handler - play()/playMix() resume the context there, never
 * in an effect). Stops any prior audition first (idempotent).
 */
export async function hearEarPrompt(prompt: EarPrompt): Promise<void> {
  const input = promptToHearInput(prompt);
  composePreviewPlayer.markRendering();
  try {
    if (input.lead.length === 0) {
      const buffer = await renderAccompaniment(input.result, input.project);
      composePreviewPlayer.play(buffer);
    } else {
      const [chordsBuffer, leadMix] = await Promise.all([
        renderAccompaniment(input.result, input.project),
        renderMixGroups({
          project: input.project,
          result: null,
          tracks: input.lead,
          endTick: input.project.endTick,
        }),
      ]);
      const leadBuffer = leadMix.original ?? null;
      if (leadBuffer === null) {
        composePreviewPlayer.play(chordsBuffer);
      } else {
        composePreviewPlayer.playMix({ chords: chordsBuffer, original: leadBuffer });
      }
    }
  } catch {
    composePreviewPlayer.cancel();
    console.warn("[earHear] audition render failed; player back to idle");
  }
}

/** Hear a concept example (generated numerals in C). */
export async function hearExampleNumerals(
  numerals: readonly string[],
): Promise<void> {
  const input = numeralsToHearInput(numerals);
  composePreviewPlayer.markRendering();
  try {
    const buffer = await renderAccompaniment(input.result, input.project);
    composePreviewPlayer.play(buffer);
  } catch {
    composePreviewPlayer.cancel();
    console.warn("[earHear] example render failed; player back to idle");
  }
}

export { previewFullSec, PREVIEW_CAP_SEC };
