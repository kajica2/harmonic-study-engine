import { HarmonicPath, HarmonicStep } from "./paths";
import MidiWriter from "midi-writer-js";

/**
 * MIDI variation discriminated config.
 *
 * Each kind maps to a different pedagogical transformation of the
 * source path's `steps[].notes` before they hit the MIDI writer:
 *
 *   - asWritten      original behavior (single track, half notes)
 *   - transpose      shift every pitch by N semitones, clamp to 0..127
 *   - splitTracks    format-1 file: bass on its own track, rest on another
 *   - melodyOnly     keep only the Nth voice from each step (drop the rest)
 *   - rhythmOnly     vary the step duration ("4" / "8" / "16")
 *   - closedVoicing  cluster notes so the lowest interval ≤ tritone
 *   - openVoicing    spread notes so the lowest interval ≥ tritone
 *
 * The functions downstream treat unknown kinds as a soft error
 * (returns the as-written output) — the type union keeps that from
 * happening at compile time.
 */
export type MidiVariation =
  | { kind: "asWritten" }
  | { kind: "transpose"; semitones: number }
  | { kind: "splitTracks" }
  | { kind: "melodyOnly"; melodyIndex: number }
  | { kind: "rhythmOnly"; noteDuration: "2" | "4" | "8" | "16" }
  | { kind: "closedVoicing" }
  | { kind: "openVoicing" };

/** Default note duration (whole = 1, half = 2) — matches the legacy behavior. */
const DEFAULT_STEP_DURATION = "2";

/**
 * Pre-transform `steps` according to the variation. Returns a new
 * array (never mutates the source). Notes that fall outside 0..127
 * after a transpose are dropped, never clamped.
 */
function transformSteps(
  steps: HarmonicStep[],
  variation: MidiVariation,
): HarmonicStep[] {
  switch (variation.kind) {
    case "asWritten":
      return steps;

    case "transpose": {
      const shift = variation.semitones;
      return steps.map((step) => ({
        ...step,
        notes: step.notes
          .map((p) => p + shift)
          .filter((p) => p >= 0 && p <= 127),
      }));
    }

    case "splitTracks":
    case "rhythmOnly":
      // No note-level transformation needed — these only affect
      // track layout or event duration (handled in the writer).
      return steps;

    case "melodyOnly": {
      const idx = variation.melodyIndex;
      return steps.map((step) => {
        const pitch = step.notes[idx];
        return pitch == null
          ? { ...step, notes: [] }
          : { ...step, notes: [pitch] };
      });
    }

    case "closedVoicing":
    case "openVoicing": {
      const wantClosed = variation.kind === "closedVoicing";
      return steps.map((step) => {
        if (step.notes.length < 2) return step;
        const sorted = [...step.notes].sort((a, b) => a - b);
        // Skip if already in the requested voicing (best-effort check).
        const lowestInterval = sorted[1] - sorted[0];
        const tritone = 6;
        const alreadyThere = wantClosed
          ? lowestInterval <= tritone
          : lowestInterval >= tritone;
        if (alreadyThere) return step;
        return { ...step, notes: rotateUntil(sorted, wantClosed, tritone) };
      });
    }
  }
}

/**
 * Rotate a sorted ascending notes array until the lowest interval is
 * on the "right" side of the tritone threshold. For closed voicings
 * we want the smallest interval to be ≤ 6 semitones; for open, ≥ 6.
 * The bass note is preserved (always the lowest pitch in the chord).
 */
function rotateUntil(notes: number[], wantClosed: boolean, threshold: number): number[] {
  if (notes.length < 2) return notes;
  const arr = [...notes];
  // Up to (length - 1) rotations — eventually the lowest gap will
  // cross any fixed threshold because pitches repeat at the octave.
  for (let r = 0; r < arr.length; r++) {
    const lowestGap = arr[1] - arr[0];
    const ok = wantClosed ? lowestGap <= threshold : lowestGap >= threshold;
    if (ok) return arr;
    // Rotate: take the top note and drop it down an octave.
    const top = arr.pop() as number;
    arr.unshift(top - 12);
  }
  return arr;
}

/**
 * Resolve the step duration string for a rhythmOnly variation, or
 * the default half-note value for everything else.
 */
function durationFor(variation: MidiVariation): string {
  return variation.kind === "rhythmOnly" ? variation.noteDuration : DEFAULT_STEP_DURATION;
}

/**
 * Build a single-track MIDI writer from the (possibly pre-transformed)
 * steps. Used by both the legacy single-track path and as the
 * upper-voices track in a splitTracks file.
 */
function buildSingleTrack(steps: HarmonicStep[], duration: string, instrument: number) {
  const track = new MidiWriter.Track();
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument }));
  track.setTempo(120);
  for (const step of steps) {
    if (step.notes.length === 0) continue;
    track.addEvent(new MidiWriter.NoteEvent({ pitch: step.notes, duration }));
  }
  return track;
}

/**
 * Build a format-1 SMF with two tracks: bass (lowest note per step)
 * on track 0, upper voices on track 1. If a step has only one note,
 * it goes on the bass track only.
 */
function buildSplitTracks(steps: HarmonicStep[], duration: string) {
  const bassTrack = new MidiWriter.Track();
  bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 33 })); // Acoustic bass
  bassTrack.setTempo(120);

  const upperTrack = new MidiWriter.Track();
  upperTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 })); // Acoustic grand

  for (const step of steps) {
    if (step.notes.length === 0) continue;
    const sorted = [...step.notes].sort((a, b) => a - b);
    const bass = sorted[0];
    const upper = sorted.slice(1);
    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bass], duration }));
    if (upper.length > 0) {
      upperTrack.addEvent(new MidiWriter.NoteEvent({ pitch: upper, duration }));
    }
  }
  return [bassTrack, upperTrack];
}

/**
 * Encode the given steps as an SMF data URI after applying the
 * requested variation. Always returns a `data:audio/midi;base64,…`
 * string. The legacy `exportToMidiFile` is now a thin wrapper that
 * calls this with `{ kind: "asWritten" }` so its contract holds.
 */
export function exportMidiWithVariation(
  path: HarmonicPath,
  variation: MidiVariation,
): string {
  const steps = transformSteps(path.steps, variation);
  const duration = durationFor(variation);

  let writer;
  if (variation.kind === "splitTracks") {
    const tracks = buildSplitTracks(steps, duration);
    writer = new MidiWriter.Writer(tracks);
  } else {
    const track = buildSingleTrack(steps, duration, 1);
    writer = new MidiWriter.Writer(track);
  }
  return writer.dataUri();
}

/**
 * Legacy entry point — exports the given path as a single-track
 * format-0 SMF with half-note step durations. Preserved verbatim so
 * the existing ImportExportModal call site keeps working.
 */
export function exportToMidiFile(path: HarmonicPath): string {
  return exportMidiWithVariation(path, { kind: "asWritten" });
}