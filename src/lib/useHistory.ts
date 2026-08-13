/**
 * useHistory — bounded undo/redo stack for any React state.
 *
 * Usage:
 *   const [tempo, setTempo, { undo, redo, canUndo, canRedo }] = useHistory(60);
 *
 *   setTempo(120);    // pushes 60 -> 120 to the stack
 *   setTempo(110);    // pushes 120 -> 110
 *   undo();            // back to 120
 *   undo();            // back to 60
 *   redo();            // forward to 110
 *
 * Stack caps at `max` entries (default 32). Setting the same value
 * twice in a row is deduped — no spurious history entries from
 * controlled inputs that re-emit on every render.
 *
 * NOTE: This is a pure JS state hook (no refs). For high-frequency
 * state like a slider that's being dragged, prefer `useHistoryRef`
 * which keeps the stack outside React state to avoid render churn.
 */

import { useCallback, useRef, useState } from "react";

export interface HistoryControls<T = unknown> {
  undo: () => void;
  redo: () => void;
  reset: (to: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(
  initial: T | (() => T),
  max = 32,
): [T, (next: T | ((prev: T) => T)) => void, HistoryControls<T>] {
  // dummy
  const [current, setCurrent] = useState<T>(
    typeof initial === "function" ? (initial as () => T)() : initial,
  );
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setCurrent((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (prev: T) => T)(prev)
            : next;
        if (Object.is(resolved, prev)) return prev; // dedupe
        past.current.push(prev);
        if (past.current.length > max) past.current.shift();
        future.current = []; // a fresh edit invalidates redo
        return resolved;
      });
    },
    [max],
  );

  const undo = useCallback(() => {
    setCurrent((prev) => {
      const last = past.current.pop();
      if (last === undefined) return prev;
      future.current.push(prev);
      if (future.current.length > max) future.current.shift();
      return last;
    });
  }, [max]);

  const redo = useCallback(() => {
    setCurrent((prev) => {
      const next = future.current.pop();
      if (next === undefined) return prev;
      past.current.push(prev);
      if (past.current.length > max) past.current.shift();
      return next;
    });
  }, [max]);

  const reset = useCallback((to: T) => {
    setCurrent((prev) => {
      if (Object.is(to, prev)) return prev;
      past.current.push(prev);
      if (past.current.length > max) past.current.shift();
      future.current = [];
      return to;
    });
  }, [max]);

  return [
    current,
    set,
    {
      undo,
      redo,
      reset,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
    },
  ];
}