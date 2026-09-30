/**
 * Arpeggio rhythm variety + meter-aware step timing.
 *
 * Beat unit follows the meter, not a hardcoded quarter:
 *   7/8, 6/8: beat = eighth, so subdivision 2 = 16ths.
 *   5/4, 3/4, 4/4: beat = quarter, so subdivision 2 = 8ths.
 *
 * Straight + syncopation off is the legacy "sound every tick" law.
 */

import type { TimeSignature } from "./rhythm";
import type { FormTemplateId } from "./formPlanner";
import type { StylePackId } from "./stylePack";

export type ArpRhythmId = "straight" | "offbeat" | "charleston" | "clave";

export const ARP_RHYTHMS: readonly { id: ArpRhythmId; label: string }[] = [
  { id: "straight", label: "Straight" },
  { id: "offbeat", label: "Offbeat" },
  { id: "charleston", label: "Charleston" },
  { id: "clave", label: "Clave" },
];

const RHYTHM_IDS: readonly string[] = ARP_RHYTHMS.map((r) => r.id);

export function isArpRhythmId(v: string): v is ArpRhythmId {
  return RHYTHM_IDS.includes(v);
}

/** Quarter-lengths of one beat. Eighth-note meters are 0.5. */
export function beatUnitQuarters(ts: TimeSignature): number {
  return ts === "6/8" || ts === "7/8" ? 0.5 : 1;
}

/**
 * Subdivision of the BEAT for the existing rate slider.
 * Triplets and 32nds stay quarter-relative (legacy divisors).
 * 1 = beat, 2 = half beat, 4 = quarter of the beat.
 */
export function subdivisionForRate(arpRate: number): 1 | 2 | 4 | null {
  if (arpRate <= 1) return 1;
  if (arpRate === 2) return 2;
  if (arpRate === 4) return 4;
  return null;
}

/** Milliseconds per arp tick. 4/4 rate 4 stays a 16th (legacy). */
export function arpTickMs(
  tempo: number,
  ts: TimeSignature,
  arpRate: number,
): number {
  if (!(tempo > 0)) return 0;
  const quarter = 60000 / tempo;
  if (arpRate === 3) return quarter / 3;
  if (arpRate === 5) return quarter / 6;
  if (arpRate === 6) return quarter / 8;
  const sub = subdivisionForRate(arpRate) ?? 4;
  return quarter * (beatUnitQuarters(ts) / sub);
}

export interface ArpHit {
  readonly play: boolean;
  /** Delay as a fraction of one tick (0 or 0.5). */
  readonly offsetSteps: number;
  readonly velocity: number;
}

/**
 * One slot in the bar. `step` is the arp tick index.
 * Subdivision 2 is the variety grid (on + off per beat).
 */
export function arpHitAt(args: {
  step: number;
  beats: number;
  rhythm: ArpRhythmId;
  syncopation: boolean;
}): ArpHit {
  const beats = Math.max(1, Math.floor(args.beats) || 1);
  const slots = beats * 2;
  const slot = ((Math.floor(args.step) % slots) + slots) % slots;
  const beat = Math.floor(slot / 2);
  const sub = slot % 2;
  const play = slotSounds(args.rhythm, beat, sub, beats);
  const offsetSteps = args.syncopation && play && sub === 0 ? 0.5 : 0;
  const velocity = sub === 0 ? 105 : 75;
  return { play, offsetSteps, velocity };
}

function slotSounds(
  rhythm: ArpRhythmId,
  beat: number,
  sub: number,
  beats: number,
): boolean {
  if (rhythm === "straight") return true;
  if (rhythm === "offbeat") return sub === 1;
  if (rhythm === "charleston") {
    if (beat % 2 === 0) return sub === 0;
    return sub === 1;
  }
  return sub === 0 && (beat === 0 || beat === 2 || beat === beats - 1);
}

/** Template -> meter. Picking a template applies this. */
export function templateMeter(id: FormTemplateId): TimeSignature {
  switch (id) {
    case "abac":
      return "3/4";
    case "theme-vars":
      return "5/4";
    case "through-composed":
      return "7/8";
    case "aaba":
    default:
      return "4/4";
  }
}

export interface StyleRhythmPreset {
  readonly meter: TimeSignature;
  readonly rhythm: ArpRhythmId;
  readonly syncopation: boolean;
}

/** Style pack -> live arp + meter. Unknown ids return null. */
export function styleRhythmPreset(id: string): StyleRhythmPreset | null {
  const table: Record<StylePackId, StyleRhythmPreset> = {
    jazz: { meter: "4/4", rhythm: "charleston", syncopation: true },
    "common-practice": { meter: "3/4", rhythm: "straight", syncopation: false },
    modal: { meter: "5/4", rhythm: "offbeat", syncopation: false },
    "post-tonal": { meter: "7/8", rhythm: "clave", syncopation: true },
    "axis-system": { meter: "5/4", rhythm: "charleston", syncopation: true },
  };
  return table[id as StylePackId] ?? null;
}
