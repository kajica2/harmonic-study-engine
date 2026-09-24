/**
 * engine/compose/chordsym.ts - PRD-001 Phase 4 Slice 4 (D82): MOVED
 * VERBATIM from src/lib/chordInput.ts (Slice 2, D61). The move is
 * purity-forced: engine -> src imports are illegal, and the S4
 * chord-chart parser (engine/compose/chordchart.ts) must reuse THE
 * ONE grammar - two recognizers for one ChordCell contract is exactly
 * the drift the S2 header warns about. src/lib/chordInput.ts remains
 * as a re-export SHIM so every existing importer keeps compiling
 * untouched (ChordCellPopover + friends).
 *
 * The chord-symbol grammar: a PURE round-trip between a typed chord
 * symbol ("Cm7", "Ebmaj7", "G7/B") and the engine's
 * (rootPc, qualitySymbol, bassPc) cell coordinates.
 *
 * WHY THIS EXISTS (parent-sketch correction): src/lib/ireal.ts
 * parseChordToMidi is NOT usable as the popover validator - it is a
 * lossy one-way map to MIDI note numbers with its OWN quality grammar,
 * cannot round-trip to (rootPc, qualitySymbol) in the ENGINE grammar
 * (the 17 QUALITY_INTERVALS keys), and accepts symbols the ChordCell
 * cannot express. The hard rule here: REJECT anything the grid cannot
 * hold (e.g. "C13", "C7#9") - the popover must never accept a symbol
 * that would silently degrade into a different cell. The chart parser
 * inherits the reject semantics for FREE (REQ-IO-15's "non-chord
 * token" is D61's null).
 *
 * Suffix tokens are the reverse of NAME_SUFFIX (engine/core/chords,
 * single source of truth) plus the documented case-folded aliases
 * ("M7"->maj7, "-"->min, "o"->dim, "o7"->dim7; the slashed-circle
 * alias is written as a \u00f8 unicode ESCAPE so this file stays
 * ASCII; ""->maj, "m"->min).
 *
 * Purity: relative imports only, no DOM, no clock, no randomness, no
 * console. suggestChordSymbols takes recents as an ARGUMENT (the
 * recent-edit buffer lives in the surface, not here) so this module
 * stays pure.
 */

import {
  NAME_SUFFIX,
  QUALITY_INTERVALS,
  spellChordName,
} from "../core/chords";
import type { ChordCell, KeyCandidate } from "./types";

export interface ParsedSymbol {
  readonly rootPc: number;
  readonly qualitySymbol: string;
  /** Slash bass when present AND != root AND a chord tone; else null. */
  readonly bassPc: number | null;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Root tokens (includes the theoretical E#/B#/Cb/Fb spellings; cells
 *  store pitch classes, so display spelling is the KEY's job). */
const ROOT_PC: Readonly<Record<string, number>> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, "E#": 5, F: 5,
  Fb: 4, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10,
  B: 11, "B#": 0, Cb: 11,
};

/** Suffix token -> engine qualitySymbol. Reverse-mapped from
 *  NAME_SUFFIX (all 17 spellings) + the D61 alias set. Exact-match
 *  semantics: a suffix that merely ENDS WITH a known token but carries
 *  extra junk ("13" after a "3"? "#9" after "9"?) must not slip
 *  through - "C7#9" and "C13" are REJECTED (the grid cannot hold
 *  alterations). */
const SUFFIX_TO_QUALITY: Readonly<Record<string, string>> = buildSuffixTable();

function buildSuffixTable(): Record<string, string> {
  const table: Record<string, string> = {};
  // 17 canonical NAME_SUFFIX spellings ("maj" -> "" is the bare triad).
  for (const [quality, suffix] of Object.entries(NAME_SUFFIX)) {
    table[suffix] = quality;
  }
  // Documented aliases (case-folded where unambiguous - "M7" must NOT
  // fold to "m7", so these are EXPLICIT entries, not a lowercase pass).
  table.M7 = "maj7";
  table.Maj7 = "maj7";
  table.M9 = "maj9";
  table.Maj9 = "maj9";
  table.M6 = "maj6";
  table["-"] = "min";
  table.min = "min";
  table.o = "dim";
  table.o7 = "dim7";
  table["\u00f8"] = "halfdim"; // slashed circle (ASCII-escaped source)
  table["\u00f87"] = "halfdim";
  table.halfdim = "halfdim";
  table.alt = "alt";
  return table;
}

const ROOT_RE = /^([A-G][#b]?)/;
const FULL_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

/** Parse one chord symbol. Returns null for anything the grammar (or
 *  the ChordCell) cannot express - NEVER throws. */
export function parseChordSymbol(raw: string): ParsedSymbol | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;
  // Inner whitespace is a rejection ("C sus4"): the popover is a
  // single-token field, and silently eating spaces would let "C b5"
  // style junk through.
  if (/\s/.test(s)) return null;
  const m = FULL_RE.exec(s);
  if (m === null) return null;
  const rootPc = ROOT_PC[m[1]];
  if (rootPc === undefined) return null;
  const quality = SUFFIX_TO_QUALITY[m[2]];
  if (quality === undefined) return null;
  let bassPc: number | null = null;
  if (m[3] !== undefined) {
    const bass = ROOT_PC[m[3]];
    if (bass === undefined) return null;
    if (bass !== rootPc) {
      // A slash bass must be a CHORD TONE: harmony.ts only names
      // in-template slashes, so an out-of-template bass ("C/D") would
      // store a bassPc the cell's name cannot show - a lying cell.
      // Reject instead (the grid cannot hold it faithfully).
      const intervals = QUALITY_INTERVALS[quality] ?? [];
      const inTemplate = intervals.some((iv) => mod12(rootPc + iv) === bass);
      if (!inTemplate) return null;
      bassPc = bass;
    }
  }
  return { rootPc, qualitySymbol: quality, bassPc };
}

/** Build the ChordCell a parsed symbol denotes, spelled in the key's
 *  family (D11 rules inside spellChordName). confidence 1 (a typed
 *  cell is certain), alternatives [], isRest false. */
export function buildCellFromSymbol(p: ParsedSymbol, key: KeyCandidate): ChordCell {
  const baseName = spellChordName(p.rootPc, p.qualitySymbol, key.tonicPc, key.mode);
  const name =
    p.bassPc === null
      ? baseName
      : `${baseName}/${spellChordName(p.bassPc, "", key.tonicPc, key.mode)}`;
  return {
    rootPc: p.rootPc,
    qualitySymbol: p.qualitySymbol,
    name,
    bassPc: p.bassPc,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

/** The 17 quality suffixes in table order (autocomplete x roots). */
const QUALITY_ORDER: readonly string[] = Object.keys(NAME_SUFFIX);

/**
 * Autocomplete candidates, prefix-filtered (case-insensitively), capped
 * at `limit`. Ordering (D61): the cell's top-3 engine alternatives
 * FIRST, then recent symbols (newest first, passed IN by the surface -
 * this module keeps no state), then the spelled-root x 17-quality
 * grammar space (key-family aware via spellChordName, so G# minor
 * suggests "F#m7" not "Gbm7").
 */
export function suggestChordSymbols(
  query: string,
  key: KeyCandidate,
  limit = 8,
  alternatives: readonly ChordCell[] = [],
  recents: readonly string[] = [],
): readonly string[] {
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (symbol: string): void => {
    if (seen.has(symbol)) return;
    if (q !== "" && !symbol.toLowerCase().startsWith(q)) return;
    seen.add(symbol);
    out.push(symbol);
  };
  for (const alt of alternatives.slice(0, 3)) {
    if (!alt.isRest && alt.name !== "") push(alt.name);
  }
  for (const recent of recents.slice(0, 8)) push(recent);
  outer: for (let pc = 0; pc < 12; pc++) {
    const root = spellChordName(pc, "", key.tonicPc, key.mode);
    for (const quality of QUALITY_ORDER) {
      push(root + NAME_SUFFIX[quality]);
      if (out.length >= limit) break outer;
    }
  }
  return out.slice(0, limit);
}
