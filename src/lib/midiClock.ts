/**
 * src/lib/midiClock.ts - pure MIDI Real-Time clock follower.
 *
 * Slaves the app tempo + transport to a DAW's MIDI Real-Time clock
 * (24 PPQN; Real-Time messages: 0xF8 tick, 0xFA start, 0xFB continue,
 * 0xFC stop). Pure and node-testable: no window/navigator/audio-engine
 * imports, so the EMA / warmup / deadband / throttle math is proven by
 * tests/midiClock.test.ts in the node project before any transport wiring
 * (same convention as rhythm.ts - pure logic in src/lib, tested in the
 * node env; React components are intentionally not unit-tested).
 */

export type MidiClockTransportKind = "start" | "continue" | "stop";

export type BpmListener = (bpm: number) => void;
export type TransportListener = (t: MidiClockTransportKind) => void;

export interface MidiClockSnapshot {
  /** Smoothed BPM, or null before warmup completes. */
  bpm: number | null;
  /** True once warmup completed and at least one BPM published. */
  isWarm: boolean;
  /** Settled intervals observed (warmCount). */
  settledTicks: number;
  /** Last accepted tick interval in ms. */
  lastIntervalMs: number;
}

export interface MidiClockFollowerOptions {
  /** Ticks per quarter note; MIDI Real-Time is 24 (0xF8). */
  ppqn?: number;
  /** Settled intervals required before publishing BPM. */
  warmupTicks?: number;
  /** EMA smoothing (0..1); higher responds faster. */
  smoothing?: number;
  /** Sanity floor for accepted instant BPM. */
  minBpm?: number;
  /** Sanity ceiling for accepted instant BPM. */
  maxBpm?: number;
  /** A tick gap larger than this resets the EMA. */
  maxGapMs?: number;
  /** Publish only when smoothed BPM moved by at least this. */
  bpmDeadband?: number;
  /** Throttle: min wall-clock between publishes. */
  minPublishIntervalMs?: number;
}

const MIDI_CLOCK_DEFAULTS: Required<MidiClockFollowerOptions> = {
  ppqn: 24,
  warmupTicks: 6,
  smoothing: 0.25,
  minBpm: 30,
  maxBpm: 240,
  maxGapMs: 1500,
  bpmDeadband: 1,
  minPublishIntervalMs: 250,
};

export class MidiClockFollower {
  private opts: Required<MidiClockFollowerOptions>;
  private lastTickAt: number | null = null;
  private previousIntervalMs: number | null = null;
  private emaBpm: number | null = null;
  private warmCount = 0;
  private settledTicks = 0;
  private lastPublishedBpm: number | null = null;
  private lastPublishAt = 0;
  private bpmListeners: BpmListener[] = [];
  private transportListeners: TransportListener[] = [];

  constructor(options: MidiClockFollowerOptions = {}) {
    this.opts = { ...MIDI_CLOCK_DEFAULTS, ...options };
  }


  /**
   * Feed one Real-Time tick (0xF8) at a monotonic millis timestamp.
   * Advances the EMA, runs the warmup gate, and publishes so long as
   * the deadband + throttle guards pass. Pure math; node-testable.
   */
  tick(nowMs: number): void {
    if (this.lastTickAt === null) {
      this.lastTickAt = nowMs;
      return;
    }
    const intervalMs = nowMs - this.lastTickAt;
    this.lastTickAt = nowMs;

    if (intervalMs <= 0 || intervalMs > this.opts.maxGapMs) {
      this.resetTempo();
      return;
    }

    const quarterMs = intervalMs * this.opts.ppqn;
    const instantBpm = 60000 / quarterMs;
    if (instantBpm < this.opts.minBpm || instantBpm > this.opts.maxBpm) {
      return;
    }

    if (this.emaBpm === null) {
      this.emaBpm = instantBpm;
    } else {
      this.emaBpm =
        this.emaBpm * (1 - this.opts.smoothing) +
        instantBpm * this.opts.smoothing;
    }

    if (this.previousIntervalMs === null) {
      this.warmCount += 1;
    } else {
      const drift =
        Math.abs(intervalMs - this.previousIntervalMs) / this.previousIntervalMs;
      this.warmCount = drift < 0.2 ? this.warmCount + 1 : 0;
    }
    this.previousIntervalMs = intervalMs;
    this.settledTicks += 1;

    if (this.warmCount < this.opts.warmupTicks) return;
    if (this.emaBpm === null) return;

    const now = nowMs;
    const deadbandOk =
      this.lastPublishedBpm === null ||
      Math.abs(this.emaBpm - this.lastPublishedBpm) >= this.opts.bpmDeadband;
    const throttleOk =
      now - this.lastPublishAt >= this.opts.minPublishIntervalMs;
    if (!(deadbandOk && throttleOk)) return;

    const bpm = this.emaBpm;
    this.lastPublishedBpm = bpm;
    this.lastPublishAt = now;
    for (const cb of this.bpmListeners) {
      try {
        cb(bpm);
      } catch (e) {
        console.error("midiClock bpm listener failed:", e);
      }
    }
  }


  /** 0xFA - start. Resets tempo state (DAW begins a fresh run). */
  start(): void {
    this.resetTempoState();
    this.emitTransport("start");
  }

  /** 0xFB - continue. Keeps tempo state (sitting on a bar line). */
  continueTransport(): void {
    this.emitTransport("continue");
  }

  /** 0xFC - stop. Resets tempo state and halts. */
  stop(): void {
    this.resetTempoState();
    this.emitTransport("stop");
  }

  /** Register a BPM listener; returns an unsubscribe fn. */
  onBpm(cb: BpmListener): () => void {
    this.bpmListeners.push(cb);
    return () => {
      this.bpmListeners = this.bpmListeners.filter((l) => l !== cb);
    };
  }

  /** Register a transport listener; returns an unsubscribe fn. */
  onTransport(cb: TransportListener): () => void {
    this.transportListeners.push(cb);
    return () => {
      this.transportListeners = this.transportListeners.filter((l) => l !== cb);
    };
  }

  /** Reset all listeners (teardown on unmount / disconnect). */
  removeAllListeners(): void {
    this.bpmListeners = [];
    this.transportListeners = [];
    this.resetTempoState();
  }

  /** Live (cheap) snapshot of clock state. */
  snapshot(): MidiClockSnapshot {
    return {
      bpm: this.emaBpm,
      isWarm: this.warmCount >= this.opts.warmupTicks && this.emaBpm !== null,
      settledTicks: this.settledTicks,
      lastIntervalMs: this.previousIntervalMs ?? 0,
    };
  }

  /** Reset EMA/warmup/settled state (DAW pause or cable pull). */
  private resetTempo(): void {
    this.resetTempoState();
  }

  private resetTempoState(): void {
    this.lastTickAt = null;
    this.previousIntervalMs = null;
    this.emaBpm = null;
    this.warmCount = 0;
    this.settledTicks = 0;
  }

  private emitTransport(kind: MidiClockTransportKind): void {
    for (const cb of this.transportListeners) {
      try {
        cb(kind);
      } catch (e) {
        console.error("midiClock transport listener failed:", e);
      }
    }
  }
  /** Fully reset tempo + published state (DAW stop / cable pull). */
  reset(): void {
    this.resetTempo();
  }
}
