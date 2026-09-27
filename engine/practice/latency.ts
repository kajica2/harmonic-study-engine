/**
 * engine/practice/latency.ts - PRD-001 Phase 7 S3 (D134): the pure
 * calibration math. Arrays in, number out - timestamps are INPUTS,
 * the engine never reads a clock (purity law).
 *
 * The canonical compensation equation (D134.5, pinned as a worked
 * derivation in latency.test.ts AND detect.test.ts):
 *
 *   a perfect tap arrives at  E + output + midiPath + bias
 *   (E = click emission wall time). The wizard stores
 *       input = median(rawOffsets) - output = midiPath + bias
 *   so
 *       compensated = tap - input - output = E  ->  EXACTLY zero
 *       residual for a perfect tap.
 *
 * REQ-PRAC-42's literal "subtract inputLatencyMs from ALL timing
 * comparisons" holds (it always is); subtracting the STORED
 * outputLatencyMs too is the point of storing it (REQ-PRAC-41). The
 * matcher sees ONE number: latencyCompensationMs = input + output,
 * summed by compensationOf() in src/lib/practiceLatency.ts (the
 * single-sum law, pinned there).
 *
 * Laws (pinned in latency.test.ts):
 *   1 MEDIAN rejects outliers (tight cluster + wild tap ignored);
 *     even-count median = mean of the middle two.
 *   2 HONESTY: fewer than MIN_TAP_PAIRS valid pairs -> null, NEVER 0
 *     (a silent zero would fake a calibrated 0 ms).
 *   3 CLAMP: input = clamp(median - output, 0, OUTPUT_LATENCY_MAX).
 *   4 COMPOSE: compensation = clamp(input + output, 0, 800).
 *   5 GARBAGE: NaN/Infinity entries are dropped; all-garbage -> null;
 *     clamp inputs -> 0-safe.
 */

/** Clamp ceiling for a stored latency number (ms). */
export const OUTPUT_LATENCY_MAX = 500;
/** Minimum valid click/tap pairs for an honest median. */
export const MIN_TAP_PAIRS = 8;
/** Compensation composition ceiling (input + output, D134). */
const COMPENSATION_MAX = 800;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Median of a SORTED-COPY numeric array (empty -> null). */
function medianSorted(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median of per-pair raw offsets (tap_i - click_i). Pairing happens
 * UPSTREAM (the wizard owns the +/- half-beat window law - it knows
 * the beat period; this module knows only arrays). Entries where
 * either side is non-finite are dropped; fewer than MIN_TAP_PAIRS
 * valid pairs -> null (law 2, NEVER 0).
 */
export function medianOffset(
  clicksMs: readonly number[],
  tapsMs: readonly number[],
): number | null {
  const n = Math.min(clicksMs.length, tapsMs.length);
  const offsets: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = clicksMs[i];
    const t = tapsMs[i];
    if (isFiniteNumber(c) && isFiniteNumber(t)) offsets.push(t - c);
  }
  if (offsets.length < MIN_TAP_PAIRS) return null;
  return medianSorted(offsets);
}

/**
 * inputLatencyMs = clamp(median(rawOffsets) - outputLatencyMs,
 * 0, OUTPUT_LATENCY_MAX). Garbage in -> 0 (the clamp floor).
 */
export function clampInputLatency(
  rawMedianMs: number,
  outputLatencyMs: number,
): number {
  const m = isFiniteNumber(rawMedianMs) ? rawMedianMs : 0;
  const o = isFiniteNumber(outputLatencyMs) ? outputLatencyMs : 0;
  const v = m - o;
  if (v < 0) return 0;
  if (v > OUTPUT_LATENCY_MAX) return OUTPUT_LATENCY_MAX;
  return v;
}

/**
 * The D134 sum the matcher consumes: clamp(input + output, 0, 800).
 * (The single place the SUM is formed is compensationOf() in the
 * adapter - this is the math it delegates to.)
 */
export function compensationMs(
  inputLatencyMs: number,
  outputLatencyMs: number,
): number {
  const i = isFiniteNumber(inputLatencyMs) ? inputLatencyMs : 0;
  const o = isFiniteNumber(outputLatencyMs) ? outputLatencyMs : 0;
  const v = i + o;
  if (v < 0) return 0;
  if (v > COMPENSATION_MAX) return COMPENSATION_MAX;
  return v;
}
