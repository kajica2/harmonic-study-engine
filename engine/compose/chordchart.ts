/**
 * engine/compose/chordchart.ts - PRD-001 Phase 4 Slice 4 (D83).
 *
 * The chord-chart PASTE parser (REQ-IO-10..13/15/16): plain text ->
 * ChordChart {directives, grid, bars, warnings}. PURE: no clock, no
 * randomness, no console, relative imports only. The output grid is
 * THE ChordGrid shape (Phase 5's Explore->Compose handoff seam - no
 * adapter) and flows UNCHANGED into generateAccompaniment (REQ-IO-16:
 * the grid is the grid).
 *
 * FILE-LOCATION DEVIATION (flagged in D83): the parent sketch named
 * engine/io/chordchart.ts; S4 ships it in engine/compose/ instead -
 * the parser is compose-domain (produces ChordGrid, consumes
 * chordsym) and a one-file io/ dir contradicts D75's flat-compose-
 * family convention (S3's assemble->accompany precedent).
 *
 * GRAMMAR (exact, testable - D83):
 *  1. Directive lines `^\{(\w+)\s*:\s*([^}]+)\}$` (case-insensitive
 *     name): {key:} via parseKey (major/minor only), {tempo:} finite
 *     number in [20,300], {time:} `num/den` (den power of 2 in
 *     {1,2,4,8,16,32}, num 1..16), {style:} shippedStyleIds()
 *     membership. Unknown name -> warning; bad value -> warning +
 *     that directive null.
 *  2. Body: `|` characters are STRIPPED (REQ-IO-13), then whitespace
 *     split. EACH TOKEN = ONE BAR (REQ-IO-11). Cap 512 bars.
 *  3. `%` repeats the PREVIOUS bar's cells verbatim (REQ-IO-12); a
 *     leading `%` is a rest bar + warning.
 *  4. Rest tokens `-`, `0`, `r` (case-insensitive) -> restCell().
 *  5. SLASH RULE (the deterministic whole-token-first resolution of
 *     the REQ-IO-11 bar-split vs slash-bass ambiguity, RK-S4-4):
 *     parseChordSymbol on the WHOLE token first - if it parses
 *     ("C/E", "G7/B", "C/G" - chord-tone bass honored), ONE cell.
 *     Else split on "/" into EXACTLY two sides and parse each: both
 *     parse -> TWO cells ("C/Am"); one side fails -> the parsing side
 *     still lands + a warning for the failing side; neither parses
 *     (or 3+ sides) -> non-chord token. NOTE: the design doc's
 *     "Em7/A" example is a doc erratum - A is NOT an Em7 chord tone,
 *     so the D61 grammar (inherited for free per D83) rejects it
 *     whole and the split rule lands TWO cells. The RULE is
 *     authoritative; the example is not.
 *  6. Non-chord token -> restCell() + warning `bar N: '<tok>' is not
 *     a chord symbol` (REQ-IO-15: warnings are NEVER fatal; the only
 *     error arms are the 512 cap and a chart with NO sounding cells
 *     -> "no chord symbols found").
 *  7. Non-ASCII tokens are rejected with a warning (the repo is
 *     ASCII; the warning copy never echoes the bad bytes).
 */

import { parseKey, spellTonic } from "../core/spelling";
import type { Annotation } from "../pedagogy/types";
import { shippedStyleIds } from "../styles/index";
import type { StyleId } from "../styles/types";
import { buildCellFromSymbol, parseChordSymbol } from "./chordsym";
import { ticksToSeconds } from "./tempo";
import { restCell } from "./types";
import type {
  BarRegions,
  ChordCell,
  ChordGrid,
  ComposeAnalysis,
  KeyCandidate,
  NormalizedProject,
  Outcome,
} from "./types";
import type { Versioned } from "../core/versioned";

/** D53: the synthetic chart project is ppq 480 - the same code path
 *  as a parsed MIDI file (export/mixer/WAV never special-case charts). */
export const CHART_PPQ = 480;
/** D83 rule 2: hard bar cap. */
export const CHART_MAX_BARS = 512;

export interface ChartDirectives {
  readonly key: KeyCandidate | null;
  readonly tempoBpm: number | null;
  /** [numerator, denominator] - REAL denominator (not the SMF code). */
  readonly timeSignature: readonly [number, number] | null;
  readonly styleId: StyleId | null;
}

export interface ChordChart extends Versioned {
  // version: 1
  readonly directives: ChartDirectives;
  /** THE Phase 5 seam - same shape, always. */
  readonly grid: ChordGrid;
  readonly bars: number;
  /** REQ-IO-15: non-fatal, one per bad token/directive. */
  readonly warnings: readonly string[];
}

const DIRECTIVE_RE = /^\{(\w+)\s*:\s*([^}]+)\}$/;
// LOW-002 (S4 fix round): the denominator needs TWO digits - 16/32
// are in VALID_DENOMS but the old `(\d)` could never match them.
const TIME_RE = /^(\d{1,2})\/(\d{1,2})$/;
const REST_TOKENS: readonly string[] = ["-", "0", "r"];
const VALID_DENOMS: readonly number[] = [1, 2, 4, 8, 16, 32];

function fail(message: string): Outcome<ChordChart> {
  return { ok: false, error: { code: "unsupported", message } };
}

function parseKeyDirective(value: string): KeyCandidate | null {
  const pk = parseKey(value);
  if (pk === null || (pk.mode !== "major" && pk.mode !== "minor")) return null;
  // A user-stated key is CERTAIN (correlation 1) - it is a directive,
  // not an inference.
  return { tonicPc: pk.tonicPc, mode: pk.mode, correlation: 1 };
}

function parseTempoDirective(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 20 || n > 300) return null;
  return n;
}

function parseTimeDirective(value: string): readonly [number, number] | null {
  const m = TIME_RE.exec(value);
  if (m === null) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (num < 1 || num > 16 || !VALID_DENOMS.includes(den)) return null;
  return [num, den] as const;
}

function parseStyleDirective(value: string): StyleId | null {
  const ids: readonly string[] = shippedStyleIds();
  return ids.includes(value) ? (value as StyleId) : null;
}

function isAscii(s: string): boolean {
  return !/[^\x20-\x7e]/.test(s);
}

/** One body token -> the cells of ONE bar (D83 rules 3-6). Returns
 *  the cells plus any per-token warnings. `prev` is the previous bar's
 *  cells (for `%` repeat); null when there is none. */
function parseBarToken(
  token: string,
  barNum: number, // 1-based, human-facing warning copy
  key: KeyCandidate,
  prev: readonly ChordCell[] | null,
): { cells: readonly ChordCell[]; warnings: readonly string[] } {
  const warnings: string[] = [];
  if (!isAscii(token)) {
    return { cells: [restCell()], warnings: [`bar ${barNum}: non-ASCII token rejected`] };
  }
  if (token === "%") {
    if (prev === null) {
      return {
        cells: [restCell()],
        warnings: [`bar ${barNum}: '%' repeat has no previous bar - rest used`],
      };
    }
    return { cells: prev.map((c) => ({ ...c })), warnings };
  }
  if (REST_TOKENS.includes(token.toLowerCase())) {
    return { cells: [restCell()], warnings };
  }
  // SLASH RULE: whole-token parse wins (chord-tone bass honored).
  const whole = parseChordSymbol(token);
  if (whole !== null) {
    return { cells: [buildCellFromSymbol(whole, key)], warnings };
  }
  const sides = token.split("/");
  if (sides.length === 2) {
    const a = parseChordSymbol(sides[0]);
    const b = parseChordSymbol(sides[1]);
    if (a !== null && b !== null) {
      // TWO cells in the bar (e.g. "C/Am") - variable-length bars are
      // legal (D60/TD-043); slotsPerBar is fixed grid-wide in the
      // caller.
      return { cells: [buildCellFromSymbol(a, key), buildCellFromSymbol(b, key)], warnings };
    }
    if (a !== null || b !== null) {
      // Best-effort, non-fatal: the parsing side still lands.
      const good = a ?? b;
      if (good !== null) {
        const badSide = good === a ? sides[1] : sides[0];
        warnings.push(`bar ${barNum}: '${badSide}' is not a chord symbol`);
        return { cells: [buildCellFromSymbol(good, key)], warnings };
      }
    }
  }
  // Non-chord token -> rest + warning (REQ-IO-15: NEVER an error arm).
  return { cells: [restCell()], warnings: [`bar ${barNum}: '${token}' is not a chord symbol`] };
}

/**
 * Parse chart TEXT into a ChordChart. The grid's bar timing uses the
 * {time:} directive (default 4/4) at CHART_PPQ - the synthetic project
 * in buildChartSession carries the SAME meter, so downstream
 * barBoundaries math agrees by construction.
 */
export function parseChordChart(text: string): Outcome<ChordChart> {
  if (typeof text !== "string") {
    return fail("no chord symbols found");
  }
  const warnings: string[] = [];
  const bodyLines: string[] = [];
  const directives: {
    key: KeyCandidate | null;
    tempoBpm: number | null;
    timeSignature: readonly [number, number] | null;
    styleId: StyleId | null;
  } = { key: null, tempoBpm: null, timeSignature: null, styleId: null };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    const m = DIRECTIVE_RE.exec(line);
    if (m === null) {
      bodyLines.push(line);
      continue;
    }
    const name = m[1].toLowerCase();
    const value = m[2].trim();
    if (name === "key") {
      const k = parseKeyDirective(value);
      if (k === null) warnings.push(`directive {key:} '${value}' is not a major/minor key - ignored`);
      else directives.key = k;
    } else if (name === "tempo") {
      const t = parseTempoDirective(value);
      if (t === null) warnings.push(`directive {tempo:} '${value}' is not a tempo in 20..300 - ignored`);
      else directives.tempoBpm = t;
    } else if (name === "time") {
      const ts = parseTimeDirective(value);
      if (ts === null) warnings.push(`directive {time:} '${value}' is not a meter like 4/4 - ignored`);
      else directives.timeSignature = ts;
    } else if (name === "style") {
      const s = parseStyleDirective(value);
      if (s === null) warnings.push(`directive {style:} '${value}' is not a shipped style - ignored`);
      else directives.styleId = s;
    } else {
      warnings.push(`unknown directive '{${name}:}' ignored`);
    }
  }

  // REQ-IO-13: strip `|` characters, then whitespace split (rule 2).
  const tokens = bodyLines
    .join(" ")
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter((t) => t !== "");

  if (tokens.length === 0) {
    return fail("no chord symbols found");
  }
  if (tokens.length > CHART_MAX_BARS) {
    return fail(`chart too long (${tokens.length} bars; limit is ${CHART_MAX_BARS})`);
  }

  const spellingKey: KeyCandidate = directives.key ?? {
    tonicPc: 0,
    mode: "major",
    correlation: 1,
  };
  const bars: BarRegions[] = [];
  const [num, den] = directives.timeSignature ?? [4, 4];
  const ticksPerBar = Math.max(1, Math.round((num * CHART_PPQ * 4) / den));
  let anySplit = false;
  let prev: readonly ChordCell[] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const parsed = parseBarToken(tokens[i], i + 1, spellingKey, prev);
    warnings.push(...parsed.warnings);
    if (parsed.cells.length === 2) anySplit = true;
    bars.push({
      bar: i,
      startTick: i * ticksPerBar,
      endTick: (i + 1) * ticksPerBar,
      slots: parsed.cells,
    });
    prev = parsed.cells;
  }

  const grid: ChordGrid = { slotsPerBar: anySplit ? 2 : 1, bars };
  const anySounding = bars.some((b) => b.slots.some((c) => !c.isRest));
  if (!anySounding) {
    return fail("no chord symbols found");
  }

  return {
    ok: true,
    value: {
      version: 1,
      directives: {
        key: directives.key,
        tempoBpm: directives.tempoBpm,
        timeSignature: directives.timeSignature,
        styleId: directives.styleId,
      },
      grid,
      bars: bars.length,
      warnings,
    },
  };
}

/** Session builder (D83): the chart becomes a REAL NormalizedProject +
 *  ComposeAnalysis LITERALLY (bypassing normalize+analyze, which fail
 *  on zero-note input - the noNotes landmine in the re-audit). The
 *  accompaniment pipeline, mixer, exports and URL never special-case
 *  charts: a synthetic project IS a project. */
export function buildChartSession(
  chart: ChordChart,
  fileName = "chart.mid",
): {
  readonly project: NormalizedProject;
  readonly analysis: ComposeAnalysis;
} {
  const [num, den] = chart.directives.timeSignature ?? [4, 4];
  const ticksPerBar = Math.max(1, Math.round((num * CHART_PPQ * 4) / den));
  const endTick = chart.bars * ticksPerBar;
  const bpm = chart.directives.tempoBpm ?? 120;
  const keyDirective = chart.directives.key;
  const keySignatures =
    keyDirective === null
      ? []
      : [{ tick: 0, tonicPc: keyDirective.tonicPc, mode: keyDirective.mode }];

  const base: NormalizedProject = {
    version: 1,
    format: 1,
    ppq: CHART_PPQ,
    name: "Chord chart",
    fileName,
    tempos: [{ tick: 0, bpm }],
    timeSignatures: [{ tick: 0, numerator: num, denominator: den }],
    keySignatures,
    tracks: [], // D78: no original group - the mixer row is honest-disabled
    endTick,
    durationSec: 0,
    warnings: [],
  };
  const project: NormalizedProject = {
    ...base,
    durationSec: ticksToSeconds(base, endTick),
  };

  const keyResult =
    keyDirective === null
      ? { candidates: [], declared: null, chromaticFallback: true }
      : { candidates: [keyDirective], declared: null, chromaticFallback: false };

  const keyText =
    keyDirective === null
      ? ""
      : ` in ${spellTonic(keyDirective.tonicPc, keyDirective.mode, "")} ${keyDirective.mode}`;
  const annotations: readonly Annotation[] = [
    {
      version: 1,
      id: "ann-chart-0",
      target: { kind: "progression", fromBar: 0, toBar: Math.max(0, chart.bars - 1) },
      label: "Chart",
      text: `Pasted chart: ${chart.bars} bars${keyText}.`,
      conceptId: null,
      confidence: null,
    },
  ];

  const analysis: ComposeAnalysis = {
    version: 1,
    roles: [],
    key: keyResult,
    melody: { sourceTrackIndex: null, synthesized: true, notes: [] },
    grid: chart.grid,
    window: { fromTick: 0, toTick: endTick },
    truncated: false,
    percussionOnly: false,
    annotations,
  };
  return { project, analysis };
}
