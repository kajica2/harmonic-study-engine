/**
 * src/lib/bookGenerator.ts - pure book-composition logic for the
 * print-ready book generator. Node-testable (no DOM, no jsPDF).
 *
 * Pure functions:
 *   - deriveBookExercises: HarmonicPath[] + masterclass map -> BookExercise[]
 *   - buildMemoryCards:    BookExercise[] -> MemoryCard[] (capped)
 *   - cardGridLayout:      card count -> double-sided grid math
 *   - deriveScaleSyllabus: BookExercise -> parent scale + modes
 *   - modeForChord:        chord symbol -> suggested scale mode
 *   - romanNumeralForChord: chord symbol + key -> roman numeral
 *   - guideTonesForChord:  chord symbol -> 3rd + 7th
 *
 * The browser-side PDF composition (src/lib/bookPdf.ts) consumes these
 * shapes; all content derivation lives here so it can be pinned in
 * node tests (PIN-001).
 */

import type { HarmonicPath, HarmonicStep } from "./paths";
import type { MasterclassEntry } from "../data/masterclass";
import { NOTE_NAMES_FLAT } from "./theory";

export interface BookExercise {
  id: string;
  title: string;
  composer: string;
  key: string;
  tempo: number;
  feel: string;
  bars: number;
  /** Unique chord symbols in first-appearance order. */
  chordNames: string[];
  /** Chord tones (flat-preferred note names) parallel to chordNames,
   *  derived from the first step that contains each chord. */
  chordTones: string[][];
  /** Practice instructions: curated objective, then main exercise. */
  practiceNotes: string[];
  tags: string[];
}

export interface MemoryCard {
  front: string;
  back: string;
  /** Roman numeral relative to the exercise key (chord cards only). */
  roman?: string;
  /** Chord tones (chord cards only). */
  chordTones?: string[];
  /** Guide tones: 3rd and 7th of the chord (chord cards only). */
  guideTones?: string[];
}

/** Scale Syllabus appendix entry: the parent scale for an exercise
 *  plus the modes suggested by its chord progression. */
export interface ScaleSyllabus {
  parentScale: string;
  modes: string[];
}

/** Cap on memory cards: 24 cards = 6 pages of 4-card grids. */
export const MAX_MEMORY_CARDS = 24;

/** Middle dot used by the auto-generated path descriptions. Escaped so
 *  this source file stays free of the literal typographic character. */
const MIDDLE_DOT = "\u00B7";

/** Em-dash / en-dash / hyphen used to split "Title - Composer". */
const TITLE_DASH_RE = /\s*[\u2014\u2013-]\s*/;

/** A key token like "F", "Bb", "G-", "Eb", "C#". */
const KEY_RE = /^[A-G](?:#|b)?-?$/;

interface DescriptionMeta {
  key: string;
  tempo: number;
  feel: string;
  bars: number;
}

/**
 * Parse the auto-generated description line ("F | 130 BPM | Swing
 * Medium | 32 bars") into structured metadata. Tolerant of missing
 * segments: tempo/bars default to 0, key/feel default to "".
 */
function parsePathDescription(description: string): DescriptionMeta {
  const parts = description
    .split(MIDDLE_DOT)
    .map((s) => s.trim())
    .filter(Boolean);

  let key = "";
  if (parts.length > 0 && KEY_RE.test(parts[0])) {
    key = parts[0];
  }

  const tempoMatch = description.match(/(\d+)\s*BPM/i);
  const tempo = tempoMatch ? parseInt(tempoMatch[1], 10) : 0;

  const barsMatch = description.match(/(\d+)\s*bars?/i);
  const bars = barsMatch ? parseInt(barsMatch[1], 10) : 0;

  let feel = "";
  for (const part of parts.slice(1)) {
    if (!/\d/.test(part) && !/bars?/i.test(part)) {
      feel = part;
      break;
    }
  }

  return { key, tempo, feel, bars };
}

/**
 * Composer derivation: the path's explicit `composer` field wins;
 * otherwise titles like "Star Eyes - Gene de Paul" embed the composer
 * after the dash. Falls back to "" when neither is available.
 */
function deriveComposer(
  path: HarmonicPath,
  entry: MasterclassEntry | undefined,
): string {
  if (path.composer) return path.composer;
  const parts = (path.title ?? "").split(TITLE_DASH_RE).filter(Boolean);
  if (parts.length > 1) {
    const composer = parts[parts.length - 1].trim();
    if (composer) return composer;
  }
  return entry?.title ?? "";
}

/** Unique chord symbols from steps, first-appearance order. A step can
 *  carry two chords ("Gm7 C7"); each token is treated separately. */
function extractChordNames(steps: HarmonicStep[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const step of steps) {
    for (const token of step.name.split(/\s+/)) {
      const name = token.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Chord tones for each unique chord, derived from the MIDI notes of
 * the first step that contains the chord. Note names are flat-preferred
 * (jazz convention) and deduped. Multi-chord bars share the bar's
 * voicing - a known limitation of the source data.
 */
function extractChordTones(
  steps: HarmonicStep[],
  chordNames: string[],
): string[][] {
  return chordNames.map((chord) => {
    const step = steps.find((s) => s.name.split(/\s+/).includes(chord));
    if (!step) return [];
    const seen = new Set<string>();
    const tones: string[] = [];
    for (const midi of step.notes) {
      const pc = ((midi % 12) + 12) % 12;
      const name = NOTE_NAMES_FLAT[pc];
      if (!seen.has(name)) {
        seen.add(name);
        tones.push(name);
      }
    }
    return tones;
  });
}

/** Practice notes: curated objective first, then the main exercise.
 *  Falls back to the path description when no masterclass entry exists. */
function derivePracticeNotes(
  path: HarmonicPath,
  entry: MasterclassEntry | undefined,
): string[] {
  const notes: string[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const trimmed = text.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      notes.push(trimmed);
    }
  };
  if (entry?.objective) push(entry.objective);
  if (entry?.mainExercise) push(entry.mainExercise);
  if (notes.length === 0 && path.description) push(path.description);
  return notes;
}

/**
 * Derive BookExercise metadata from HarmonicPaths + the masterclass
 * catalog. Extracts key/tempo/feel/bars from the description line,
 * chord names + tones from the steps, and practice notes + tags from
 * the masterclass entry (when the path id is in the catalog).
 */
export function deriveBookExercises(
  paths: HarmonicPath[],
  masterclassMap: ReadonlyMap<string, MasterclassEntry>,
): BookExercise[] {
  return paths.map((path) => {
    const entry = masterclassMap.get(path.id);
    const meta = parsePathDescription(path.description ?? "");
    const chordNames = extractChordNames(path.steps);
    return {
      id: path.id,
      title: path.title ?? path.name ?? path.id,
      composer: deriveComposer(path, entry),
      key: path.key ?? meta.key,
      tempo: meta.tempo,
      feel: path.feel ?? meta.feel,
      bars: meta.bars,
      chordNames,
      chordTones: extractChordTones(path.steps, chordNames),
      practiceNotes: derivePracticeNotes(path, entry),
      tags: entry?.tags ?? [],
    };
  });
}

/** Back of an exercise summary card: key | tempo | feel, then the
 *  first practice note when available. */
function exerciseCardBack(ex: BookExercise): string {
  const meta = [ex.key, ex.tempo > 0 ? `${ex.tempo} BPM` : "", ex.feel]
    .filter(Boolean)
    .join(" | ");
  const firstNote = ex.practiceNotes[0];
  return firstNote ? `${meta}\n${firstNote}` : meta;
}

/** Back of a chord card: chord tones, then the source exercise. */
function chordCardBack(
  chord: string,
  tones: string[],
  exerciseTitle: string,
): string {
  const toneLine = tones.length > 0 ? tones.join(" ") : chord;
  return `${toneLine}\nfrom ${exerciseTitle}`;
}

/**
 * Build the memory-card deck. For each exercise: one summary card
 * ("Exercise N: title" -> key/tempo/feel) plus one card per unique
 * chord (chord symbol -> chord tones + source exercise). Chord cards
 * carry the roman numeral (relative to the exercise key), the chord
 * tones, and the guide tones (3rd + 7th) so the card front can show
 * the symbol large with the numeral above and the back can show tones
 * plus guide tones. Capped at MAX_MEMORY_CARDS so the deck stays a
 * sensible print size.
 */
export function buildMemoryCards(exercises: BookExercise[]): MemoryCard[] {
  const cards: MemoryCard[] = [];
  for (let i = 0; i < exercises.length; i++) {
    if (cards.length >= MAX_MEMORY_CARDS) break;
    const ex = exercises[i];
    cards.push({
      front: `Exercise ${i + 1}: ${ex.title}`,
      back: exerciseCardBack(ex),
    });
    for (let j = 0; j < ex.chordNames.length; j++) {
      if (cards.length >= MAX_MEMORY_CARDS) break;
      const chord = ex.chordNames[j];
      cards.push({
        front: chord,
        back: chordCardBack(chord, ex.chordTones[j] ?? [], ex.title),
        roman: romanNumeralForChord(chord, ex.key),
        chordTones: ex.chordTones[j] ?? [],
        guideTones: guideTonesForChord(chord),
      });
    }
  }
  return cards.slice(0, MAX_MEMORY_CARDS);
}

/**
 * Double-sided grid math for the memory-card section. Front pages and
 * back pages use the SAME grid positions, so printing the front pages
 * then flipping the stack and printing the back pages aligns each card
 * back directly behind its front.
 */
export function cardGridLayout(
  cardCount: number,
  cols = 2,
  rows = 2,
): { pages: number; cardsPerPage: number } {
  const cardsPerPage = Math.max(1, cols * rows);
  const pages = Math.ceil(cardCount / cardsPerPage);
  return { pages, cardsPerPage };
}

// ---------------------------------------------------------------------------
// Scale Syllabus + chord analysis helpers (advanced jazz content)
// ---------------------------------------------------------------------------

/** Pitch-class lookup for note tokens ("C", "Bb", "F#", ...). */
const NOTE_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** Diatonic scale degrees (semitones above the tonic). */
const SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11];

/** Roman numerals for major keys (diatonic case). */
const MAJOR_ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii\u00B0"];

/** Roman numerals for minor keys (diatonic case). */
const MINOR_ROMAN = ["i", "ii\u00B0", "III", "iv", "v", "VI", "VII"];

/** Degree symbol, escaped so this file stays free of the literal
 *  typographic character (same convention as MIDDLE_DOT). */
const DEGREE = "\u00B0";

/** Half-diminished symbol (o with slash), escaped. */
const HALF_DIM = "\u00F8";

/** Major-seventh triangle symbol, escaped. */
const MAJ_TRI = "\u0394";

/**
 * Parse a key token ("F", "Bb", "G-", "C-", "D minor") into the tonic
 * pitch class and whether the key is minor. Minor keys use the "-"
 * suffix convention from the path descriptions, with "min"/"minor"
 * accepted as a fallback.
 */
function parseKeyTonic(key: string): { tonicPc: number; minor: boolean } {
  const trimmed = (key ?? "").trim();
  const minor =
    /-$/.test(trimmed) ||
    /m(?:in(?:or)?)?$/i.test(trimmed.replace(/-$/, ""));
  const tonicToken = trimmed
    .replace(/-$/, "")
    .replace(/\s*(?:m(?:in(?:or)?)?|maj(?:or)?)\s*$/i, "")
    .trim();
  const tonicPc = NOTE_PC[tonicToken] ?? 0;
  return { tonicPc, minor };
}

/**
 * Suggested scale mode for a chord symbol (advanced jazz convention:
 * ii-V-I maps to Dorian/Mixolydian/Ionian). Falls back to Ionian for
 * unrecognized symbols so the syllabus always has a usable answer.
 */
export function modeForChord(chord: string): string {
  const c = chord.trim();
  if (/^[A-G][#b]?m7b5$/.test(c) || c.includes(HALF_DIM)) return "Locrian";
  if (/^[A-G][#b]?m(?:7|9|11|6)?$/.test(c)) return "Dorian";
  if (/^[A-G][#b]?dim7?$/.test(c) || c.includes(DEGREE)) {
    return "Diminished (whole-half)";
  }
  if (/^[A-G][#b]?mM(?:7|9)?$/.test(c) || /m\(maj7\)/.test(c)) {
    return "Melodic Minor";
  }
  if (/^[A-G][#b]?7(?:b9|#9|b5|#5|sus4?)?$/.test(c)) return "Mixolydian";
  if (/^[A-G][#b]?(?:9|13)$/.test(c)) return "Mixolydian";
  if (/^[A-G][#b]?(?:maj7|maj9|maj13|maj6|6)$/.test(c) || c.includes(MAJ_TRI)) {
    return "Ionian";
  }
  if (/^[A-G][#b]?(?:aug|\+)$/.test(c)) return "Whole Tone";
  return "Ionian";
}

/**
 * Derive the Scale Syllabus entry for an exercise: the parent scale
 * from the exercise key (major/minor) plus the unique modes suggested
 * by the chord types in the progression, in first-appearance order.
 */
export function deriveScaleSyllabus(exercise: BookExercise): ScaleSyllabus {
  const { tonicPc, minor } = parseKeyTonic(exercise.key);
  const tonicName = NOTE_NAMES_FLAT[tonicPc];
  const parentScale = minor ? `${tonicName} Minor` : `${tonicName} Major`;
  const modes: string[] = [];
  const seen = new Set<string>();
  for (const chord of exercise.chordNames) {
    const mode = modeForChord(chord);
    if (!seen.has(mode)) {
      seen.add(mode);
      modes.push(mode);
    }
  }
  return { parentScale, modes };
}

/**
 * Roman numeral for a chord relative to the exercise key (e.g. "Gm7"
 * in F major -> "ii", "C7" in F major -> "V"). Case follows the chord
 * quality: minor-family chords are lowercase, diminished chords get a
 * degree symbol, everything else is uppercase. Returns "" when the
 * chord root or key cannot be parsed.
 */
export function romanNumeralForChord(chord: string, key: string): string {
  const { tonicPc, minor } = parseKeyTonic(key);
  const rootMatch = chord.trim().match(/^([A-G][#b]?)/);
  if (!rootMatch) return "";
  const rootPc = NOTE_PC[rootMatch[1]] ?? 0;
  const degree = ((rootPc - tonicPc) % 12 + 12) % 12;
  const idx = SCALE_DEGREES.indexOf(degree);
  if (idx === -1) return "";
  const base = minor ? MINOR_ROMAN[idx] : MAJOR_ROMAN[idx];
  const isDiminished =
    /(?:m7b5|dim)/.test(chord) ||
    chord.includes(HALF_DIM) ||
    chord.includes(DEGREE);
  const isMinor =
    /^[A-G][#b]?m(?:7|9|11|6)?$/.test(chord) || isDiminished;
  if (isDiminished) {
    // The diatonic base may already carry a degree symbol ("vii°",
    // "ii°"); strip it before re-adding so we never double it.
    const plain = base.toLowerCase().replace(new RegExp(DEGREE, "g"), "");
    return plain.replace(/[iv]+/g, (m) => `${m}${DEGREE}`);
  }
  if (isMinor) return base.toLowerCase();
  return base.toUpperCase();
}

/**
 * Guide tones for a chord symbol: the 3rd and 7th (the two notes that
 * define the chord quality and drive voice leading). Flat-preferred
 * note names, jazz convention. Returns [] when the root cannot be
 * parsed.
 */
export function guideTonesForChord(chord: string): string[] {
  const rootMatch = chord.trim().match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];
  const rootPc = NOTE_PC[rootMatch[1]] ?? 0;
  let third = 4;
  let seventh = 11;
  if (
    /^[A-G][#b]?m(?:7|9|11|6)?$/.test(chord) ||
    /m7b5/.test(chord) ||
    chord.includes(HALF_DIM)
  ) {
    third = 3;
    seventh = 10;
  } else if (
    /^[A-G][#b]?7(?:b9|#9|b5|#5|sus4?)?$/.test(chord) ||
    /^[A-G][#b]?(?:9|13)$/.test(chord)
  ) {
    third = 4;
    seventh = 10;
  } else if (/dim/.test(chord) || chord.includes(DEGREE)) {
    third = 3;
    seventh = 9;
  }
  return [
    NOTE_NAMES_FLAT[(rootPc + third) % 12],
    NOTE_NAMES_FLAT[(rootPc + seventh) % 12],
  ];
}