import { audioEngine } from "./audio";
import {
  clickActionFor,
  stepsPerBeatFor,
  type MetronomeSubdivision,
} from "./metronomePatterns";

export type TimeSignature =
  | "4/4"
  | "6/8"
  | "7/8"
  | "11/4"
  | "tintal";

export class RhythmEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;
  private isPlaying = false;
  private tempo = 60; // BPM
  // When false, playStep() schedules its interval ticks but does
  // not fire audioEngine.playMetronomeClick. The backing track
  // (BackingEngine) is independent and keeps playing — only the
  // metronome click track mutes. Defaults to true so existing
  // behavior is unchanged.
  private metronomeEnabled = true;
  // PRD-001 Phase 3 Slice 3 (D34): subdivision + per-beat accents ride
  // the SAME 16th grid. Defaults MIRROR DEFAULT_METRONOME_CONFIG
  // (subdivision 1, accentBeats [0]) so the default engine is
  // BIT-IDENTICAL to the legacy click pattern - the frozen
  // tests/rhythm.test.ts spy (single-arg playMetronomeClick(true) on
  // step 0) is the canary and metronomePatterns.test.ts T1 is the
  // exhaustive per-meter oracle. Config flows in via
  // setMetronomePattern (App sync effect), NEVER via extra
  // playMetronomeClick args (F1).
  private subdivision: MetronomeSubdivision = 1;
  private accentBeats: readonly number[] = [0];
  // Metronome-only click is gated by time signature in playStep();
  // the backing-style drum patterns are handled by BackingEngine,
  // so this engine no longer needs a beat-type selector.
  private stepsPerMeasure = 16;
  private timeSignature: TimeSignature = "4/4";

  setMetronomeEnabled(on: boolean) {
    this.metronomeEnabled = on;
  }

  /** ONE atomic setter (mirrors setMetronomeEnabled's shape): the
   *  App sync effect pushes the user's subdivision + accent pattern
   *  whenever the persisted config changes. */
  setMetronomePattern(
    subdivision: MetronomeSubdivision,
    accentBeats: readonly number[],
  ) {
    this.subdivision = subdivision;
    this.accentBeats = accentBeats;
  }

  isMetronomeEnabled(): boolean {
    return this.metronomeEnabled;
  }

  /** 16th-note steps per measure for the active time signature
   *  (16 for 4/4, 12 for 6/8, 14 for 7/8, 44 for 11/4, 64 for
   *  tintal). Consumers use this to convert path steps (1 step =
   *  1 measure) into wall-clock duration. */
  getStepsPerMeasure(): number {
    return this.stepsPerMeasure;
  }

  setTimeSignature(ts: TimeSignature) {
    this.timeSignature = ts;
    switch (ts) {
      case "4/4":
        this.stepsPerMeasure = 16;
        break;
      case "6/8":
        this.stepsPerMeasure = 12;
        break;
      case "7/8":
        this.stepsPerMeasure = 14;
        break;
      case "11/4":
        this.stepsPerMeasure = 44;
        break;
      case "tintal":
        this.stepsPerMeasure = 64;
        break;
      default:
        this.stepsPerMeasure = 16;
        break;
    }
    // If we're off-cycle, reset
    if (this.currentStep >= this.stepsPerMeasure) {
      this.currentStep = 0;
    }
  }

  private onMeasureStart?: () => void;

  setOnMeasureStart(cb: () => void) {
    this.onMeasureStart = cb;
  }

  setTempo(bpm: number) {
    this.tempo = bpm;
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  get isRunning() {
    return this.isPlaying;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;

    const msPer16th = (60 / this.tempo / 4) * 1000;

    // Trigger first step right away
    this.playStep(0);
    this.currentStep = 1;

    this.intervalId = setInterval(() => {
      this.playStep(this.currentStep);
      // Wait to call onMeasureStart until step 0 of the next measure!
      if (this.currentStep === 0 && this.onMeasureStart) {
        this.onMeasureStart();
      }
      this.currentStep = (this.currentStep + 1) % this.stepsPerMeasure;
    }, msPer16th);
  }

  stop() {
    // ACCEPTED TAIL (fix round, documented - NOT fixed): the two
    // triplet partners of the LAST fired beat live in WebAudio time
    // (scheduleMetronomeClick, D34) and may still sound up to
    // 2/3 of a beat AFTER this clearInterval. <= 2 self-terminating
    // clicks, no state impact, inaudible under normal stop UX -
    // accepted trade-off of scheduling beside the grid instead of
    // running a faster interval.
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private playStep(step: number) {
    // Metronome click only. The 11-style backing tracks (swing /
    // bossa / funk / latin / ballad / clave3-2 / clave3-3 /
    // afro-4-4 / afro-4-3 / afro-3-4) are scheduled by
    // BackingEngine.schedulePattern(), which runs in parallel and
    // would double-trigger if this engine also emitted drums.
    // When the user has muted the metronome via the UI, skip the
    // click entirely — the BackingEngine keeps running unaffected.
    //
    // PRD-001 Phase 3 Slice 3 (D34): the click decision is pure
    // (clickActionFor). Gate order is UNCHANGED (metronomeEnabled
    // first); the 16th grid, the stepsPerMeasure table, and the
    // onMeasureStart timing are IMMUTABLE. Triplet subdivision rides
    // WebAudio scheduling BESIDE the grid (scheduleMetronomeClick),
    // never a faster interval.
    if (!this.metronomeEnabled) return;
    const secPerBeat =
      (60000 / this.tempo / 1000) * (stepsPerBeatFor(this.timeSignature) / 4);
    const action = clickActionFor(
      step,
      this.timeSignature,
      this.subdivision,
      this.accentBeats,
      secPerBeat,
    );
    switch (action.kind) {
      case "click":
        // F1 HARD RULE: EXACTLY one argument (the frozen
        // tests/rhythm.test.ts spy fails on a second arg, even
        // undefined). Volume/preset ride the audioEngine setters.
        audioEngine.playMetronomeClick(action.high);
        break;
      case "triplet":
        // Beat-boundary click on the grid + the two triplet partners
        // scheduled INSIDE the beat in WebAudio time (D34).
        audioEngine.playMetronomeClick(action.high);
        audioEngine.scheduleMetronomeClick(false, action.secPerBeat / 3);
        audioEngine.scheduleMetronomeClick(false, (2 * action.secPerBeat) / 3);
        break;
      case "none":
      default:
        break;
    }
  }
}

export const rhythmEngine = new RhythmEngine();