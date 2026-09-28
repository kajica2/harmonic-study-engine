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
  inputId?: string;
}

function midin(
  note: number,
  type: MidinDetail["type"],
  channel: number,
  inputId = "test-in",
  offsetMs = 0,
): void {
  const detail: MidinDetail = {
    note,
    type,
    channel,
    timestamp: performance.now() + offsetMs,
    inputId,
  };
  window.dispatchEvent(
    new CustomEvent("midin", {
      detail: { velocity: 90, inputName: "test", ...detail },
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

function renderDetect(
  over: Partial<{
    enabled: boolean;
    grid: ExpectedBar[];
    fallbackInputEnabled: boolean;
    fallbackCompensationMs: number | null;
  }> = {},
) {
  const passes: PhraseMatch[] = [];
  const hook = renderHook(() =>
    usePlayedCorrectly({
      enabled: over.enabled ?? true,
      grid: over.grid ?? GRID,
      tempo: 120,
      latencyCompensationMs: 0,
      fallbackInputEnabled: over.fallbackInputEnabled ?? false,
      fallbackCompensationMs: over.fallbackCompensationMs ?? null,
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
    const baseArgs = {
      enabled: true,
      grid: GRID,
      tempo: 120,
      latencyCompensationMs: 0,
      fallbackInputEnabled: false,
      fallbackCompensationMs: null,
      toleranceMs: 120,
      bassMidiChannel: 2,
      isPlayingAuto: true,
    };
    const a = renderHook(() =>
      usePlayedCorrectly({ ...baseArgs, onPass: (m) => passesA.push(m) }),
    );
    const b = renderHook(() =>
      usePlayedCorrectly({ ...baseArgs, onPass: (m) => passesB.push(m) }),
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

/**
 * PRD-001 Phase 7 S4 (D138/D141): the fallback-source widenings.
 * jsdom ships NO navigator.requestMIDIAccess, so midiInAvailable()
 * is false here by default - exactly the laptop-only user the D138
 * gate exists for.
 */
describe("usePlayedCorrectly S4 (D138/D141)", () => {
  it("hse-* events flow into the buffer WITH the fallback compensation stamped", () => {
    // The late tap (+130 ms past the boundary) MATCHES only because
    // the buffered note carries compensationMs 50 - the fallback
    // path's own number - while the GLOBAL stays 0. Uncalibrated
    // (null -> 0) the same tap misses: the stamp is load-bearing.
    const calibrated = renderDetect({ fallbackCompensationMs: 50 });
    act(() => midin(63, "noteon", 0, "hse-keyboard", 130));
    act(() => calibrated.result.current.flushNow());
    expect(calibrated.result.current.perBar[0]?.matchedPcs).toContain(3);
    calibrated.unmount();

    const uncalibrated = renderDetect({ fallbackCompensationMs: null });
    act(() => midin(63, "noteon", 0, "hse-screen", 130));
    act(() => uncalibrated.result.current.flushNow());
    expect(uncalibrated.result.current.perBar[0]?.matchedPcs ?? []).not.toContain(3);
    expect(uncalibrated.result.current.perBar[0]?.extraPcs).toContain(3);
    uncalibrated.unmount();
  });

  it("hardware events flow WITHOUT the override (fallback number never applies)", () => {
    // The scored BUCKETS are the observable contract (startMs/avg are
    // wall-clock, deliberately not compared): a hardware note scored
    // with global 50 is IDENTICAL whether the fallback number is 0,
    // null or 999 - hardware never carries the hse stamp (engine law
    // 4 keeps the global). And with global 0 / fallback 50 the SAME
    // hardware tap MISSES while an hse tap matches (test above):
    // the two paths provably carry their own numbers.
    const runHw = (over: { global: number; fb: number | null }) => {
      const h = renderHook(() =>
        usePlayedCorrectly({
          enabled: true,
          grid: GRID,
          tempo: 120,
          latencyCompensationMs: over.global,
          fallbackInputEnabled: true,
          fallbackCompensationMs: over.fb,
          toleranceMs: 120,
          bassMidiChannel: 2,
          isPlayingAuto: true,
          onPass: () => {},
        }),
      );
      act(() => {
        midin(63, "noteon", 1, "real-device", 130);
        midin(70, "noteon", 1, "real-device", 10);
      });
      act(() => h.result.current.flushNow());
      const bar = h.result.current.perBar[0];
      const buckets = {
        matchedPcs: [...(bar?.matchedPcs ?? [])],
        missedPcs: [...(bar?.missedPcs ?? [])],
        extraPcs: [...(bar?.extraPcs ?? [])],
        wrongPcs: [...(bar?.wrongPcs ?? [])],
      };
      h.unmount();
      return buckets;
    };
    expect(runHw({ global: 50, fb: 0 })).toEqual(runHw({ global: 50, fb: 999 }));
    expect(runHw({ global: 50, fb: null })).toEqual(runHw({ global: 50, fb: 0 }));
    // Sanity: the fixture is load-bearing both ways.
    expect(runHw({ global: 50, fb: 0 }).matchedPcs).toContain(3);
    const uncomp = runHw({ global: 0, fb: 50 });
    expect(uncomp.matchedPcs).not.toContain(3);
    expect(uncomp.extraPcs).toContain(3); // timing error, right pitch
  });

  it("hasDevice stays HARDWARE-only on hse events; sawFallback is the new signal", () => {
    const { result, unmount } = renderDetect({ fallbackInputEnabled: true });
    expect(result.current.hasDevice).toBe(false);
    expect(result.current.sawFallback).toBe(false);
    act(() => midin(63, "noteon", 0, "hse-keyboard"));
    expect(result.current.hasDevice).toBe(false); // no lie about hardware
    expect(result.current.sawFallback).toBe(true); // one-shot, reactive
    act(() => midin(65, "noteon", 0, "hse-screen"));
    expect(result.current.sawFallback).toBe(true); // no re-fire storm
    act(() => midin(67, "noteon", 1, "real-device"));
    expect(result.current.hasDevice).toBe(true); // hardware still flips it
    unmount();
  });

  it("D138 GATE PIN: unavailable false when fallbackInputEnabled and NO Web MIDI API", () => {
    // jsdom: requestMIDIAccess absent -> the API half is false.
    const off = renderDetect({ fallbackInputEnabled: false });
    expect(off.result.current.unavailable).toBe(true); // shipped behavior
    const on = renderDetect({ fallbackInputEnabled: true });
    expect(on.result.current.unavailable).toBe(false); // widened gate
    on.unmount();
    off.unmount();
  });
});
