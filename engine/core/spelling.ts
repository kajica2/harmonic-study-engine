/**
 * engine/core/spelling.ts - PRD-001 Phase 2 (D11): hand-rolled pure
 * key spelling for the effective-key badge.
 *
 * Purity: imports NOTHING (the engine purity guard rejects even
 * relative specifiers that cross into src/, and this module is
 * deliberately zero-dependency). No clocks, no randomness, no
 * console - everything flows through return values.
 *
 * Spelling rules (D11):
 *  - The author's literal accidental wins when it still names the
 *    target pitch class (e.g. "F# minor" stays F#, not Gb).
 *  - Otherwise: fewest key-signature accidentals; TIES GO FLAT
 *    (pc6 major -> Gb, not F#). The minor table is NOT the mirror of
 *    the major one: C#m (not Dbm), F#m (not Gbm), G#m (not Abm),
 *    Ebm (not D#m) - those are the real lowest-accidental keys.
 *  - Modal / unknown suffixes: spell the tonic via the major table,
 *    keep the suffix verbatim ("C Lydian" +1 -> "Db Lydian").
 *  - Drift "A -> B" (the data uses the U+2192 arrow; ASCII "->" is
 *    also accepted): each endpoint is shifted independently and
 *    rendered "X -> Y". No blending.
 *  - Slash "D Dorian / G Mixolydian": first endpoint wins.
 *  - Trailing parentheticals ("B major (tonal center)",
 *    "C major (axis = F#/Gb, pc 6)") are stripped before parsing.
 *
 * Output labels are ASCII-only on purpose (D12): the badge must not
 * render flat/sharp glyphs.
 */

/** A parsed single key: pitch class + normalized mode + the author's
 *  raw tonic token ("Db", "F#", "C"...). */
export interface ParsedKey {
  readonly tonicPc: number;
  readonly mode: string;
  readonly literal: string;
}

const NOTE_PC: Readonly<Record<string, number>> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** Tonic spelling per pitch class for major keys (fewest
 *  accidentals, ties flat - pc6 is Gb). */
const MAJOR_TABLE: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

/** Tonic spelling per pitch class for minor keys. Sharps win the
 *  minor ties: C#m (4#) beats Dbm (5b), F#m (3#) beats the
 *  theoretical Gbm, G#m (5#) beats Abm (7b); Ebm (6b) beats the
 *  theoretical D#m. */
const MINOR_TABLE: readonly string[] = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
];

const TONIC_RE = /^([A-G][#b]?)/;
const PAREN_RE = /\s*\([^()]*\)\s*$/;
/** Drift separator: the real data uses U+2192; ASCII "->" is
 *  accepted too. Written with an escape so this file stays ASCII. */
const DRIFT_RE = /\s*(?:\u2192|->)\s*/;

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Normalize the qualifier tail of a key string to a mode label.
 *  Known plain qualities collapse to "major"/"minor"; anything else
 *  survives verbatim so effectiveKeyLabel can keep it as a suffix. */
function normalizeMode(tail: string): string {
  const t = tail.trim().toLowerCase();
  if (t === "" || t === "maj" || t === "major" || t === "ionian") return "major";
  if (t === "min" || t === "minor" || t === "m") return "minor";
  return tail.trim();
}

/**
 * Parse one key token (NOT a drift pair - callers split first, but a
 * drift string handed to parseKey resolves to its first endpoint so
 * every catalog key string yields a value instead of throwing).
 * Returns null for unparseable input.
 */
export function parseKey(raw: string): ParsedKey | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (s === "") return null;

  // Drift input: first endpoint wins for the single-key view.
  const endpoints = s.split(DRIFT_RE).filter((x) => x.trim() !== "");
  if (endpoints.length > 1) s = endpoints[0].trim();

  // Strip trailing parentheticals: "(tonal center)", "(blues)",
  // "(axis = F#/Gb, pc 6)" - before slash-splitting so the "/"
  // inside "(F#/Gb)" cannot be mistaken for a modal slash.
  while (PAREN_RE.test(s)) s = s.replace(PAREN_RE, "");

  // Slash form "D Dorian / G Mixolydian": first endpoint wins.
  const slash = s.indexOf("/");
  if (slash > 0) s = s.slice(0, slash).trim();

  const m = TONIC_RE.exec(s);
  if (!m) return null;
  const literal = m[1];
  const pc = NOTE_PC[literal];
  if (pc === undefined) return null;
  return { tonicPc: pc, mode: normalizeMode(s.slice(literal.length)), literal };
}

/**
 * Spell a tonic for the given pitch class + mode. The author's
 * literal wins when it names the same pitch class; otherwise the
 * fewest-accidentals table for the mode (minor table only for
 * "minor", major table for everything else incl. modal suffixes).
 */
export function spellTonic(pc: number, mode: string, literal: string): string {
  const p = mod12(pc);
  if (typeof literal === "string" && literal !== "" && NOTE_PC[literal] === p) {
    return literal;
  }
  return (mode === "minor" ? MINOR_TABLE : MAJOR_TABLE)[p];
}

/** Mode suffix rendered after the tonic. "major"/"minor" are words;
 *  modal / unknown suffixes pass through verbatim. */
function modeSuffix(mode: string): string {
  return mode;
}

/** Spell one parsed key shifted by `shift` semitones. */
function shiftLabel(key: ParsedKey, shift: number): string {
  const pc = mod12(key.tonicPc + shift);
  const tonic = spellTonic(pc, key.mode, key.literal);
  return tonic + " " + modeSuffix(key.mode);
}

/** Parse a plain triad/7th chord token. Only the plain qualities
 *  ("", maj, maj7, m, m7) qualify for the first/last-chord key
 *  heuristic; everything else (suspensions, alterations, compound
 *  "Gm7 C7" bars) returns null. */
function parsePlainChord(
  name: string,
): { literal: string; quality: "maj" | "min" } | null {
  const m = /^([A-G][#b]?)(maj7|m7|maj|m)?$/.exec(name.trim());
  if (!m) return null;
  const literal = m[1];
  const pc = NOTE_PC[literal];
  if (pc === undefined) return null;
  const q = m[2] ?? "";
  if (q === "" || q === "maj" || q === "maj7") return { literal, quality: "maj" };
  return { literal, quality: "min" };
}

/**
 * The effective sounding key label for a path, or null when nothing
 * can be claimed (the caller then falls back to a pitch-only
 * "Sounding: +N st" readout - a conservative no-false-claims rule).
 *
 *  - sourceKey present: parse (drift -> both endpoints shifted and
 *    joined with " -> "; slash -> first endpoint; parentheticals
 *    stripped). Unparseable -> null.
 *  - sourceKey absent (studies paths): first+last chord fallback -
 *    if both steps share a root AND a plain quality
 *    (""|maj|maj7|m|m7) the tonic+mode is claimed; else null.
 */
export function effectiveKeyLabel(
  sourceKey: string | null | undefined,
  shift: number,
  fallbackFirstChord?: string,
  fallbackLastChord?: string,
): string | null {
  if (!Number.isFinite(shift)) return null;
  const s = Math.round(shift);

  if (typeof sourceKey === "string" && sourceKey.trim() !== "") {
    const endpoints = sourceKey
      .split(DRIFT_RE)
      .map((x) => x.trim())
      .filter((x) => x !== "");
    const parsed = endpoints.map((e) => parseKey(e));
    if (parsed.length === 0 || parsed.some((p) => p === null)) return null;
    return parsed.map((p) => shiftLabel(p as ParsedKey, s)).join(" -> ");
  }

  if (
    typeof fallbackFirstChord === "string" &&
    typeof fallbackLastChord === "string"
  ) {
    const a = parsePlainChord(fallbackFirstChord);
    const b = parsePlainChord(fallbackLastChord);
    if (
      a &&
      b &&
      a.quality === b.quality &&
      NOTE_PC[a.literal] === NOTE_PC[b.literal]
    ) {
      const mode = a.quality === "maj" ? "major" : "minor";
      const pc = mod12((NOTE_PC[a.literal] as number) + s);
      return spellTonic(pc, mode, a.literal) + " " + mode;
    }
  }
  return null;
}

/** Cycle-all-12 advance (D13): the next offset in the (+1 mod 12)
 *  rotation. Always lands in 0..11, so it stays inside the +/-12
 *  exercise clamp by construction. advanceKeyCycle(11) === 0. */
export function advanceKeyCycle(current: number): number {
  if (!Number.isFinite(current)) return 0;
  return mod12(Math.round(current) + 1);
}
