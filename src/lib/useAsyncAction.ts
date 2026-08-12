import { useCallback, useRef, useState } from "react";

/**
 * useAsyncAction — a small helper for fire-and-forget work that
 * the user needs to be able to cancel.
 *
 * Returns:
 *   run(fn)        — kicks off the async work; returns a promise so
 *                    callers can await if they want.
 *   cancel(reason) — aborts the in-flight work. Safe to call when
 *                    nothing is running.
 *   status         — "idle" | "running" | "cancelled" | "error"
 *   error          — last error (cleared on next run)
 *
 * The work function receives an `AbortSignal`. Use it with `fetch()`
 * for network, or just check `signal.aborted` at loop boundaries.
 */
export type AsyncStatus = "idle" | "running" | "cancelled" | "error";

export function useAsyncAction() {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback((reason = "user-cancelled") => {
    controllerRef.current?.abort(reason);
  }, []);

  const run = useCallback(
    async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
      // Tear down any previous run.
      controllerRef.current?.abort("superseded");
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("running");
      setError(null);
      try {
        const out = await fn(controller.signal);
        if (controller.signal.aborted) {
          setStatus("cancelled");
          return null;
        }
        setStatus("idle");
        return out;
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus("cancelled");
          return null;
        }
        setError(err);
        setStatus("error");
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [],
  );

  return { run, cancel, status, error } as const;
}