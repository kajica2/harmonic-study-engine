/**
 * src/hooks/usePlayedCorrectly.test.ts - PRD-001 Phase 7 S3
 * (docs/PHASE-7-S3-DETECTION.md section 8.1): the jsdom hook pins.
 * Synthetic "midin" CustomEvents + EXPLICIT flushNow() - the test
 * NEVER starts a clock (the flush API is the seam, docs section 12
 * handoff note). DOM-touching: listed in JSDOM_FILES in
 * vitest.config.ts (Vitest 5 ignores per-file env comments).
 */

import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayedCorrectly } from "./usePlayedCorrectly";
import { buildExpectedGrid, type ExpectedBar } from "../lib/practiceExpected";
import type { PhraseMatch } from "../../engine/practice/detect";

interface MidinDetail {
  note: number;
  type: "noteon" | "noteoff";
  channel: number;
  timestamp: number;
}

function midin(note: number, type: MidinDetail["type"], channel: number): void {
  const detail: MidinDetail = { note, type, channel, timestamp: performance.now() };
  window.dispatchEvent(
    new CustomEvent("midin", {
      detail: { velocity: 90, inputId: "test-in", inputName: "test", ...detail },
    }),
  );
}

// Cm7 bar (bass C -> 3rd Eb/pc3 + 7th Bb/pc10 expected) then Dm7 bar
// (bass D -> F/pc5 + C/pc0 expected). 2 target bars, expectedTotal 4.
const GRID: ExpectedBar[] = buildExpectedGrid(
  2,
  [
    [60, 63, 67, 70],
    [62, 65, 67, 72],
  ],
  null,
  new Set<number>(),
);

function renderDetect(over: Partial<{ enabled: boolean; grid: ExpectedBar[] }> = {}) {
  const passes: PhraseMatch[] = [];
  const hook = renderHook(() =>
    usePlayedCorrectly({
      enabled: over.enabled ?? true,
      grid: over.grid ?? GRID,
      tempo: 120,
      latencyCompensationMs: 0,
      toleranceMs: 120,
      bassMidiChannel: 2,
      isPlayingAuto: true,
      onPass: (m) => passes.push(m),
    }),
  );
  const flushPass = (): void => {
    // 2-bar grid: flush 1 stamps bar 0, flush 2 stamps bar 1,
    // flush 3 is the wrap boundary -> the pass verdict.
    act(() => hook.result.current.flushNow());
    act(() => hook.result.current.flushNow());
    act(() => hook.result.current.flushNow());
  };
  return { ...hook, passes, flushPass };
}

function setHidden(v: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => v });
}

afterEach(() => setHidden(false));

describe("usePlayedCorrectly (S3 section 8.1)", () => {
  it("synthetic midin events + explicit flushNow drive the perBar mirror and ONE pass verdict", () => {
    const { result, passes, flushPass, unmount } = renderDetect();
    act(() => midin(63, "noteon", 1)); // Eb = the Cm7 third
    act(() => result.current.flushNow());
    expect(result.current.perBar.length).toBe(1);
    expect(passes.length).toBe(0);
    act(() => result.current.flushNow());
    expect(result.current.perBar.length).toBe(2);
    expect(passes.length).toBe(0); // no verdict mid-pass
    act(() => result.current.flushNow()); // wrap
    expect(passes.length).toBe(1);
    expect(passes[0].matched).toBe(1);
    expect(passes[0].expectedTotal).toBe(4);
    expect(result.current.phrase).not.toBeNull();
    unmount();
  });

  it("the capture buffer drains exactly once per flush (no double counting)", () => {
    const { passes, flushPass, unmount } = renderDetect();
    act(() => midin(63, "noteon", 1));
    flushPass();
    expect(passes.length).toBe(1);
    expect(passes[0].matched).toBe(1);
    expect(passes[0].assignedNotes).toBe(1); // drained, not re-seen
    unmount();
  });

  it("skips bassMidiChannel note-ons and ignores note-offs (pin 1)", () => {
    const { passes, flushPass, unmount } = renderDetect();
    act(() => midin(63, "noteon", 2)); // bass channel - excluded
    act(() => midin(70, "noteoff", 1)); // note-off - ignored
    flushPass();
    expect(passes.length).toBe(1);
    expect(passes[0].matched).toBe(0);
    expect(passes[0].assignedNotes).toBe(0);
    unmount();
  });

  it("resetRun clears the buffer AND the mirrors (play-start edge)", () => {
    const { result, passes, flushPass, unmount } = renderDetect();
    act(() => midin(63, "noteon", 1));
    act(() => result.current.flushNow());
    expect(result.current.perBar.length).toBe(1);
    act(() => result.current.resetRun());
    expect(result.current.perBar.length).toBe(0);
    expect(result.current.phrase).toBeNull();
    flushPass(); // the pre-reset note must NOT resurface
    expect(passes.length).toBe(1);
    expect(passes[0].matched).toBe(0);
    unmount();
  });

  it("unsubscribe is the exact inverse: unmount drops the listener, remount starts clean", () => {
    const first = renderDetect();
    first.unmount();
    act(() => midin(63, "noteon", 1)); // arrives with NO hook mounted
    const second = renderDetect();
    second.flushPass();
    expect(second.passes.length).toBe(1);
    expect(second.passes[0].matched).toBe(0); // stale note did not leak
    second.unmount();
  });

  it("StrictMode-style double mount processes each event once per hook", () => {
    const passesA: PhraseMatch[] = [];
    const passesB: PhraseMatch[] = [];
    const a = renderHook(() =>
      usePlayedCorrectly({
        enabled: true,
        grid: GRID,
        tempo: 120,
        latencyCompensationMs: 0,
        toleranceMs: 120,
        bassMidiChannel: 2,
        isPlayingAuto: true,
        onPass: (m) => passesA.push(m),
      }),
    );
    const b = renderHook(() =>
      usePlayedCorrectly({
        enabled: true,
        grid: GRID,
        tempo: 120,
        latencyCompensationMs: 0,
        toleranceMs: 120,
        bassMidiChannel: 2,
        isPlayingAuto: true,
        onPass: (m) => passesB.push(m),
      }),
    );
    act(() => midin(63, "noteon", 1));
    for (const h of [a, b]) {
      act(() => h.result.current.flushNow());
      act(() => h.result.current.flushNow());
      act(() => h.result.current.flushNow());
    }
    expect(passesA.length).toBe(1);
    expect(passesA[0].assignedNotes).toBe(1);
    expect(passesB.length).toBe(1);
    expect(passesB[0].assignedNotes).toBe(1);
    a.unmount();
    b.unmount();
  });

  it("visibilitychange hidden drops the buffer (pin 3, D129 guard)", () => {
    const { passes, flushPass, unmount } = renderDetect();
    act(() => midin(63, "noteon", 1));
    setHidden(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    flushPass();
    expect(passes.length).toBe(1);
    expect(passes[0].matched).toBe(0); // buffer dropped at hide
    unmount();
  });

  it("a zero-expected pass never fires onPass (D132 no-verdict law)", () => {
    // Power voicing (bass C + fifth G): NO guide tones -> "free" bar,
    // expectedTotal 0. Notes there are unscored and the pass is
    // SILENT (the ladder is untouched; silence about nothing).
    const freeGrid = buildExpectedGrid(1, [[60, 67]], null, new Set<number>());
    const { result, passes, unmount } = renderDetect({ grid: freeGrid });
    act(() => midin(63, "noteon", 1));
    act(() => result.current.flushNow()); // stamp the single bar
    act(() => result.current.flushNow()); // wrap -> zero-expected
    expect(passes.length).toBe(0);
    expect(result.current.phrase).toBeNull();
    unmount();
  });

  it("disabled hook subscribes to nothing: events and flushes are inert", () => {
    const { result, passes, flushPass, unmount } = renderDetect({ enabled: false });
    act(() => midin(63, "noteon", 1));
    flushPass();
    expect(passes.length).toBe(0);
    expect(result.current.perBar.length).toBe(0);
    expect(result.current.enabled).toBe(false);
    unmount();
  });
});
