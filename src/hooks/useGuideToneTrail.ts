/**
 * src/hooks/useGuideToneTrail.ts — live guide-tone tally for the
 * current practice loop.
 *
 * Subscribes once to `midiOut` note-ons and classifies each against
 * the chord that is active at that moment (chordNotes is captured via
 * a ref so the subscription never goes stale as the step advances).
 *
 * Lifecycle:
 *   begin() — reset + start counting (called when a take starts)
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
  /** Start a fresh counting run (no-op re-entrant safe). */
  begin: () => void;
  /** Stop and return the run's tally; null if never begun. */
  end: () => GuideToneTrail | null;
  /** Live tally while a run is active (for inline display). */
  tally: GuideToneTrail;
}

export function useGuideToneTrail(chordNotes: number[]): GuideToneRunApi {
  const notesRef = useRef<number[]>(chordNotes);
  notesRef.current = chordNotes;

  const activeRef = useRef(false);
  const trailRef = useRef<GuideToneTrail>(emptyTrail());
  const [tally, setTally] = useState<GuideToneTrail>(emptyTrail());

  useEffect(() => {
    const off = midiOut.onNoteOn((midi) => {
      if (!activeRef.current) return;
      const match = classifyGuideTone(midi, notesRef.current);
      trailRef.current = accumulateTrail(trailRef.current, match);
      setTally(trailRef.current);
    });
    return off;
  }, []);

  const begin = useCallback(() => {
    activeRef.current = true;
    trailRef.current = emptyTrail();
    setTally(emptyTrail());
  }, []);

  const end = useCallback(() => {
    if (!activeRef.current) return null;
    activeRef.current = false;
    return trailRef.current;
  }, []);

  return { begin, end, tally };
}