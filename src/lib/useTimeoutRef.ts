/**
 * useTimeoutRef — keeps a Set of pending setTimeout ids and clears
 * them all on unmount. Use for "fire-and-forget" timers that update
 * component state without an enclosing effect to clean them up.
 *
 * Usage:
 *   const tm = useTimeoutRef();
 *   tm.set(() => setX(null), 4000);
 *   // On unmount, the timeout is auto-cleared.
 */

import { useEffect, useRef } from "react";

export function useTimeoutRef() {
  const ids = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      for (const id of ids.current) clearTimeout(id);
      ids.current.clear();
    };
  }, []);

  return {
    set(handler: () => void, ms: number): ReturnType<typeof setTimeout> {
      const id = setTimeout(() => {
        ids.current.delete(id);
        handler();
      }, ms);
      ids.current.add(id);
      return id;
    },
    clear(id: ReturnType<typeof setTimeout>) {
      clearTimeout(id);
      ids.current.delete(id);
    },
    clearAll() {
      for (const id of ids.current) clearTimeout(id);
      ids.current.clear();
    },
  };
}