/**
 * src/lib/arpNotation.ts - pure arpeggiation math shared by the ABC
 * lead-sheet builder (leadSheet.ts), the MusicXML exporter
 * (scoreExport.ts), and the book PDF (bookPdf.ts).
 *
 * Three styles:
 *   - quarters: the first 4 notes as quarters (legacy, frozen)
 *   - eighths:  the chord repeated ascending to fill 8 eighth slots
 *   - triplets: the chord repeated ascending to fill 12 triplet slots
 *
 * Every style fills exactly one 4/4 bar (or beatsPerBar beats), so the
 * emitted bar always sums to the meter with no overflow brackets and
 * no mixed durations. Node-testable (no DOM, no abcjs).
 */

export type ArpStyle = "quarters" | "eighths" | "triplets";

/** Note slots per beat for each style. */
const SLOTS_PER_BEAT: Record<ArpStyle, number> = {
  quarters: 1,
  eighths: 2,
  triplets: 3,
};

/**
 * Return the note sequence for one bar of arpeggiation.
 *
 * - quarters: `notes.slice(0, beatsPerBar)` - the legacy first-N-notes
 *   behavior, frozen byte-identical.
 * - eighths: repeat the notes ascending until `beatsPerBar * 2` slots
 *   (2 passes of a 4-note chord; a 3-note chord fills 8 slots with 2
 *   full passes plus 2 notes of the 3rd pass).
 * - triplets: repeat until `beatsPerBar * 3` slots (3 passes of a
 *   4-note chord).
 *
 * An empty note list yields an empty sequence (the caller decides how
 * to fill the bar, e.g. a rest).
 */
export function arpNoteSequence(
  notes: readonly number[],
  style: ArpStyle,
  beatsPerBar = 4,
): number[] {
  if (style === "quarters") {
    return notes.slice(0, beatsPerBar);
  }
  const slots = Math.floor(beatsPerBar * SLOTS_PER_BEAT[style] + 1e-9);
  const src = notes.length > 0 ? notes : [];
  const out: number[] = [];
  for (let i = 0; i < slots && src.length > 0; i++) {
    out.push(src[i % src.length]);
  }
  return out;
}

/**
 * Duration tokens for one bar of arpeggiation.
 *
 * - quarters: 4 quarter notes
 * - eighths:  8 eighth notes
 * - triplets: 12 triplet eighths (4 groups of 3 in the time of 2)
 *
 * For triplets the caller prefixes every TRIPLET_GROUP_SIZE-th note
 * with ABC_TRIPLET_PREFIX so abcjs groups them into tuplets.
 */
export function arpDurationTokens(style: ArpStyle): {
  duration: string;
  count: number;
} {
  switch (style) {
    case "quarters":
      return { duration: "4", count: 4 };
    case "eighths":
      return { duration: "8", count: 8 };
    case "triplets":
      return { duration: "8", count: 12 };
  }
}

/** ABC tuplet prefix: 3 notes in the time of 2 (abcjs accepts "(3"). */
export const ABC_TRIPLET_PREFIX = "(3";

/** Notes per triplet group. */
export const TRIPLET_GROUP_SIZE = 3;