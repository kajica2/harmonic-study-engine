/**
 * src/lib/tapTempo.ts — pure tap-tempo math.
 *
 * Given a list of tap timestamps (ms) and a "now" reference, decide
 * whether to estimate a bpm and which bpm.
 *
 * Extracted from App.tsx so the rolling-tap logic is testable without
 * the React tree. The handler in App.tsx still owns the rolling
 * history (it persists across renders); this module is the pure
 * decision layer.
 *
 * Algorithm:
 *   - If the most recent tap was more than `RESET_GAP_MS` ago, the
 *     caller should reset the history to `[now]`. We return null
 *     and a `reset: true` signal so the caller knows to clear.
 *   - Otherwise we need ≥ `MIN_TAPS` taps in the history. If not
 *     enough, return null (caller keeps accumulating).
 *   - With enough taps, take the last 4, average the intervals,
 *     compute bpm = 60000 / avgIntervalMs, clamp to [30, 240].
 */

const RESET_GAP_MS = 2000;
const MIN_TAPS = 3;
const WINDOW = 4;
const MIN_BPM = 30;
const MAX_BPM = 240;

export interface TapTempoResult {
  /** The computed bpm, or null if there isn't enough data yet. */
  bpm: number | null;
  /** True if the caller should reset its rolling history to [now]. */
  reset: boolean;
}

export function computeTapTempo(
  taps: ReadonlyArray<number>,
  now: number,
): TapTempoResult {
  if (taps.length === 0) {
    return { bpm: null, reset: false };
  }
  const last = taps[taps.length - 1];
  if (now - last > RESET_GAP_MS) {
    return { bpm: null, reset: true };
  }
  if (taps.length < MIN_TAPS) {
    return { bpm: null, reset: false };
  }
  const recent = taps.slice(-WINDOW);
  const intervals = recent.slice(1).map((t, i) => t - recent[i]);
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avgMs <= 0) {
    return { bpm: null, reset: false };
  }
  const raw = Math.round(60000 / avgMs);
  const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, raw));
  return { bpm: clamped, reset: false };
}
