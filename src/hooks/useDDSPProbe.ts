import { useEffect, useState } from "react";

/**
 * useDDSPProbe — health-probe state for the DDSP backend.
 *
 * The Harmonic Study Engine has a frontend on Vercel and a
 * backend on Render (or `bash dev.sh` locally). The static
 * deployment needs to know whether the user's local backend is
 * reachable so the API status pill can show green / amber / red.
 *
 * This hook runs a fetch to `<apiUrl>/health` on mount and on
 * every window-focus event (so a user who starts `bash dev.sh`
 * after loading the page sees the pill turn green without
 * reloading). State is one of four discriminated-union cases:
 *
 *   - "checking"      initial; pill shows a spinner
 *   - "ok"            backend reachable + DDSP installed
 *   - "degraded"      backend reachable + DDSP not installed
 *                     (/synthesize and /fx/reverb will 503)
 *   - "unreachable"   backend not reachable from the tab
 *                     (typically: bash dev.sh not running locally)
 *
 * Test surface: pure state machine once the fetch is mocked. The
 * hook itself is small enough that the unit tests focus on the
 * pure helper `reduceProbeResponse()` below.
 */

export type BackendState =
  | { state: "checking" }
  | { state: "ok"; ddspVersion: string }
  | { state: "degraded"; ddspVersion: string }
  | { state: "unreachable"; reason: string };

/**
 * Pure helper that maps a successful fetch response to the
 * discriminated union. Exposed for tests so we don't need to
 * mock fetch / AbortSignal in the unit-test layer.
 */
export function reduceProbeResponse(
  ok: boolean,
  status: number,
  body: { status?: string; ddsp_version?: string } | null,
  errorMsg: string | null,
): BackendState {
  if (!ok && errorMsg !== null) {
    return { state: "unreachable", reason: errorMsg };
  }
  if (!ok) {
    return { state: "unreachable", reason: `HTTP ${status}` };
  }
  const data = body;
  if (!data || typeof data !== "object") {
    return { state: "unreachable", reason: "invalid /health response" };
  }
  return {
    state: data.status === "ok" ? "ok" : "degraded",
    ddspVersion: data.ddsp_version ?? "unknown",
  };
}

/**
 * Run the health probe and subscribe to focus events. Returns
 * the current backend state. The state setter is intentionally
 * not exposed — consumers read `state` and re-render.
 *
 * Re-probes on every focus event so the pill updates without a
 * page reload when the user starts their backend mid-session.
 */
export function useDDSPProbe(apiUrl: string): BackendState {
  const [state, setState] = useState<BackendState>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(2500),
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ state: "unreachable", reason: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setState(reduceProbeResponse(true, res.status, data, null));
      } catch (err) {
        if (cancelled) return;
        setState({
          state: "unreachable",
          reason: err instanceof Error ? err.message : "fetch failed",
        });
      }
    };
    probe();
    window.addEventListener("focus", probe);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", probe);
    };
  }, [apiUrl]);

  return state;
}
