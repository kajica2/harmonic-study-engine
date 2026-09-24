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
 * S4 (D78/D90) widens the table with the "lead" voice (the original
 * melody track's recipe) - MixVoice = "lead" | AccompRole; existing
 * AccompRole callers are unchanged.
 *
 * D90 (TD-045a CLOSED): the ADSR event order is computed by the PURE
 * helper voiceEnvelopeTimes - the release ramp can never be scheduled
 * before the sustain-hold event (the old inline math could when
 * durSec + release < attack + decay at fast tempos).
 *
 * Web Audio only (BaseAudioContext - works offline AND realtime); no
 * console outside warn/error paths (none needed here).
 */

import type { AccompRole } from "../../engine/compose/types";

/** S4 (D90): the mixer voices = the generated roles PLUS the original
 *  group's lead line. AccompRole callers remain valid keys. */
export type MixVoice = "lead" | AccompRole;

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

export const VOICE_RECIPES: Readonly<Record<MixVoice, VoiceRecipe>> = {
  lead: {
    // D90: a clear lead line for the original melody tracks (D78) -
    // sine pair at 3 cents (vs chords' 5), distinct envelope.
    oscType: "sine",
    voices: 2,
    detuneCents: 3,
    attackSec: 0.01,
    decaySec: 0.15,
    sustainLevel: 0.6,
    releaseSec: 0.1,
    filterHz: null,
    peak: 0.35,
  },
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

/** The five scheduled event times of one ADSR pass (seconds). All
 *  five are monotone NON-DECREASING by construction (D90 / TD-045a:
 *  Web Audio requires non-decreasing automation event times; the old
 *  inline math could order the release ramp BEFORE the sustain hold
 *  when durSec + releaseSec < attackSec + decaySec, e.g. pad stabs
 *  at fast tempos). */
export interface EnvelopeTimes {
  readonly peakT: number;
  readonly sustainT: number;
  readonly holdT: number;
  readonly endT: number;
  readonly stopT: number;
}

/**
 * Pure envelope math for one note of recipe `r` starting at `start`
 * with duration `dur`. The clamp (D90):
 *   endT = max(start + max(0.02, dur), start + attackSec + decaySec)
 * so the release ramp target (stopT = endT + releaseSec) can never
 * precede the sustain-hold event.
 */
export function voiceEnvelopeTimes(r: VoiceRecipe, start: number, dur: number): EnvelopeTimes {
  const s = Math.max(0, start);
  const attack = Math.max(0, r.attackSec);
  const decay = Math.max(0, r.decaySec);
  const release = Math.max(0, r.releaseSec);
  const peakT = s + attack;
  const sustainT = s + attack + decay;
  const rawEnd = s + Math.max(0.02, dur);
  const endT = Math.max(rawEnd, sustainT); // <-- the clamp
  return { peakT, sustainT, holdT: endT, endT, stopT: endT + release };
}

/**
 * Schedule ONE voice of the recipe at (whenSec, durSec) with
 * velocity. Pure Web Audio API usage - identical calls in an
 * OfflineAudioContext (S3 preview) or a live AudioContext (S4).
 * Envelope uses exponential ramps (all values kept > 0); the event
 * ORDER comes from voiceEnvelopeTimes (D90 - non-decreasing by
 * construction).
 */
export function scheduleComposeNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  voice: MixVoice,
  midi: number,
  whenSec: number,
  durSec: number,
  vel: number,
): void {
  const r = VOICE_RECIPES[voice];
  const start = Math.max(0, whenSec);
  const peak = Math.max(0.002, Math.min(1, vel) * r.peak);
  const sustain = Math.max(0.002, peak * r.sustainLevel);
  const t = voiceEnvelopeTimes(r, start, durSec);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, t.peakT);
  env.gain.exponentialRampToValueAtTime(sustain, t.sustainT);
  env.gain.setValueAtTime(sustain, t.holdT);
  env.gain.exponentialRampToValueAtTime(0.0001, t.stopT);

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
    osc.stop(t.stopT + 0.01);
  }
}
