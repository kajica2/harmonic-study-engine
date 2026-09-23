/**
 * src/lib/composeVoices.ts - PRD-001 Phase 4 Slice 3 (D72 seam).
 *
 * The SHARED voice recipe for accompaniment audio. S3's offline
 * preview (composePreview.ts) is the first consumer; S4's realtime
 * player and WAV export import THIS module unchanged - the recipe is
 * the only thing the preview hands to S4 (the seam that keeps S4's
 * rewrite cost at zero).
 *
 * Deliberately INDEPENDENT of audioEngine (src/lib/audio.ts): that
 * engine is single-voice realtime on the melody bus with practice-
 * instrument state (D72 audit: wrong object for multi-voice
 * accompaniment). No transport, no rhythmEngine, no backingEngine.
 *
 * Roles (engine AccompRole): bass = triangle + fast decay; chords =
 * two detuned sines, pluck envelope; pad = filtered saw, slow attack.
 *
 * Web Audio only (BaseAudioContext - works offline AND realtime); no
 * console outside warn/error paths (none needed here).
 */

import type { AccompRole } from "../../engine/compose/types";

export interface VoiceRecipe {
  readonly oscType: OscillatorType;
  /** 1 or 2 (2 = detuned pair for chorus body). */
  readonly voices: number;
  /** Detune spread in cents across the pair (0 for single voice). */
  readonly detuneCents: number;
  readonly attackSec: number;
  readonly decaySec: number;
  /** Sustain as a FRACTION (0..1) of the velocity-scaled peak. */
  readonly sustainLevel: number;
  readonly releaseSec: number;
  /** Lowpass cutoff Hz when set (the pad's body filter). */
  readonly filterHz: number | null;
  /** Master gain scale (0..1) before velocity. */
  readonly peak: number;
}

export const VOICE_RECIPES: Readonly<Record<AccompRole, VoiceRecipe>> = {
  bass: {
    oscType: "triangle",
    voices: 1,
    detuneCents: 0,
    attackSec: 0.006,
    decaySec: 0.16,
    sustainLevel: 0.65,
    releaseSec: 0.06,
    filterHz: null,
    peak: 0.5,
  },
  chords: {
    oscType: "sine",
    voices: 2,
    detuneCents: 5,
    attackSec: 0.004,
    decaySec: 0.22,
    sustainLevel: 0.35,
    releaseSec: 0.12,
    filterHz: null,
    peak: 0.3,
  },
  pad: {
    oscType: "sawtooth",
    voices: 1,
    detuneCents: 0,
    attackSec: 0.3,
    decaySec: 0.4,
    sustainLevel: 0.3,
    releaseSec: 0.5,
    filterHz: 1100,
    peak: 0.22,
  },
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Schedule ONE voice of the recipe at (whenSec, durSec) with
 * velocity. Pure Web Audio API usage - identical calls in an
 * OfflineAudioContext (S3 preview) or a live AudioContext (S4).
 * Envelope uses exponential ramps (all values kept > 0).
 */
export function scheduleComposeNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  role: AccompRole,
  midi: number,
  whenSec: number,
  durSec: number,
  vel: number,
): void {
  const r = VOICE_RECIPES[role];
  const start = Math.max(0, whenSec);
  const dur = Math.max(0.02, durSec);
  const peak = Math.max(0.002, Math.min(1, vel) * r.peak);
  const sustain = Math.max(0.002, peak * r.sustainLevel);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + r.attackSec);
  env.gain.exponentialRampToValueAtTime(sustain, start + r.attackSec + r.decaySec);
  const end = start + dur;
  env.gain.setValueAtTime(sustain, Math.max(end, start + r.attackSec + r.decaySec));
  env.gain.exponentialRampToValueAtTime(0.0001, end + r.releaseSec);

  const tail = env;
  if (r.filterHz !== null) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = r.filterHz;
    filter.Q.value = 0.7;
    env.connect(filter);
    filter.connect(dest);
  } else {
    env.connect(dest);
  }

  const freq = midiToFreq(midi);
  for (let v = 0; v < r.voices; v++) {
    const osc = ctx.createOscillator();
    osc.type = r.oscType;
    osc.frequency.value = freq;
    if (r.voices === 2) {
      osc.detune.value = v === 0 ? -r.detuneCents : r.detuneCents;
    }
    osc.connect(tail);
    osc.start(start);
    osc.stop(end + r.releaseSec + 0.01);
  }
}
