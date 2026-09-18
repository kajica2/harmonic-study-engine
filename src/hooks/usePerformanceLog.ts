/**
 * src/hooks/usePerformanceLog.ts — live view over the performance log
 * (src/lib/performanceLog.ts).
 *
 * Reads the take list once, then re-reads after every mutation so the
 * UI reflects localStorage (the single source of truth). Kept tiny —
 * all logic lives in the pure lib module, which is what the unit tests
 * pin.
 */
import { useCallback, useState } from "react";
import {
  loadTakes,
  recordTake,
  recordGuideToneResult,
  clearTakes,
  updateTakeRating,
  type PerformanceTake,
} from "../lib/performanceLog";

export interface PerformanceLogApi {
  takes: PerformanceTake[];
  /** Append a take and return it (id is needed to attach later data,
   *  e.g. the guide-tone tally when the recording finishes). */
  record: (input: Omit<PerformanceTake, "id" | "recordedAt">) => PerformanceTake;
  /** Attach a finished guide-tone tally to an existing take. */
  trail: (
    id: string,
    result: { transitionsHit: number; transitionsMissed: number },
  ) => void;
  clear: () => void;
  rate: (id: string, rating: number | undefined) => void;
}

export function usePerformanceLog(): PerformanceLogApi {
  const [takes, setTakes] = useState<PerformanceTake[]>(() => loadTakes());

  const record = useCallback(
    (input: Omit<PerformanceTake, "id" | "recordedAt">) => {
      const take = recordTake(input);
      setTakes(loadTakes());
      return take;
    },
    [],
  );

  const trail = useCallback(
    (
      id: string,
      result: { transitionsHit: number; transitionsMissed: number },
    ) => {
      recordGuideToneResult(id, result);
      setTakes(loadTakes());
    },
    [],
  );

  const clear = useCallback(() => {
    clearTakes();
    setTakes([]);
  }, []);

  const rate = useCallback((id: string, rating: number | undefined) => {
    updateTakeRating(id, rating);
    setTakes(loadTakes());
  }, []);

  return { takes, record, trail, clear, rate };
}