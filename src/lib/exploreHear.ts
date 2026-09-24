/**
 * src/lib/exploreHear.ts - PRD-001 Phase 5 (REQ-EXP-21, D96).
 *
 * Hear reuses the EXISTING compose preview singleton - no fork, no new
 * AudioContext, no new transport, no audioEngine coupling (F13: the
 * single-voice melody bus would arpeggiate block chords; the recipe
 * table is the polyphonic truth).
 *
 * cardToHearInput is PURE (node-tested): a transient synthetic project
 * (ppq 480, single 4/4 tempo 120, endTick from the card bars) + a
 * transient AccompanimentResult (chords role only, close-style
 * voicings via voiceSequence, one bar per progression entry, the same
 * slot->tick tiling the accompany pipeline uses). Melody-carrying
 * cards voice the melody as OriginalVoiceNotes on the lead recipe
 * (D78/D90 mapping) for the mix path. hearIdeaCard renders through
 * renderAccompaniment (+ renderMixGroups for the lead arm) and plays
 * through composePreviewPlayer - the singleton state machine
 * (rendering -> playing -> idle) is reused byte-identically, so the
 * Hear button mirrors the panel preview data-preview pattern.
 *
 * Cap: card progressions are < 90s by construction (2s/bar at 120bpm;
 * even a 32-bar card is 65s) - the preview cap never bites, so no
 * truncation label is needed (asserted in the builder test).
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
import type { IdeaCard } from "../../engine/explore/types";
import { getStyleProfile } from "../../engine/styles/index";
import {
  composePreviewPlayer,
  mapOriginalTracks,
  previewFullSec,
  renderAccompaniment,
  renderMixGroups,
  PREVIEW_CAP_SEC,
} from "./composePreview";
import type { OriginalVoiceNote } from "./composePreview";

/** Audition tempo map (matches the chart-session default, D83). */
export const HEAR_PPQ = 480;
export const HEAR_BPM = 120;
/** LOW-001: vary-text melodies are adversarial manual input - clamp the
 * audition span so a 2000-int paste cannot yield a 250-bar project that
 * would be silently truncated past PREVIEW_CAP_SEC. 32 bars = the Etude
 * maximum, 65s at 2s/bar, still under the 90s cap. */
export const MAX_HEAR_BARS = 32;
const TICKS_PER_BAR = HEAR_PPQ * 4;
const EIGHTH_TICKS = HEAR_PPQ / 2;

export interface HearInput {
  readonly project: NormalizedProject;
  readonly result: AccompanimentResult;
  /** Lead-recipe melody notes (empty when the card carries no melody). */
  readonly lead: readonly OriginalVoiceNote[];
}

function cardCells(
  progression: readonly string[] | null,
  key: KeyCandidate,
): ChordCell[] {
  if (progression === null) return [];
  return progression.map((symbol) => {
    const parsed = parseChordSymbol(symbol);
    if (parsed === null) return restCell();
    return buildCellFromSymbol(parsed, key);
  });
}

/**
 * PURE builder: card + spelling key -> transient project + result.
 * Deterministic (rng seeded from the card id - Hear never jitters).
 */
export function cardToHearInput(
  card: IdeaCard,
  key: KeyCandidate,
): HearInput {
  const profile = getStyleProfile("jazz");
  const register = profile.voicing.registers.chords;
  const rng = createRng(hashSeed(card.id));
  const cells = cardCells(card.progression, key);
  const melody = card.melody ?? [];
  const bars = Math.min(
    Math.max(cells.length, Math.ceil(melody.length / 8), 1),
    MAX_HEAR_BARS,
  );
  const endTick = bars * TICKS_PER_BAR;

  const base: NormalizedProject = {
    version: 1,
    format: 1,
    ppq: HEAR_PPQ,
    name: "Explore audition",
    fileName: "explore-audition",
    tempos: [{ tick: 0, bpm: HEAR_BPM }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, tonicPc: key.tonicPc, mode: key.mode }],
    tracks: [],
    endTick,
    durationSec: 0,
    warnings: [],
  };
  const project: NormalizedProject = {
    ...base,
    durationSec: ticksToSeconds(base, endTick),
  };

  // Chords role: one bar per progression entry (short cards leave
  // trailing bars silent - the audition mirrors the card exactly).
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
  chords.sort((a, b) => a.tick - b.tick || a.midi - b.midi);

  const grid = {
    slotsPerBar: 1,
    bars: cells.map((slot, bar) => ({
      bar,
      startTick: bar * TICKS_PER_BAR,
      endTick: (bar + 1) * TICKS_PER_BAR,
      slots: [slot],
    })),
  };
  const seed = hashSeed(card.id);
  const result: AccompanimentResult = {
    version: 1,
    generated: { bass: [], chords, pad: [] },
    meta: {
      version: 1,
      styleId: "jazz",
      density: 3,
      seed,
      roles: ["chords"],
      patternIds: {
        bass: profile.rhythm.bassPattern,
        chords: profile.rhythm.chordPattern,
        pad: "sustain",
      },
      voicingStyle: "close",
      swingRatioApplied: profile.rhythm.swingRatio,
      gridDivisions: profile.rhythm.gridDivisions,
      registersUsed: profile.voicing.registers,
      transpose: 0,
      noteCounts: { bass: 0, chords: chords.length, pad: 0 },
      rootlessCount: 0,
      quartalFallbackCount: 0,
      unknownQualityCount,
      bars,
      endTick,
      gridFingerprint: gridFingerprint(grid),
    },
    annotations: [],
  };

  // Lead arm: melody pitches spread evenly across the audition span
  // (pitch-only Idea shape - even spread is the documented audition
  // approximation, same 8th-note slot grid the etude melody uses).
  // Routed through mapOriginalTracks so the D78 melody -> lead voice
  // mapping is reused, never re-derived here.
  let lead: readonly OriginalVoiceNote[] = [];
  if (melody.length > 0) {
    const artifical = {
      ...project,
      tracks: [
        {
          index: 0,
          name: "Explore melody",
          channel: 0,
          program: 0,
          isPercussion: false,
          notes: melody.map((midi, k) => ({
            midi,
            tick: Math.floor((k * endTick) / melody.length),
            durationTicks: EIGHTH_TICKS,
            velocity: 0.85,
          })),
          endTick,
          usesPitchBend: false,
        },
      ],
    };
    lead = mapOriginalTracks(artifical, [
      { trackIndex: 0, role: "melody", confidence: 1 },
    ]);
  }

  return { project, result, lead };
}

/**
 * Render + play through the existing singleton (live-gated: call from
 * a click handler - play()/playMix() resume the context there, never
 * in an effect). Stops any prior audition first (idempotent).
 */
export async function hearIdeaCard(
  card: IdeaCard,
  key: KeyCandidate,
): Promise<void> {
  const input = cardToHearInput(card, key);
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
        composePreviewPlayer.playMix({
          chords: chordsBuffer,
          original: leadBuffer,
        });
      }
    }
  } catch {
    composePreviewPlayer.cancel();
    console.warn("[exploreHear] audition render failed; player back to idle");
  }
}

/** Re-exported for the builder test's cap assertion (same import). */
export { previewFullSec, PREVIEW_CAP_SEC };
