/**
 * useTick — shared subscription to playbackClock's tick event.
 *
 * Why: previously PlaySessionRail and LiveScoreDisplay each kept their
 * own `useState<tickDetail>` and called `playbackClock.subscribe`
 * independently. Two render pipelines, two state copies — same data
 * broadcast twice.
 *
 * This hook returns a single shared `tickDetail` state object that
 * every consumer renders from. The clock still broadcasts once per
 * frame; only the React state copy is shared.
 *
 * (Truly single-source would mean moving tick state into a Context
 * provider, but for two consumers a module-level cache is enough.)
 */

import { useEffect, useState } from "react";
import { playbackClock } from "./playbackClock";

export interface TickDetail {
  beat: number;
  timeSec: number;
  isRunning: boolean;
}

let _cache: TickDetail | null = null;
const _listeners = new Set<(d: TickDetail) => void>();

function ensureSubscription() {
  if (_listeners.size > 0) return; // already subscribed
  playbackClock.subscribe((d) => {
    const next: TickDetail = {
      beat: d.beat,
      timeSec: d.timeSec,
      isRunning: d.isRunning,
    };
    _cache = next;
    for (const cb of _listeners) cb(next);
  });
}

export function useTick(): TickDetail {
  const [tick, setTick] = useState<TickDetail>(
    () =>
      _cache ?? {
        beat: 0,
        timeSec: 0,
        isRunning: false,
      },
  );

  useEffect(() => {
    ensureSubscription();
    // Re-sync to whatever the cache has in case we mounted late.
    if (_cache) setTick(_cache);
    const cb = (d: TickDetail) => setTick(d);
    _listeners.add(cb);
    return () => {
      _listeners.delete(cb);
    };
  }, []);

  return tick;
}