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
 * Channel-split (see docs/midiChannelSplit-feature.md): when the
 * player sends bass on a dedicated MIDI channel (default 2), the
 * hook ALSO subscribes to midiOut and merges live bass note-ons
 * from that channel into the returned set. The union of the
 * backing-engine stream and the live MIDI bass stream is what the
 * piano lights up, so a Stick / bass-pedal setup shows both the
 * backing bass and the player's own bass notes.
 *
 * Subscriptions are scoped to the hook instance (cleanup runs
 * on unmount), and the engine uses a single internal set so
 * every piano copy shares state — flipping the bass layer on
 * or off does not restart playback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { backingEngine } from "./backingEngine";
import { midiOut } from "./midiOut";

export function useBassNotes(bassChannel = 2): number[] {
  const [bass, setBass] = useState<number[]>(() =>
    backingEngine.getActiveBassMidis(),
  );
  // Live MIDI bass notes (from the player's device on bassChannel)
  // merged with the engine stream. Kept in refs so both
  // subscriptions can publish the union without stale closures.
  const engineBassRef = useRef<number[]>(backingEngine.getActiveBassMidis());
  const liveBassRef = useRef<Set<number>>(new Set());

  const publish = useCallback(() => {
    const merged = new Set([...engineBassRef.current, ...liveBassRef.current]);
    setBass(Array.from(merged));
  }, []);

  useEffect(() => {
    // Re-sync on mount in case the engine started before the
    // hook subscribed.
    engineBassRef.current = backingEngine.getActiveBassMidis();
    publish();
    const off = backingEngine.onBassNotes((m) => {
      engineBassRef.current = m;
      publish();
    });
    return off;
  }, [publish]);

  useEffect(() => {
    const offOn = midiOut.onNoteOn((midi, _velocity, channel) => {
      if (channel !== bassChannel) return;
      liveBassRef.current.add(midi);
      publish();
    });
    const offOff = midiOut.onNoteOff((midi, channel) => {
      if (channel !== bassChannel) return;
      liveBassRef.current.delete(midi);
      publish();
    });
    return () => {
      offOn();
      offOff();
    };
  }, [bassChannel, publish]);

  return bass;
}