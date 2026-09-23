/**
 * engine/compose/roles.ts - PRD-001 Phase 4 Slice 1 (REQ-COMP-4).
 *
 * classifyRoles(project): a deterministic feature-scored role guess per
 * track. No rng, no clock - same project, same answer, every run
 * (pinned). Percussion short-circuits on channel 9 (GM, every format -
 * see normalize.ts) or a drum-ish name. Everything else is scored
 * against register / polyphony / rhythm-shape / name-prior features; the
 * argmax wins and a low top score degrades to "unknown" (the melody
 * extractor's top-line fallback then covers REQ-COMP-11 regardless).
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { ticksPerBar } from "./tempo";
import type { NormalizedProject, NormalizedTrack, TrackRole, TrackRoleAssignment } from "./types";

export const ROLE_WEIGHTS = {
  bass: { lowRegister: 0.5, monophonic: 0.3, steadyPulse: 0.2, namePrior: 0.2 },
  melody: { highRegister: 0.35, linearity: 0.35, moderateOnsets: 0.15, namePrior: 0.15 },
  harmony: { polyphony: 0.4, sustain: 0.3, midRegister: 0.3, namePrior: 0.2 },
} as const;

export const ROLE_THRESHOLDS = {
  lowMeanMidi: 45,
  highMeanMidi: 62,
  midMeanLow: 45,
  midMeanHigh: 62,
  minScore: 0.35, // below -> "unknown"
  percussionConfidence: 0.99,
  steadyMinNotes: 4,
  steadyCv: 0.35, // inter-onset coefficient of variation
  moderateOnsetLow: 2,
  moderateOnsetHigh: 20, // onsets per bar
} as const;

const MELODY_NAME_RE = /melod|lead|solo|voice|flute|violin|trumpet|sax/i;
const BASS_NAME_RE = /bass/i;
const HARMONY_NAME_RE = /piano|guitar|pad|comp|keys/i;
const PERCUSSION_NAME_RE = /drum|perc|kit/i;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

interface Features {
  readonly meanMidi: number;
  readonly maxPoly: number;
  readonly avgDurTicks: number;
  readonly onsetRate: number; // distinct onsets per bar
  readonly steady: boolean;
}

function distinctOnsets(track: NormalizedTrack): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of track.notes) {
    if (!seen.has(n.tick)) {
      seen.add(n.tick);
      out.push(n.tick);
    }
  }
  return out.sort((a, b) => a - b);
}

function maxPolyphony(track: NormalizedTrack): number {
  const events: { tick: number; delta: number }[] = [];
  for (const n of track.notes) {
    events.push({ tick: n.tick, delta: 1 });
    events.push({ tick: n.tick + n.durationTicks, delta: -1 });
  }
  // Sort by tick; on ties, ends (-1) before starts (+1) so touching
  // notes do not count as simultaneous.
  events.sort((a, b) => a.tick - b.tick || a.delta - b.delta);
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > max) max = cur;
  }
  return max;
}

function isSteady(onsets: readonly number[]): boolean {
  if (onsets.length < ROLE_THRESHOLDS.steadyMinNotes) return false;
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean <= 0) return false;
  const variance = gaps.reduce((s, g) => s + (g - mean) * (g - mean), 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < ROLE_THRESHOLDS.steadyCv;
}

function features(track: NormalizedTrack, ppq: number, ts0: { numerator: number; denominator: number }): Features {
  const notes = track.notes;
  if (notes.length === 0) {
    return { meanMidi: 0, maxPoly: 0, avgDurTicks: 0, onsetRate: 0, steady: false };
  }
  let sum = 0;
  let durSum = 0;
  for (const n of notes) {
    sum += n.midi;
    durSum += n.durationTicks;
  }
  const onsets = distinctOnsets(track);
  const start = onsets[0];
  const end = track.endTick;
  const barLen = Math.max(1, ticksPerBar(ppq, { tick: 0, ...ts0 }));
  const bars = Math.max(1, (end - start) / barLen);
  return {
    meanMidi: sum / notes.length,
    maxPoly: maxPolyphony(track),
    avgDurTicks: durSum / notes.length,
    onsetRate: onsets.length / bars,
    steady: isSteady(onsets),
  };
}

function scoreTrack(f: Features, name: string, ppq: number): { role: TrackRole; confidence: number } {
  const w = ROLE_WEIGHTS;
  const t = ROLE_THRESHOLDS;
  const sustainDur = ppq / 2; // >= half a beat counts as "sustained"

  const bass =
    (f.meanMidi < t.lowMeanMidi ? w.bass.lowRegister : 0) +
    (f.maxPoly <= 2 ? w.bass.monophonic : 0) +
    (f.steady ? w.bass.steadyPulse : 0) +
    (BASS_NAME_RE.test(name) ? w.bass.namePrior : 0);

  const melody =
    (f.meanMidi > t.highMeanMidi ? w.melody.highRegister : 0) +
    (f.maxPoly === 1 ? w.melody.linearity : 0) +
    (f.onsetRate >= t.moderateOnsetLow && f.onsetRate <= t.moderateOnsetHigh ? w.melody.moderateOnsets : 0) +
    (MELODY_NAME_RE.test(name) ? w.melody.namePrior : 0);

  const harmony =
    (f.maxPoly >= 3 ? w.harmony.polyphony : 0) +
    (f.avgDurTicks >= sustainDur ? w.harmony.sustain : 0) +
    (f.meanMidi >= t.midMeanLow && f.meanMidi <= t.midMeanHigh ? w.harmony.midRegister : 0) +
    (HARMONY_NAME_RE.test(name) ? w.harmony.namePrior : 0);

  const scored: { role: TrackRole; score: number }[] = [
    { role: "bass", score: bass },
    { role: "melody", score: melody },
    { role: "harmony", score: harmony },
  ];
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (top.score < t.minScore) return { role: "unknown", confidence: clamp01(top.score) };
  return { role: top.role, confidence: clamp01(top.score) };
}

export function classifyRoles(project: NormalizedProject): readonly TrackRoleAssignment[] {
  const ts0 = project.timeSignatures[0] ?? { tick: 0, numerator: 4, denominator: 4 };
  return project.tracks.map((track) => {
    if (track.isPercussion || PERCUSSION_NAME_RE.test(track.name)) {
      return { trackIndex: track.index, role: "percussion" as TrackRole, confidence: ROLE_THRESHOLDS.percussionConfidence };
    }
    if (track.notes.length === 0) {
      return { trackIndex: track.index, role: "unknown" as TrackRole, confidence: 0 };
    }
    const f = features(track, project.ppq, ts0);
    const { role, confidence } = scoreTrack(f, track.name, project.ppq);
    return { trackIndex: track.index, role, confidence };
  });
}
