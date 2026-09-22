/**
 * src/hooks/useGuideToneTrail.ts — live guide-tone tally for the
 * current practice loop.
 *
 * Subscribes once to `midiOut` note-ons and classifies each against
 * the chord that is active at that moment (chordNotes is captured via
 * a ref so the subscription never goes stale as the step advances).
 *
 * Lifecycle:
 *   begin() — start counting; idempotent (re-entry preserves the
 *     in-progress tally so a record-flow begin() after a
 *     transport begin() keeps pre-record notes)
 *   reset() — clear the tally but leave the active flag alone
 *     (used on path change)
 *   end()   — stop counting and return the tally (or null if never started)
 *   tally   — current live tally, re-rendered as notes land
 *
 * The finished tally is what the performance log writes onto the take
 * (recordGuideToneResult), bridging option C's classifier into option
 * G's mastery log.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { midiOut } from "../lib/midiOut";
import { classifyGuideTone } from "../lib/guideTones";
import {
  emptyTrail,
  accumulateTrail,
  type GuideToneTrail,
} from "../lib/guideToneTrail";

export interface GuideToneRunApi {
  /** Start a counting run; idempotent — re-entry is a no-op. */
  begin: () => void;
  /** Stop and return the run's tally; null if never begun. */
  end: () => GuideToneTrail | null;
  /** Clear the tally without touching the active flag. */
  reset: () => void;
  /** Live tally while a run is active (for inline display). */
  tally: GuideToneTrail;
}

export function useGuideToneTrail(
  chordNotes: number[],
  bassChannel?: number | null,
): GuideToneRunApi {
  const notesRef = useRef<number[]>(chordNotes);
  notesRef.current = chordNotes;
  // Bass channel (1-16) whose note-ons are excluded from the tally
  // (they feed the bass layer, not the guide-tone loop). null /
  // undefined = no filtering, preserving the pre-split behavior.
  const bassChannelRef = useRef<number | null | undefined>(bassChannel);
  bassChannelRef.current = bassChannel;

  const activeRef = useRef(false);
  const trailRef = useRef<GuideToneTrail>(emptyTrail());
  const [tally, setTally] = useState<GuideToneTrail>(emptyTrail());

  useEffect(() => {
    const off = midiOut.onNoteOn((midi, _velocity, channel) => {
      if (!activeRef.current) return;
      if (bassChannelRef.current != null && channel === bassChannelRef.current)
        return;
      const match = classifyGuideTone(midi, notesRef.current);
      trailRef.current = accumulateTrail(trailRef.current, match);
      setTally(trailRef.current);
    });
    return off;
  }, []);

  const begin = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    trailRef.current = emptyTrail();
    setTally(emptyTrail());
  }, []);

  const end = useCallback(() => {
    if (!activeRef.current) return null;
    activeRef.current = false;
    return trailRef.current;
  }, []);

  const reset = useCallback(() => {
    trailRef.current = emptyTrail();
    setTally(emptyTrail());
  }, []);

  return { begin, end, reset, tally };
}
