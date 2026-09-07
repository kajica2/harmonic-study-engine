import { describe, it, expect } from "vitest";
import { reduceProbeResponse } from "../src/hooks/useDDSPProbe";

/**
 * useDDSPProbe — health-probe state for the DDSP backend.
 *
 * Tests pin the pure reducer; the hook itself is exercised by
 * the build (not unit-tested — fetch + AbortSignal + window
 * focus are all hard to mock without bloating the test infra).
 */

describe("reduceProbeResponse", () => {
  it("returns 'ok' when status is 'ok' and ddsp_version is set", () => {
    const state = reduceProbeResponse(
      true,
      200,
      { status: "ok", ddsp_version: "3.7.0" },
      null,
    );
    expect(state).toEqual({ state: "ok", ddspVersion: "3.7.0" });
  });

  it("returns 'degraded' when status is 'degraded'", () => {
    const state = reduceProbeResponse(
      true,
      200,
      { status: "degraded", ddsp_version: "unavailable" },
      null,
    );
    expect(state).toEqual({
      state: "degraded",
      ddspVersion: "unavailable",
    });
  });

  it("returns 'unreachable' on a non-200 HTTP", () => {
    const state = reduceProbeResponse(false, 500, null, null);
    expect(state).toEqual({ state: "unreachable", reason: "HTTP 500" });
  });

  it("returns 'unreachable' with the network error when ok=false + errorMsg", () => {
    const state = reduceProbeResponse(false, 0, null, "fetch failed");
    expect(state).toEqual({
      state: "unreachable",
      reason: "fetch failed",
    });
  });

  it("returns 'unreachable' on an empty / malformed body", () => {
    const state = reduceProbeResponse(true, 200, null, null);
    expect(state).toEqual({
      state: "unreachable",
      reason: "invalid /health response",
    });
  });

  it("falls back to 'unknown' ddsp_version when missing", () => {
    const state = reduceProbeResponse(true, 200, { status: "ok" }, null);
    expect(state).toEqual({ state: "ok", ddspVersion: "unknown" });
  });
});
