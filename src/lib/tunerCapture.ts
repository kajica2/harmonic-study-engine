/**
 * src/lib/tunerCapture.ts - browser-only, refcounted singleton tuner
 * capture. Two surfaces (TunerWidget + TrumpetStageModal) share a
 * single AudioContext + MediaStream + ScriptProcessorNode so the
 * user is only prompted for mic permission ONCE, regardless of
 * which surface is active.
 *
 * Lives in src/lib because the production graph is pure (no React,
 * no UI). Tests run under jsdom (window.AudioContext + DOMException
 * are stubbed); this file only reaches for `window` / `navigator`
 * inside `subscribeTuner`, never at module load.
 *
 * Captures audio via ScriptProcessorNode (DEPRECATED but still widely
 * supported as of 2026-09-30). The TD-066 row in
 * `.kai/tech-debt/register.md` tracks the AudioWorklet migration as
 * future work; this slice does NOT swap it.
 */

import { BLOCK_SIZE } from "./trumpetStageTrainer";

export type TunerErrorKind =
  | "unsupported"
  | "insecure"
  | "denied"
  | "no-mic"
  | "suspended";

export type TunerStatus =
  | "idle"
  | "running"
  | TunerErrorKind;

export interface TunerState {
  status: TunerStatus;
  message: string;
}

export interface TunerCaptureHandle {
  stop(): void;
  sampleRate(): number;
}

type Listener = (block: Float32Array) => void;

const MESSAGES: Record<TunerErrorKind, string> = {
  unsupported: "Web Audio is not available in this browser.",
  insecure: "Microphone access needs HTTPS or localhost.",
  denied:
    "Microphone permission was denied. Allow access in the browser's site settings to use the tuner.",
  "no-mic": "No microphone was found. Connect a mic and try again.",
  suspended: "The audio system is suspended. Click to retry.",
};

export function tunerCaptureErrorMessage(kind: TunerErrorKind): string {
  return MESSAGES[kind];
}

export class TunerError extends Error {
  public readonly kind: TunerErrorKind;
  constructor(kind: TunerErrorKind, message: string) {
    super(message);
    this.name = "TunerError";
    this.kind = kind;
    // Restore the prototype chain after super() so `instanceof
    // TunerError` works under the ES5-target transpile path.
    Object.setPrototypeOf(this, TunerError.prototype);
  }
}

// Module-level singleton state. Refcounted via `listeners`: the
// graph is spun up on first subscribe and torn down on last stop.
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let sinkNode: GainNode | null = null;
const listeners = new Set<Listener>();
let lastErrorKind: TunerErrorKind | null = null;

// In-flight setup, memoized so concurrent subscribeTuner calls share
// the same AudioContext + getUserMedia prompt (MED-001). The first
// caller (setupPromise === null) builds the graph; subsequent
// callers await the same promise. Cleared on completion (success or
// failure) so a later teardown-then-resubscribe starts fresh and a
// failed setup can be retried.
let setupPromise: Promise<void> | null = null;

function setError(kind: TunerErrorKind): void {
  lastErrorKind = kind;
}

function clearError(): void {
  lastErrorKind = null;
}

function resolveAudioCtor():
  | typeof AudioContext
  | null {
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  return Ctor ?? null;
}

function isNotAllowed(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
  );
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotFoundError" || err.name === "OverconstrainedError")
  );
}

function rejectWith(kind: TunerErrorKind): never {
  setError(kind);
  throw new TunerError(kind, MESSAGES[kind]);
}

/**
 * Subscribe to live mic blocks. Returns a handle whose `stop()`
 * decrements the refcount (last stop tears down the graph). The
 * handle's `sampleRate()` reports the underlying AudioContext's
 * sample rate (0 if no graph is alive).
 *
 * Diagnostics (in priority order):
 *   1. unsupported: window.AudioContext (or webkitAudioContext) absent
 *   2. insecure: window.isSecureContext === false
 *   3. no-mic: navigator.mediaDevices missing
 *   4. suspended: ctx.state still "suspended" after await ctx.resume()
 *   5. denied / no-mic from getUserMedia rejection
 *
 * Concurrency: when two subscribeTuner calls land within the same
 * microtask (e.g. TunerWidget and TrumpetStageModal both mounting
 * under React 19 strict mode), they share the in-flight setup
 * promise so only one AudioContext + getUserMedia prompt is
 * created. setupPromise is cleared on completion (success or
 * failure) so a later teardown-then-resubscribe starts fresh and
 * a failed setup can be retried.
 */
export async function subscribeTuner(
  onBlock: Listener,
): Promise<TunerCaptureHandle> {
  // Synchronous preflight. These fail fast without touching the
  // shared setup promise, so concurrent callers all reject here
  // independently.
  const Ctor = resolveAudioCtor();
  if (!Ctor) rejectWith("unsupported");
  if (window.isSecureContext === false) rejectWith("insecure");
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    rejectWith("no-mic");
  }

  // Race-safe setup (MED-001). The first caller (setupPromise ===
  // null) kicks off doSetup and stashes the promise; subsequent
  // callers await the same promise instead of building a second
  // AudioContext + getUserMedia prompt.
  if (!ctx || !stream || !processor) {
    if (!setupPromise) {
      setupPromise = doSetup(Ctor);
    }
    const mySetup = setupPromise;
    try {
      await mySetup;
    } catch (err) {
      if (setupPromise === mySetup) setupPromise = null;
      throw err;
    }
    if (setupPromise === mySetup) setupPromise = null;
  }

  listeners.add(onBlock);

  let stopped = false;
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      listeners.delete(onBlock);
      if (listeners.size === 0) teardown();
    },
    sampleRate(): number {
      return ctx?.sampleRate ?? 0;
    },
  };
}

/**
 * Build the AudioContext + MediaStream + ScriptProcessorNode graph
 * and wire it into the module-level singleton state. The caller is
 * responsible for the concurrency guard in subscribeTuner.
 *
 * Diagnostic paths still funnel through `rejectWith` so the failure
 * surface (TunerError.kind, getTunerState) is identical to the
 * pre-fix behavior.
 */
async function doSetup(Ctor: typeof AudioContext): Promise<void> {
  let acquiredCtx: AudioContext;
  try {
    acquiredCtx = new Ctor();
  } catch {
    rejectWith("unsupported");
  }
  try {
    if (acquiredCtx.state === "suspended") {
      await acquiredCtx.resume();
    }
  } catch {
    void acquiredCtx.close();
    rejectWith("suspended");
  }
  if (acquiredCtx.state === "suspended") {
    // resume() resolved but the browser refused to leave the
    // suspended state (autoplay policy still blocking, etc.).
    void acquiredCtx.close();
    rejectWith("suspended");
  }

  let acquiredStream: MediaStream;
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    void acquiredCtx.close();
    if (isNotAllowed(err)) rejectWith("denied");
    if (isNotFound(err)) rejectWith("no-mic");
    // Unknown getUserMedia failure - map to denied since the
    // user can't act on a generic failure anyway.
    rejectWith("denied");
  }

  let acquiredProcessor: ScriptProcessorNode;
  let acquiredSource: MediaStreamAudioSourceNode;
  let acquiredSink: GainNode;
  try {
    acquiredSource = acquiredCtx.createMediaStreamSource(acquiredStream);
    acquiredProcessor = acquiredCtx.createScriptProcessor(
      BLOCK_SIZE,
      1,
      1,
    );
    acquiredSource.connect(acquiredProcessor);
    acquiredSink = acquiredCtx.createGain();
    acquiredSink.gain.value = 0;
    acquiredProcessor.connect(acquiredSink);
    acquiredSink.connect(acquiredCtx.destination);
  } catch {
    acquiredStream.getTracks().forEach((t) => t.stop());
    void acquiredCtx.close();
    rejectWith("unsupported");
  }

  ctx = acquiredCtx;
  stream = acquiredStream;
  processor = acquiredProcessor;
  sourceNode = acquiredSource;
  sinkNode = acquiredSink;

  const buf = new Float32Array(BLOCK_SIZE);
  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    for (let i = 0; i < BLOCK_SIZE; i++) buf[i] = input[i];
    for (const listener of listeners) listener(buf);
  };
  clearError();
}

function teardown(): void {
  if (processor) {
    try {
      processor.disconnect();
    } catch {
      // node already disconnected; ignore
    }
    processor.onaudioprocess = null;
  }
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {
      // ignore
    }
  }
  if (sinkNode) {
    try {
      sinkNode.disconnect();
    } catch {
      // ignore
    }
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ctx) void ctx.close();
  processor = null;
  sourceNode = null;
  sinkNode = null;
  stream = null;
  ctx = null;
  // Once we've torn down, the prior error (if any) is no longer the
  // current state. The user explicitly closed the tuner.
  lastErrorKind = null;
}

export function getTunerState(): TunerState {
  if (ctx && stream && processor && listeners.size > 0) {
    return { status: "running", message: "" };
  }
  if (lastErrorKind) {
    return { status: lastErrorKind, message: MESSAGES[lastErrorKind] };
  }
  return { status: "idle", message: "" };
}

/**
 * Test seam: drop the singleton's module-level state so the next
 * test can install fresh window stubs without leaking. Not used in
 * production; never call from app code.
 */
export function __resetTunerForTests(): void {
  teardown();
  listeners.clear();
  lastErrorKind = null;
  setupPromise = null;
}