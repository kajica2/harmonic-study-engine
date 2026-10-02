/**
 * src/lib/exerciseCollection.ts - pure collection-manifest logic for
 * the per-exercise WAV/MIDI/MP3 download bundle.
 *
 * The book generator lets a user compile selected exercises into a
 * print-ready PDF; this module derives the companion AUDIO collection:
 * one WAV + one MIDI (and optionally MP3) per exercise, addressed by
 * a stable slug under a shared base URL. Pure string mapping - no DOM,
 * no audio engine - so it is node-testable (PIN-001).
 *
 * URL convention (pinned):
 *   {baseUrl}/collection/{slug}.wav
 *   {baseUrl}/collection/{slug}.mid
 *   {baseUrl}/collection/{slug}.mp3       (only when mp3 is requested)
 *   {baseUrl}/collection/{slug}.musicxml  (only when musicXml is requested)
 *
 * The slug reuses the marketplace deriveSlug law (lowercase, collapse
 * non-alphanumerics to dashes, "untitled" fallback) so collection
 * filenames stay consistent with published listing slugs.
 */

import type { BookExercise } from "./bookGenerator";
import { deriveSlug } from "./marketplace";

/** One exercise's downloadable audio files. */
export interface ExerciseAudio {
  /** Stable slug used in every file URL (deriveSlug of the title). */
  slug: string;
  /** Human-readable exercise title (for the UI list). */
  title: string;
  /** WAV backing-track URL. */
  wavUrl: string;
  /** MIDI file URL. */
  midiUrl: string;
  /** MP3 URL - present only when mp3 was requested. */
  mp3Url?: string;
  /** MusicXML score URL - present only when musicXml was requested. */
  musicXmlUrl?: string;
}

export interface CollectionManifestOptions {
  /** Include an MP3 URL per exercise (default false). */
  includeMp3?: boolean;
  /** Include a MusicXML score URL per exercise (default false). */
  includeMusicXml?: boolean;
}

/**
 * Build the audio-collection manifest for the given exercises.
 *
 * Every exercise maps to exactly one entry; the base URL is joined
 * with the "collection" folder and the exercise slug. The base URL is
 * used verbatim (no trailing-slash normalization) so callers control
 * the exact prefix.
 */
export function buildCollectionManifest(
  exercises: readonly BookExercise[],
  baseUrl: string,
  opts: CollectionManifestOptions = {},
): ExerciseAudio[] {
  const includeMp3 = opts.includeMp3 ?? false;
  const includeMusicXml = opts.includeMusicXml ?? false;
  return exercises.map((ex) => {
    const slug = deriveSlug(ex.title);
    const entry: ExerciseAudio = {
      slug,
      title: ex.title,
      wavUrl: `${baseUrl}/collection/${slug}.wav`,
      midiUrl: `${baseUrl}/collection/${slug}.mid`,
    };
    if (includeMp3) {
      entry.mp3Url = `${baseUrl}/collection/${slug}.mp3`;
    }
    if (includeMusicXml) {
      entry.musicXmlUrl = `${baseUrl}/collection/${slug}.musicxml`;
    }
    return entry;
  });
}