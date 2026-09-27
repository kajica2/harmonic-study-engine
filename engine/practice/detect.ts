/**
 * engine/practice/detect.ts - PRD-001 Phase 7 S3 (D129/D130): the pure
 * played-correctly matcher. ZERO imports (purity law 8): plain
 * structural types; timestamps are INPUTS, the engine never reads a
 * clock. The expected grid is BUILT in src/lib/practiceExpected.ts
 * (HarmonicPath lives in src - engine cannot import it) and consumed
 * here as plain data.
 *
 * The model (docs/PHASE-7-S3-DETECTION.md section 3.1):
 *   matchPhrase({ expected, boundariesMs, performed, toleranceMs,
 *                 latencyCompensationMs }) -> PhraseMatch
 *
 * Laws (each pinned in detect.test.ts):
 *   1 PC EQUALITY   octave-agnostic ((n % 12) + 12) % 12 (the shipped
 *      convention); negative/NaN/garbage notes are UNSCORED.
 *   2 WINDOW        match iff compensated onset in [start - tol,
 *      start + tol] (inclusive: +/- 1 ms either side flips inclusion);
 *      greedy NEAREST per expected pc, ties -> earlier note; a note
 *      can match at most one pc (automatic: a pc equals one expected
 *      member).
 *   3 BUCKET TOTAL  every performed note inside the phrase lands in
 *      exactly ONE bucket (matched | wrong | extra | rest-extra) and
 *      every expected pc lands in matched or missed. Free bars -> no
 *      buckets. Conservation asserted by the property sweep.
 *   4 LATENCY       compensated = atMs - latencyCompensationMs BEFORE
 *      any comparison (REQ-PRAC-42 literal); the borderline-flip pin.
 *   5 EMPTY GUARDS  expectedTotal 0 -> matchedFraction 0 (NEVER NaN);
 *      empty performed -> all missed, avgOffset null; zero-length
 *      arrays everywhere -> total zero result, no throw.
 *   6 AGGREGATES    wrongNotes/missedNotes/extraNotes are PITCH-CLASS
 *      arrays (sorted, de-duped); per-bar detail keeps counts;
 *      accuracyPct denominator includes restExtras.
 *   7 NO-OVERLAP    tol floor 60; at tol <= 300 and boundaries >=
 *      1000 ms apart (240 BPM 4/4 floor) a note is assigned to at
 *      most one bar. Pathological configs (boundaries closer than
 *      2*tol): assignBar picks the NEAREST boundary; TIE -> EARLIER
 *      boundary (documented tie-break).
 *   8 PURE          no clock/rng/Date/console; same inputs ->
 *      deep-equal outputs (idempotence pin).
 *   9 BOUNDARY MISMATCH   expected.length !== boundariesMs.length ->
 *      match over the SHARED PREFIX, remainder unscored (never crash
 *      - hydrate-guard philosophy).
 */

export type ExpectedKind = "target" | "free" | "rest";

export interface ExpectedBar {
  /** Form-bar index (0-based, 1 step = 1 bar truth). */
  bar: number;
  kind: ExpectedKind;
  /** Pitch classes (0..11) expected at the bar start; empty for
   *  "free"/"rest". Multiplicity 1 (a SET). */
  pcs: readonly number[];
}

export interface PerformedNote {
  /** MIDI note number (pc = ((n % 12) + 12) % 12). */
  note: number;
  /** Event timestamp, performance.now domain (midiIn msg.timeStamp). */
  atMs: number;
}

export interface BarMatch {
  bar: number;
  kind: ExpectedKind;
  /** barStart WALL ms (the D129 boundary anchor). */
  startMs: number;
  matched: number;
  matchedPcs: readonly number[];
  missedPcs: readonly number[];
  wrongPcs: readonly number[]; // pitch errors (target bars)
  extraPcs: readonly number[]; // overflow + late/early right-note
  /** NOTE counts (law 3 conservation): the pc arrays above are the
   *  PRD buckets (sorted, de-duped, law 6); these are the raw counts
   *  so matched + wrongCount + extraCount + restExtras equals the
   *  notes assigned to this bar EXACTLY. Additive beyond the sketch
   *  for the conservation pin (docs section 3.1 law 3). */
  wrongCount: number;
  extraCount: number;
  restExtras: number; // notes played during this rest
  /** Signed mean over matched pairs (compensated - startMs). */
  avgOffsetMs: number | null;
}

export interface PhraseMatch {
  bars: readonly BarMatch[];
  matched: number;
  expectedTotal: number; // target bars' pc count
  matchedFraction: number; // 0 when expectedTotal 0 (NEVER NaN)
  accuracyPct: number; // matched/(matched+missed+wrong+extra+restExtras)
  wrongNotes: readonly number[]; // aggregated pcs, sorted, de-duped
  missedNotes: readonly number[];
  extraNotes: readonly number[];
  /** NOTE-count totals (law 3 conservation, additive beyond the
   *  sketch): matched + wrongCount + extraCount + restCount ===
   *  assignedNotes (notes assigned to SCORED bars; free bars and
   *  outside-phrase notes are unscored by law). */
  wrongCount: number;
  extraCount: number;
  restCount: number;
  assignedNotes: number;
  avgOffsetMs: number | null; // signed, over all matched pairs
  avgAbsOffsetMs: number | null;
}

export interface MatchInput {
  expected: readonly ExpectedBar[]; // the pass's bars, ascending bar
  /** Boundary wall-ms per expected bar: SAME ORDER as expected. */
  boundariesMs: readonly number[];
  performed: readonly PerformedNote[]; // the pass's buffered notes
  toleranceMs: number; // engine floor 60
  latencyCompensationMs: number; // D134 equation (input + output)
}

/** Engine tolerance floor (D129): garbage/short values clamp UP. */
const TOLERANCE_FLOOR_MS = 60;

function pcOf(note: number): number {
  return ((note % 12) + 12) % 12;
}

/** Law 1: an integer MIDI note 0..127 with a finite timestamp. */
function isValidNote(n: PerformedNote): boolean {
  return (
    Number.isInteger(n.note) &&
    n.note >= 0 &&
    n.note <= 127 &&
    Number.isFinite(n.atMs)
  );
}

function sortedUniqPcs(pcs: readonly number[]): number[] {
  return [...new Set(pcs)].sort((a, b) => a - b);
}

/**
 * The ONE bar-assignment law (pinned separately). Returns the bar
 * index (into the SHARED-PREFIX boundaries) whose boundary is NEAREST
 * to the compensated time, plus whether the note is inside that
 * bar's +/- tolerance window. null = outside the phrase entirely:
 * before (first boundary - tol), or more than one mean bar-gap past
 * (last boundary + tol) (late-tail cutoff; a single-boundary phrase
 * has no tail cutoff - the hook's per-bar drain relies on total
 * attribution). Pathological overlapping windows (boundaries closer
 * than 2*tol): nearest boundary wins, TIE -> EARLIER boundary.
 */
export function assignBar(
  compensatedAtMs: number,
  boundariesMs: readonly number[],
  toleranceMs: number,
): { bar: number; inWindow: boolean } | null {
  const n = boundariesMs.length;
  if (n === 0 || !Number.isFinite(compensatedAtMs)) return null;
  const tol = Math.max(TOLERANCE_FLOOR_MS, boundariesTol(toleranceMs));
  const first = boundariesMs[0];
  const last = boundariesMs[n - 1];
  if (Number.isFinite(first) && compensatedAtMs < first - tol) return null;
  if (n >= 2 && Number.isFinite(first) && Number.isFinite(last) && last > first) {
    const meanGap = (last - first) / (n - 1);
    if (compensatedAtMs > last + tol + meanGap) return null;
  }
  let best = 0;
  let bestDist = Math.abs(compensatedAtMs - (boundariesMs[0] ?? 0));
  for (let i = 1; i < n; i++) {
    const d = Math.abs(compensatedAtMs - (boundariesMs[i] ?? 0));
    // STRICT < keeps the EARLIER boundary on a tie (law 7 pin).
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return { bar: best, inWindow: bestDist <= tol };
}

function boundariesTol(toleranceMs: number): number {
  return Number.isFinite(toleranceMs) ? toleranceMs : TOLERANCE_FLOOR_MS;
}

/**
 * The pure phrase verdict. Deterministic + total (laws 3/5/9): every
 * input shape yields a well-formed PhraseMatch.
 */
export function matchPhrase(input: MatchInput): PhraseMatch {
  const tol = Math.max(TOLERANCE_FLOOR_MS, boundariesTol(input.toleranceMs));
  const comp = Number.isFinite(input.latencyCompensationMs)
    ? input.latencyCompensationMs
    : 0;

  // Law 9: shared prefix only; the remainder is unscored.
  const n = Math.min(input.expected.length, input.boundariesMs.length);

  // Per-bar working state.
  const expectedSets: (Set<number> | null)[] = [];
  const matchedPcsPerBar: Set<number>[] = [];
  const wrongPerBar: number[] = [];
  const extraPerBar: number[] = [];
  const restPerBar: number[] = [];
  const offsetsPerBar: number[][] = [];
  for (let i = 0; i < n; i++) {
    const e = input.expected[i];
    expectedSets.push(e.kind === "target" ? new Set(sortedUniqPcs(e.pcs)) : null);
    matchedPcsPerBar.push(new Set());
    wrongPerBar.push(0);
    extraPerBar.push(0);
    restPerBar.push(0);
    offsetsPerBar.push([]);
  }

  // Pass 1: assign every valid note to (bar, windowed?) and collect
  // windowed match candidates per (bar, pc). Law 4: compensation is
  // applied BEFORE any comparison.
  type Candidate = { order: number; atMs: number; offset: number };
  const candidates = new Map<number, Map<number, Candidate[]>>();
  const assigned: {
    bar: number;
    inWindow: boolean;
    pc: number;
    order: number;
    atMs: number;
    offset: number;
  }[] = [];

  for (let k = 0; k < input.performed.length; k++) {
    const p = input.performed[k];
    if (!isValidNote(p)) continue; // law 1: unscored garbage
    const compensated = p.atMs - comp;
    const a = assignBar(compensated, input.boundariesMs.slice(0, n), tol);
    if (a === null) continue; // outside the phrase
    const e = input.expected[a.bar];
    if (e.kind === "free") continue; // law 3: free bars -> no buckets
    const pc = pcOf(p.note);
    const offset = compensated - (input.boundariesMs[a.bar] ?? 0);
    assigned.push({ bar: a.bar, inWindow: a.inWindow, pc, order: k, atMs: p.atMs, offset });
    if (e.kind === "target" && a.inWindow && expectedSets[a.bar]?.has(pc)) {
      let perBar = candidates.get(a.bar);
      if (!perBar) {
        perBar = new Map();
        candidates.set(a.bar, perBar);
      }
      let perPc = perBar.get(pc);
      if (!perPc) {
        perPc = [];
        perBar.set(pc, perPc);
      }
      perPc.push({ order: k, atMs: p.atMs, offset });
    }
  }

  // Pass 2: greedy NEAREST per (bar, pc); ties -> earlier note
  // (smaller atMs, then input order). Law 2.
  const winnerSets: Set<number>[] = [];
  for (let i = 0; i < n; i++) winnerSets.push(new Set());
  for (const [barIdx, perBar] of candidates) {
    for (const [, list] of perBar) {
      let best: Candidate | null = null;
      for (const c of list) {
        if (
          best === null ||
          Math.abs(c.offset) < Math.abs(best.offset) ||
          (Math.abs(c.offset) === Math.abs(best.offset) &&
            (c.atMs < best.atMs || (c.atMs === best.atMs && c.order < best.order)))
        ) {
          best = c;
        }
      }
      if (best !== null) winnerSets[barIdx].add(best.order);
    }
  }

  // Pass 3: bucket every assigned note exactly once (law 3 totality).
  let matchedCount = 0;
  let missedCount = 0;
  let wrongCount = 0;
  let extraCount = 0;
  let restCount = 0;
  const wrongPcsPerBar: number[][] = [];
  const extraPcsPerBar: number[][] = [];
  for (let i = 0; i < n; i++) {
    wrongPcsPerBar.push([]);
    extraPcsPerBar.push([]);
  }
  for (const a of assigned) {
    const e = input.expected[a.bar];
    if (e.kind === "rest") {
      restPerBar[a.bar] += 1; // discipline error
      restCount += 1;
      continue;
    }
    const set = expectedSets[a.bar];
    const isExpected = set !== null && set.has(a.pc);
    if (a.inWindow && isExpected && winnerSets[a.bar].has(a.order)) {
      matchedPcsPerBar[a.bar].add(a.pc);
      offsetsPerBar[a.bar].push(a.offset);
      matchedCount += 1;
    } else if (!isExpected) {
      wrongPerBar[a.bar] += 1; // pitch error (target bar, any window)
      wrongPcsPerBar[a.bar].push(a.pc);
      wrongCount += 1;
    } else {
      // Expected pc but already matched (overflow), or right note
      // OUTSIDE the timing window (timing error).
      extraPerBar[a.bar] += 1;
      extraPcsPerBar[a.bar].push(a.pc);
      extraCount += 1;
    }
  }

  // Per-bar results.
  const bars: BarMatch[] = [];
  let expectedTotal = 0;
  const allOffsets: number[] = [];
  const wrongAgg: number[] = [];
  const missedAgg: number[] = [];
  const extraAgg: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = input.expected[i];
    const set = expectedSets[i];
    const matchedArr = sortedUniqPcs([...matchedPcsPerBar[i]]);
    const missedArr =
      set !== null ? sortedUniqPcs([...set].filter((pc) => !matchedPcsPerBar[i].has(pc))) : [];
    if (e.kind === "target") {
      expectedTotal += set ? set.size : 0;
      missedCount += missedArr.length;
    }
    const offs = offsetsPerBar[i];
    allOffsets.push(...offs);
    wrongAgg.push(...wrongPcsPerBar[i]);
    missedAgg.push(...missedArr);
    extraAgg.push(...extraPcsPerBar[i]);
    bars.push({
      bar: e.bar,
      kind: e.kind,
      startMs: input.boundariesMs[i] ?? 0,
      matched: matchedArr.length,
      matchedPcs: matchedArr,
      missedPcs: missedArr,
      wrongPcs: sortedUniqPcs(wrongPcsPerBar[i]),
      extraPcs: sortedUniqPcs(extraPcsPerBar[i]),
      wrongCount: wrongPerBar[i],
      extraCount: extraPerBar[i],
      restExtras: restPerBar[i],
      avgOffsetMs: meanOrNull(offs),
    });
  }

  const denom = matchedCount + missedCount + wrongCount + extraCount + restCount;
  return {
    bars,
    matched: matchedCount,
    expectedTotal,
    matchedFraction: expectedTotal > 0 ? matchedCount / expectedTotal : 0, // law 5
    accuracyPct: denom > 0 ? (matchedCount / denom) * 100 : 0,
    wrongNotes: sortedUniqPcs(wrongAgg),
    missedNotes: sortedUniqPcs(missedAgg),
    extraNotes: sortedUniqPcs(extraAgg),
    wrongCount,
    extraCount,
    restCount,
    assignedNotes: assigned.length, // law 3 conservation total
    avgOffsetMs: meanOrNull(allOffsets),
    avgAbsOffsetMs: meanOrNull(allOffsets.map(Math.abs)),
  };
}

function meanOrNull(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}
