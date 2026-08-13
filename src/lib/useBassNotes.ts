/**
 * useBassNotes — react hook that subscribes to BackingEngine's
 * real-time bass-note stream and returns the current set of
 * sounding bass MIDI notes.
 *
 * Used by the piano's "Bass" layer to light up the matching
 * keys in real time as the backing track walks through the
 * progression. The set updates on every bass note-on and
 * note-off; React re-renders only the piano key array, not the
 * whole page.
 *
 * Subscriptions are scoped to the hook instance (cleanup runs
 * on unmount), and the engine uses a single internal set so
 * every piano copy shares state — flipping the bass layer on
 * or off does not restart playback.
 */
import { useEffect, useState } from "react";
import { backingEngine } from "./backingEngine";

export function useBassNotes(): number[] {
  const [bass, setBass] = useState<number[]>(() =>
    backingEngine.getActiveBassMidis(),
  );

  useEffect(() => {
    // Re-sync on mount in case the engine started before the
    // hook subscribed.
    setBass(backingEngine.getActiveBassMidis());
    const off = backingEngine.onBassNotes((m) => setBass(m));
    return off;
  }, []);

  return bass;
}