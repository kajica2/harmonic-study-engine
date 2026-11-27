import type { NoteEvent } from "./model";

export interface SoundEvent extends NoteEvent {
  drum?: "low" | "high";
}
/** Small self-contained synth: no mic, remote assets, singleton engines or API calls. */
export class LearningAudio {
  private context: AudioContext | null = null;
  private frame = 0;
  private generation = 0;

  stop() {
    this.generation++;
    cancelAnimationFrame(this.frame);
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }

  async start(
    events: readonly SoundEvent[],
    beats: number,
    bpm: number,
    loop: boolean,
    onBeat: (beat: number) => void,
    onEnd: () => void,
  ): Promise<void> {
    this.stop();
    const run = this.generation;
    const ctx = new AudioContext();
    this.context = ctx;
    try {
      await ctx.resume();
    } catch (error) {
      if (run === this.generation) this.stop();
      throw error;
    }
    if (run !== this.generation) return;
    const seconds = 60 / bpm;
    const start = ctx.currentTime + 0.06;
    let scheduledCycle = -1;
    const schedule = (cycle: number) => {
      const cycleStart = start + cycle * beats * seconds;
      for (const event of events) {
        const at = cycleStart + event.beat * seconds;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const length = event.drum
          ? 0.12
          : Math.max(0.08, event.duration * seconds);
        oscillator.type = event.drum === "high" ? "triangle" : "sine";
        const frequency =
          event.drum === "low"
            ? 120
            : event.drum === "high"
              ? 1100
              : 440 * 2 ** ((event.midi - 69) / 12);
        oscillator.frequency.setValueAtTime(frequency, at);
        if (event.drum)
          oscillator.frequency.exponentialRampToValueAtTime(
            event.drum === "low" ? 45 : 600,
            at + length,
          );
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + length + 0.02);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    };
    // Schedule a bounded look-ahead against the audio clock, not setInterval timing.
    const tick = () => {
      if (run !== this.generation) return;
      const position = Math.max(0, (ctx.currentTime - start) / seconds);
      if (!loop && position >= beats) {
        this.stop();
        onEnd();
        return;
      }
      const cycle = Math.floor(position / beats);
      const through =
        loop && position % beats > beats - 0.5 / seconds ? cycle + 1 : cycle;
      while (scheduledCycle < through) schedule(++scheduledCycle);
      onBeat(position % beats);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }
}
