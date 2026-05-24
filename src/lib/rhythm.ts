import { audioEngine } from './audio';

export type BeatType = 'none' | 'metronome' | 'jazz' | 'bossa' | 'techno';

export class RhythmEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;
  private isPlaying = false;
  private tempo = 60; // BPM
  private beatType: BeatType = 'none';

  private stepsPerMeasure = 16;
  private timeSignature = '4/4';

  setTimeSignature(ts: string) {
    this.timeSignature = ts;
    switch (ts) {
      case '4/4': this.stepsPerMeasure = 16; break;
      case '6/8': this.stepsPerMeasure = 12; break;
      case '7/8': this.stepsPerMeasure = 14; break;
      case '11/4': this.stepsPerMeasure = 44; break;
      case 'tintal': this.stepsPerMeasure = 64; break;
      default: this.stepsPerMeasure = 16; break;
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
    // Determine macro beat for metronome
    if (this.beatType === 'metronome') {
      if (step === 0) audioEngine.playMetronomeClick(true);
      else if ((this.timeSignature === '6/8' || this.timeSignature === '7/8') && step % 2 === 0) {
         // click every eighth note in 6/8 and 7/8
         audioEngine.playMetronomeClick(false);
      }
      else if (this.timeSignature !== '6/8' && this.timeSignature !== '7/8' && step % 4 === 0) {
         // click every quarter note
         audioEngine.playMetronomeClick(false);
      }
    } else if (this.beatType === 'jazz') {
      // Swing ride pattern: 1 . 3 4
      // High hat on 2 and 4
      if (step % 16 === 0 || step % 16 === 4 || step % 16 === 8 || step % 16 === 12) {
        audioEngine.playDrumRide(); // Quarter notes
      }
      if (step % 16 === 10 || step % 16 === 14) {
        audioEngine.playDrumRide(0.3); // softer
      }
      if (step % 16 === 4 || step % 16 === 12) {
        audioEngine.playDrumHat(); // hat on 2 & 4
      }
      if (step % 16 === 0) audioEngine.playDrumKick();
      if (step % 16 === 8) audioEngine.playDrumKick(0.3);
    } else if (this.beatType === 'bossa') {
      // kick on 1 and 3 (step 0, 8), and slightly before 3 (step 7) and 1 (step 15)
      if (step % 16 === 0 || step % 16 === 8) audioEngine.playDrumKick();
      if (step % 16 === 7 || step % 16 === 15) audioEngine.playDrumKick(0.5);

      // Hat 8ths
      if (step % 2 === 0) audioEngine.playDrumHat();

      // Rimshot/cross stick pattern 
      if (step % 16 === 0 || step % 16 === 3 || step % 16 === 6 || step % 16 === 10 || step % 16 === 13) {
        audioEngine.playDrumRim();
      }
    } else if (this.beatType === 'techno') {
      // 4 on the floor
      if (step % 4 === 0) audioEngine.playDrumKick();
      // Offbeat hat
      if (step % 4 === 2) audioEngine.playDrumHat(0.8, true); // Open hat
      // Clap/snare on 2 and 4
      if (step % 16 === 4 || step % 16 === 12) audioEngine.playDrumSnare();
      // 16th hats
      if (step % 2 === 0) audioEngine.playDrumHat(0.4);
    }
  }
}

export const rhythmEngine = new RhythmEngine();
