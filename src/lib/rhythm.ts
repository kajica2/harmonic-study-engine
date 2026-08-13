import { audioEngine } from "./audio";

export type BeatType = "none" | "metronome" | "jazz" | "bossa" | "techno";

export class RhythmEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;
  private isPlaying = false;
  private tempo = 60; // BPM
  private beatType: BeatType = "none";

  private stepsPerMeasure = 16;
  private timeSignature = "4/4";

  setTimeSignature(ts: string) {
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

  setBeat(type: BeatType) {
    this.beatType = type;
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
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private playStep(step: number) {
    // Legacy metronome/drum patterns were superseded by the
    // BackingEngine, which runs in parallel via scheduleAhead().
    // The new engine handles all 11 styles (swing / bossa / funk /
    // latin / ballad / clave3-2 / clave3-3 / afro-4-4 / afro-4-3 /
    // afro-3-4). Keeping a parallel playStep() here would cause
    // double-triggers and conflicting drum hits. We only keep the
    // legacy audio click for the dedicated "metronome" mode, which
    // is the only beat type the new backing engine doesn't cover.
    if (this.beatType === "metronome") {
      if (step === 0) audioEngine.playMetronomeClick(true);
      else if (
        (this.timeSignature === "6/8" || this.timeSignature === "7/8") &&
        step % 2 === 0
      ) {
        audioEngine.playMetronomeClick(false);
      } else if (
        this.timeSignature !== "6/8" &&
        this.timeSignature !== "7/8" &&
        step % 4 === 0
      ) {
        audioEngine.playMetronomeClick(false);
      }
    }
    // The old jazz/bossa/techno branches were removed because
    // they're replaced by BackingEngine.schedulePattern() above.
  }
}

export const rhythmEngine = new RhythmEngine();
