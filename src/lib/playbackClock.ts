/**
 * PlaybackClock — a singleton rAF loop that dispatches a
 * `tick` CustomEvent on `window` for every animation frame, plus
 * a `subscribe(cb)` API for typed consumers.
 *
 * Why a window event:
 *   - Decouples the visual layers (rail, score, canvas, piano)
 *     from the clock. Each layer subscribes in its own way and
 *     can be added/removed without touching the clock.
 *   - One rAF source means one CPU budget — the alternative is
 *     each layer running its own rAF (current state) which
 *     doubles or triples the per-frame cost.
 *   - Subscribers can read the `detail.beat` (0..1 within the
 *     current beat) for smooth animation, or `detail.step` (the
 *     integer chord index from the active path) for snapped UI.
 *
 * Tick detail shape:
 *   {
 *     step:      number   // 0-based chord index (snapped to nearest)
 *     beat:      number   // 0-based beat-within-bar (0..timeSignatureNum)
 *     phase:     number   // 0..1 within the current 16th
 *     timeSec:   number   // wall-clock seconds since clock start
 *     isRunning: boolean // whether the clock is currently advancing
 *   }
 *
 * Pattern lifted from `browser-chart-engine-cdn-loading` skill §5.
 */

import { rhythmEngine } from "./rhythm";

/**
 * F3 (D110/D113) pure step-math helpers, extracted so the two
 * formulas are unit-pinnable without a running engine.
 *
 * Wall-clock seconds for ONE path step (= ONE bar, audio truth):
 * the same grid the audio interval uses (rhythm.ts start():
 * msPer16th = 60/bpm/4, onMeasureStart wraps at stepsPerMeasure).
 * In 4/4 (16) this is 4 * 60/bpm - byte-identical to the legacy
 * "4 beats per bar" constant; compound meters stop lying about the
 * bar period (the old constant was 4/4-only).
 */
export function secPerBarGrid(bpm: number, stepsPerMeasure: number): number {
  return (stepsPerMeasure / 4) * (60 / bpm);
}

/**
 * F3: the honest step law for the visual clock - ONE path step per
 * bar. The legacy `(elapsed / secPerBeat / beatsPerBar) * 4`
 * ("16ths/bar") factor was the 1-step-per-BEAT fiction and advanced
 * the visual playhead 4x too fast against the transport.
 */
export function stepOfElapsed(
  elapsedSec: number,
  secPerBar: number,
  pathStepCount: number,
): number {
  const perBar = secPerBar > 0 ? secPerBar : 1;
  const count = pathStepCount > 0 ? pathStepCount : 1;
  return Math.floor(elapsedSec / perBar) % count;
}

export interface TickDetail {
  step: number;
  beat: number;
  phase: number;
  timeSec: number;
  isRunning: boolean;
}

type TickListener = (detail: TickDetail) => void;

class PlaybackClock {
  private rafId: number | null = null;
  private startMs: number = 0;
  private pausedAt: number = 0;
  private bpm: number = 80;
  private timeSignature: [number, number] = [4, 4];
  private isRunning = false;
  private currentStep = 0;
  private listeners = new Set<TickListener>();
  private lastFrameMs = 0;

  /**
   * Configure the clock. Use this when the active path, tempo, or
   * meter changes — the existing rAF loop picks up the new values
   * on the next frame.
   */
  setTempo(bpm: number) {
    this.bpm = bpm;
  }
  setTimeSignature(num: number, den: number) {
    this.timeSignature = [num, den];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startMs = performance.now();
    this.pausedAt = 0;
    this.lastFrameMs = this.startMs;
    this.currentStep = 0;
    // Bridge to the existing rhythmEngine so the metronome audio
    // stays in sync. We don't replace its setInterval-based clock;
    // we just call playStep on each new measure, matching its
    // internal `currentStep` model.
    rhythmEngine.start();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.pausedAt = performance.now() - this.startMs;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    rhythmEngine.stop();
    // Final tick so subscribers can render a "stopped" frame
    this.dispatch(/*frozen*/);
  }

  /**
   * Move the playhead to a specific chord step (snapped). Useful
   * for the rail's bar-strip click handler.
   */
  seekToStep(step: number) {
    const totalSec = this.pathDurationSec();
    const targetSec = (step / Math.max(1, this.pathStepCount - 1)) * totalSec;
    this.pausedAt = targetSec * 1000;
    if (this.isRunning) {
      this.startMs = performance.now() - this.pausedAt;
    } else {
      this.startMs = -this.pausedAt;
    }
    this.currentStep = step;
    this.dispatch();
  }

  /**
   * F3 (D113): phase-anchor the wall-time grid to the transport's
   * step. Called once per bar from the App's onMeasureStart handler
   * so the visual playhead cannot drift across bar lines between
   * chord changes: startMs is set so elapsed-seconds maps exactly
   * onto `step` at call time. The rAF clock stays animation-only
   * (D113); full dual-clock retirement is TD-039.
   */
  reanchor(step: number): void {
    const secPerBar = this.secPerBar();
    const targetMs = Math.max(0, Math.floor(step) || 0) * secPerBar * 1000;
    if (this.isRunning) {
      this.startMs = performance.now() - targetMs;
    }
    this.pausedAt = targetMs;
    this.currentStep = stepOfElapsed(targetMs / 1000, secPerBar, this.pathStepCount);
  }

  /**
   * The path needs to know how many steps it has. The App owns the
   * active path; it sets this so the clock can compute totalSec for
   * seek and progress rendering.
   */
  setPathStepCount(n: number) {
    this.pathStepCount = Math.max(1, n);
  }
  private pathStepCount = 1;

  /**
   * Subscribe to tick events. Returns an unsubscribe function.
   */
  subscribe(cb: TickListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- internals ----

  /** Seconds per bar on the live 16th grid (F3: meter-aware). */
  private secPerBar(): number {
    return secPerBarGrid(this.bpm, rhythmEngine.getStepsPerMeasure());
  }

  private pathDurationSec(): number {
    // F3 (D110): 1 step = 1 bar of audio. The legacy "4 beats per
    // bar, 4/4 universal" constant is replaced by the same
    // stepsPerMeasure/4 * 60/bpm grid the audio interval uses, so
    // 4/4 output is byte-identical and compound meters stop lying.
    return this.pathStepCount * this.secPerBar();
  }

  private tick = (nowMs: number) => {
    if (!this.isRunning) return;
    const elapsedMs = nowMs - this.startMs;
    const dtMs = nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    void dtMs; // (available for subscribers that want velocity)

    const totalSec = this.pathDurationSec();
    const elapsedSec = (elapsedMs / 1000) % totalSec;
    const beatsPerBar = this.timeSignature[0];
    const secPerBeat = 60 / this.bpm;
    const totalBeats = elapsedSec / secPerBeat;
    const beat = totalBeats % beatsPerBar;
    // F3 (D110): 1 step = 1 bar. The legacy "* 4" ("16ths/bar")
    // factor was the 1-step-per-BEAT fiction - it advanced the
    // visual step 4x faster than the transport.
    const secPerBar = this.secPerBar();
    const stepFloat = elapsedSec / secPerBar;
    const step = stepOfElapsed(elapsedSec, secPerBar, this.pathStepCount);

    if (step !== this.currentStep) {
      this.currentStep = step;
    }
    this.dispatch({ step, beat, phase: stepFloat - Math.floor(stepFloat), timeSec: elapsedSec, isRunning: true });

    this.rafId = requestAnimationFrame(this.tick);
  };

  private dispatch(overrides?: Partial<TickDetail>) {
    const totalSec = this.pathDurationSec();
    const elapsedMs = this.isRunning
      ? performance.now() - this.startMs
      : this.pausedAt;
    const elapsedSec = (elapsedMs / 1000) % totalSec;
    const beatsPerBar = this.timeSignature[0];
    const secPerBeat = 60 / this.bpm;
    const totalBeats = elapsedSec / secPerBeat;
    const detail: TickDetail = {
      step: this.currentStep,
      beat: totalBeats % beatsPerBar,
      phase: 0,
      timeSec: elapsedSec,
      isRunning: this.isRunning,
      ...overrides,
    };
    this.listeners.forEach((cb) => {
      try {
        cb(detail);
      } catch (e) {
        console.error("playbackClock listener failed:", e);
      }
    });
    // Also dispatch a window event so devtools can see it and
    // optional 3rd-party code can subscribe without an import.
    try {
      window.dispatchEvent(
        new CustomEvent("tick", { detail }),
      );
    } catch {
      // Some environments disallow CustomEvent — listener path still works.
    }
  }
}

export const playbackClock = new PlaybackClock();