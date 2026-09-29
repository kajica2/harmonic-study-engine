/**
 * src/lib/trumpetStageTrainer.ts — audio capture + scoring state
 * machine for the trumpet stage trainer. Browser-only: requires an
 * AudioContext + getUserMedia. The pure scoring / state-transition
 * logic is exposed via `processBlock` so it can be exercised by
 * unit tests with synthetic blocks.
 */

import { detectPitch, freqToNote, type PitchHint } from "./trumpetTuner";
import {
  degreeToPitchClass,
  type StageConfig,
} from "./trumpetStage";

/** Map pitch-class name -> MIDI offset within an octave. Used to
 *  convert (pc, octave) into the expected frequency for cents-
 *  deviation comparisons. */
const pcToMidi: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export type Outcome = "hit" | "wrong" | "miss" | "timeout";

export interface AttemptRecord {
  degree: string;
  targetPc: string;
  targetOctave: number;
  outcome: Outcome;
  /** Median cents from the target's expected MIDI frequency
   *  (robust intonation signal). */
  avgCents: number | null;
  /** Mean cents (sensitive to outliers; surfaces "shakiness" in the
   *  UI). Median - mean gap is the jitter metric. */
  meanCents: number | null;
  /** Standard deviation of cents across the attempt's blocks.
   *  Lower = steadier intonation. */
  centsStdev: number | null;
  maxAmp: number;
}

export interface ActiveAttempt {
  degree: string;
  targetPc: string;
  targetOctave: number;
  startedAt: number;
  centsSamples: number[];
  maxAmp: number;
  /** Consecutive blocks with no confident pitch (silence / breath /
   *  noise). Reset to 0 on any confident block. The attempt only
   *  closes as a `miss` once this hits SILENT_BLOCKS_TO_MISS in a
   *  row — a single dropout mid-note is ignored instead of killing
   *  the attempt. */
  silentBlocks: number;
}

export interface StageSession {
  config: Required<StageConfig>;
  attempts: AttemptRecord[];
  active: ActiveAttempt | null;
  index: number;
  status: "idle" | "running" | "stopped";
  /** Timestamp of the last successful HIT attempt. UI uses this to
   *  keep the green "in-tune" indicator lit for ~1s after close
   *  so the player sees the celebration before the next target
   *  takes over the panel. */
  lastHitAt?: number;
  /** Internal throttle hint used by the React binding. Not part of
   * the public surface; consumers should treat it as opaque. */
  _lastRender?: number;
}

export const SAMPLE_RATE = 44100;
export const BLOCK_SIZE = 8192;

/** Consecutive unconfident / silent blocks required before an attempt
 *  is abandoned as a `miss`. At ~186 ms per 8192-sample block this is
 *  ~560 ms of true silence — long enough that a mid-note breath,
 *  a transient mic dropout, or one noisy block does NOT kill a held
 *  note. */
export const SILENT_BLOCKS_TO_MISS = 3;

export function createStageSession(cfg: StageConfig): StageSession {
  return {
    config: {
      perNoteToleranceCents: 7,
      sustainSeconds: 0.6,
      timeoutSeconds: 15,
      ...cfg,
    },
    attempts: [],
    active: null,
    index: 0,
    status: "idle",
  };
}

function expectedTarget(
  session: StageSession,
  prevOctave: number | null,
): { degree: string; targetPc: string; targetOctave: number } {
  const seq = session.config.degreeSequence;
  const deg = seq[session.index % seq.length];
  const pc =
    degreeToPitchClass(
      session.config.chordRoot,
      session.config.chordQuality,
      deg,
    ) ?? "?";
  const octave = prevOctave ?? 4;
  return { degree: deg, targetPc: pc, targetOctave: octave };
}

function finalizeAttempt(
  session: StageSession,
  outcome: Outcome,
  medianCents: number | null = null,
  now: number = Date.now(),
): void {
  if (!session.active) return;
  const { degree, targetPc, targetOctave, maxAmp, centsSamples } =
    session.active;
  const n = centsSamples.length;
  const mean =
    n > 0 ? centsSamples.reduce((a, b) => a + b, 0) / n : null;
  const median =
    medianCents ??
    (() => {
      if (n === 0) return null;
      const s = [...centsSamples].sort((a, b) => a - b);
      return s[Math.floor(n / 2)];
    })();
  const stdev =
    mean !== null && n > 1
      ? Math.sqrt(
          centsSamples.reduce((a, b) => a + (b - (mean ?? 0)) ** 2, 0) /
            (n - 1),
        )
      : null;
  session.attempts.push({
    degree,
    targetPc,
    targetOctave,
    outcome,
    avgCents: median,
    meanCents: mean,
    centsStdev: stdev,
    maxAmp,
  });
  // When the attempt is a HIT, record the timestamp so the UI can
  // keep the green "in-tune" needle lit for `holdInTuneMs` past the
  // close — gives the player visual confirmation that they nailed
  // it before the next target takes over.
  if (outcome === "hit") {
    session.lastHitAt = now;
  }
  session.active = null;
  session.index += 1;
}

/**
 * Pure scoring: feed one mono audio block (mono Float32Array, length
 * = BLOCK_SIZE recommended) and `now` (ms timestamp). Mutates
 * `session` in place: starts a new attempt when idle, accepts hits
 * after the sustain window, and closes misses / wrong-tone / timeouts.
 */
export function processBlock(
  session: StageSession,
  block: Float32Array,
  now: number,
): StageSession {
  if (session.status !== "running") return session;

  // Start a fresh attempt if none active.
  if (session.active === null) {
    const prevOctave =
      session.attempts.length > 0
        ? session.attempts[session.attempts.length - 1].targetOctave
        : null;
    const { degree, targetPc, targetOctave } = expectedTarget(
      session,
      prevOctave,
    );
    session.active = {
      degree,
      targetPc,
      targetOctave,
      startedAt: now,
      centsSamples: [],
      maxAmp: 0,
      silentBlocks: 0,
    };
    return session;
  }

  // Hard timeout.
  if (
    now - session.active.startedAt >
    session.config.timeoutSeconds * 1000
  ) {
    finalizeAttempt(session, "timeout", null, now);
    return session;
  }

  const { freq, amp, confidence, source } = detectPitch(
    block,
    SAMPLE_RATE,
    undefined,
    session.active
      ? ({
          pitchClass: session.active.targetPc,
          octave: session.active.targetOctave,
        } satisfies PitchHint)
      : undefined,
  );

  // Silence OR low-confidence detection: count consecutive dropouts.
  // A single bad block (breath, transient, mic blip) is ignored —
  // only sustained silence (SILENT_BLOCKS_TO_MISS in a row) ends the
  // attempt as a miss. Reset the counter on any confident block.
  if (freq <= 0 || confidence < 0.45) {
    session.active.silentBlocks += 1;
    if (
      session.active.silentBlocks >= SILENT_BLOCKS_TO_MISS &&
      now - session.active.startedAt > 200
    ) {
      finalizeAttempt(session, "miss", null, now);
    }
    return session;
  }
  session.active.silentBlocks = 0;

  const note = freqToNote(freq);
  if (!note) return session;

  // Compute the deviation from the EXPECTED frequency for the
  // target MIDI note (not the nearest semitone — a 50-cent flat
  // detector read of Bb4 still rounds to Bb4 but should be
  // discarded as wrong when it's > 75 cents off target).
  const expectedMidi =
    (session.active.targetOctave + 1) * 12 +
    pcToMidi[session.active.targetPc];
  const expectedFreq =
    expectedMidi >= 0 ? 440 * Math.pow(2, (expectedMidi - 69) / 12) : 0;
  const centsFromTarget =
    expectedFreq > 0 ? 1200 * Math.log2(freq / expectedFreq) : 0;

  // Wrong pitch class OR wildly out-of-tune: close immediately.
  // ±75 cents is the right cutoff — anything within a quarter-tone is
  // plausibly the target with bad intonation; beyond that it's almost
  // certainly a different note (the closest adjacent semitone).
  if (note.name !== session.active.targetPc || Math.abs(centsFromTarget) > 75) {
    finalizeAttempt(session, "wrong", null, now);
    return session;
  }

  // Track cents-from-target directly (not the rounded-nearest-semitone
  // cents). This is the intonation signal we actually care about:
  // a 15-cent-flat Bb4 reading shows up as 15 here (truthful) instead
  // of being folded back to 0 by the nearest-semitone rounding.
  if (expectedFreq > 0) {
    session.active.centsSamples.push(centsFromTarget);
  } else {
    session.active.centsSamples.push(note.cents);
  }
  session.active.maxAmp = Math.max(session.active.maxAmp, amp);

  const sustainMs = session.config.sustainSeconds * 1000;
  if (now - session.active.startedAt >= sustainMs) {
    // Median, not mean — robust to the occasional wild spectral
    // jitter block (residual harmonics, room noise). A held Bb4
    // might produce 30 samples: 28 within ±2 cents and 2 at
    // ±15 cents. Mean says "5 cents off"; median says "1.5 cents
    // off" — and that's the right verdict.
    const samples = session.active.centsSamples;
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    // Score against the median (robust to outliers) but report
    // both in the attempt record so the UI can show live jitter.
    const outcome: Outcome =
      Math.abs(mid) <= session.config.perNoteToleranceCents
        ? "hit"
        : "miss";
    finalizeAttempt(session, outcome, mid, now);
    // avg is recorded but not used for grading; could be surfaced
    // later as a "smoothness" metric.
    void avg;
  }
  return session;
}

/**
 * Start audio capture from the default mic. Returns a `stop` function
 * the caller must invoke on unmount or session-end. The `onBlock`
 * callback receives a reusable Float32Array (length BLOCK_SIZE).
 *
 * Browser-only. Uses the same Web Audio approach as `audioRecorder.ts`.
 */
export async function startAudioCapture(
  onBlock: (block: Float32Array) => void,
): Promise<() => void> {
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) {
    throw new Error("Web Audio API not available in this browser");
  }
  const ctx = new AudioCtor();
  if (ctx.state === "suspended") await ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(BLOCK_SIZE, 1, 1);
  source.connect(processor);
  // Some browsers require the processor to be connected to a node for
  // onaudioprocess to fire; route through a zero-gain node.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);

  const buf = new Float32Array(BLOCK_SIZE);
  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    for (let i = 0; i < BLOCK_SIZE; i++) buf[i] = input[i];
    onBlock(buf);
  };

  return () => {
    processor.disconnect();
    source.disconnect();
    sink.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}