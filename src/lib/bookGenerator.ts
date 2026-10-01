/**
 * src/lib/bookGenerator.ts - pure book-composition logic for the
 * print-ready book generator. Node-testable (no DOM, no jsPDF).
 *
 * Three pure functions:
 *   - deriveBookExercises: HarmonicPath[] + masterclass map -> BookExercise[]
 *   - buildMemoryCards:    BookExercise[] -> MemoryCard[] (capped)
 *   - cardGridLayout:      card count -> double-sided grid math
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
 * chord (chord symbol -> chord tones + source exercise). Capped at
 * MAX_MEMORY_CARDS so the deck stays a sensible print size.
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
      cards.push({
        front: ex.chordNames[j],
        back: chordCardBack(
          ex.chordNames[j],
          ex.chordTones[j] ?? [],
          ex.title,
        ),
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