/**
 * src/hooks/usePlayedCorrectly.ts - PRD-001 Phase 7 S3 (D129/D135):
 * the played-correctly detection hook. THIN ADAPTER - wiring only
 * (docs/PHASE-7-S3-DETECTION.md section 3.5). All matching math lives
 * in engine/practice/detect.ts; the grid is BUILT by the App via
 * src/lib/practiceExpected.
 *
 * The model (section 4 data flow):
 *   window "midin" CustomEvent (D135.1 - identical data to the
 *   in-process listener path, and the ONLY seam injectable from
 *   outside; the e2e positive leg depends on this) pushes
 *   {note, atMs: detail.timestamp} into a ref buffer - O(1), zero
 *   render. playbackClock.subscribe is the READ-ONLY boundary
 *   observer (TD-052): the transport step flip is stamped with
 *   performance.now() (the D129 anchor) and drained through the pure
 *   matcher. State mirrors (perBar + phrase) update at BOUNDARIES
 *   ONLY (D135.6) - never per note.
 *
 * Pinned internals (D135, all section 3.5):
 *   1 bass-channel note-ons skipped (the shipped useGuideToneTrail
 *     exclusion, same prop, same law); note-offs ignored (onset-only
 *     matching); velocity is NOT gated (midiIn already drops 0).
 *   2 buffer drained per flush; notes older than 2 bars dropped
 *     (late-arrival guard; the 4/4 heuristic bar length is a coarse
 *     drop window by design - the meter is not a hook input).
 *   3 visibilitychange -> hidden: buffer dropped + next boundary
 *     skipped (rAF freezes while hidden, the transport does not; the
 *     stale anchor would mis-blame every note - D129 guard).
 *   4 pass end = the observed step returning to the grid head after
 *     the pass progressed; the verdict fires onPass ONLY when the
 *     pass has expected notes (the D132 no-verdict law lives HERE,
 *     jsdom-pinnable: zero-expected passes stay SILENT).
 *   5 StrictMode: every addEventListener has its exact inverse in
 *     cleanup; capture refs are per-mount, never module-level.
 *   6 TD-052 read-only pin: the clock appears ONLY as .subscribe -
 *     this file never writes transport state (grep gate, docs
 *     section 9 item 8).
 *
 * Deviations from the 3.5 sketch (reported, minimal):
 *   - grid entries FREEZE per bar at boundary-stamp time, so the App
 *     may rebuild the live grid every bar (the pause duty phase is
 *     dynamic, D130) without poisoning already-scored bars, and an
 *     AB slot flip (new span head) ends the pass cleanly at the wrap.
 *   - hasDevice flips true on the FIRST observed note-on event
 *     instead of polling the input list: status-line-only (D135.4),
 *     reactive, and it keeps this file free of the in-process
 *     listener API (D135.1 - the window event is the only source).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { playbackClock, type TickDetail } from "../lib/playbackClock";
import type { MidiInEvent } from "../lib/midiIn";
import {
  matchPhrase,
  type BarMatch,
  type ExpectedBar,
  type PerformedNote,
  type PhraseMatch,
} from "../../engine/practice/detect";

export interface UsePlayedCorrectly {
  enabled: boolean;
  /** REQ-PRAC-54: no Web MIDI API at all (the honest-unavailable state). */
  unavailable: boolean;
  /** Status line only (D135.4): a MIDI input has been observed. */
  hasDevice: boolean;
  /** State mirror of the pass so far, updated at boundaries ONLY. */
  perBar: readonly BarMatch[];
  /** Last completed pass WITH expected notes (D132: zero-expected
   *  passes never land here - the no-verdict law). */
  phrase: PhraseMatch | null;
  /** Boundary evaluation seam: clock ticks + jsdom tests + pause. */
  flushNow(): void;
  /** Play-start edge reset (contract 3.5). */
  resetRun(): void;
}

export interface UsePlayedCorrectlyArgs {
  enabled: boolean;
  /** Built by the App (practiceExpected); frozen per bar at stamp. */
  grid: ExpectedBar[];
  tempo: number;
  /** THE single-sum compensation (practiceLatency.compensationOf). */
  latencyCompensationMs: number;
  toleranceMs: number;
  /** Exclusion precedent (useGuideToneTrail); null = no exclusion. */
  bassMidiChannel: number | null;
  isPlayingAuto: boolean;
  /** Verdict routing lives in the App (D132); called once per pass. */
  onPass: (m: PhraseMatch) => void;
}

const EMPTY_BARS: readonly BarMatch[] = [];

/** Storm cap for the live capture buffer (D135.6 guard rail). */
const BUFFER_CAP = 512;

/** 4/4 heuristic for the stale-drop guard ONLY: barMs = THIS / tempo. */
const BAR_MS_44 = 240_000;

/** Kind fallback when the live grid shrinks mid-pass (never crash). */
const UNSCORED_ENTRY: ExpectedBar = { bar: -1, kind: "free", pcs: [] };

function midiInAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as { requestMIDIAccess?: unknown };
  return typeof nav.requestMIDIAccess === "function";
}

export function usePlayedCorrectly(
  args: UsePlayedCorrectlyArgs,
): UsePlayedCorrectly {
  const [perBar, setPerBar] = useState<readonly BarMatch[]>(EMPTY_BARS);
  const [phrase, setPhrase] = useState<PhraseMatch | null>(null);
  const [hasDevice, setHasDevice] = useState(false);

  const unavailable = !midiInAvailable();

  // Live arg mirrors (the shipped ref-mirror pattern): the
  // subscription binds ONCE per arm toggle, everything else is read
  // through refs so a tempo/grid/config change never re-subscribes
  // mid-pass.
  const gridRef = useRef(args.grid);
  gridRef.current = args.grid;
  const enabledRef = useRef(args.enabled);
  enabledRef.current = args.enabled;
  const tempoRef = useRef(args.tempo);
  tempoRef.current = args.tempo;
  const compRef = useRef(args.latencyCompensationMs);
  compRef.current = args.latencyCompensationMs;
  const tolRef = useRef(args.toleranceMs);
  tolRef.current = args.toleranceMs;
  const bassRef = useRef(args.bassMidiChannel);
  bassRef.current = args.bassMidiChannel;
  const playingRef = useRef(args.isPlayingAuto);
  playingRef.current = args.isPlayingAuto;
  const onPassRef = useRef(args.onPass);
  onPassRef.current = args.onPass;

  // Per-mount capture + pass state (D135.5: NEVER module-level).
  const bufferRef = useRef<PerformedNote[]>([]);
  const notesRef = useRef<PerformedNote[]>([]);
  const boundariesRef = useRef<number[]>([]);
  const passGridRef = useRef<ExpectedBar[]>([]);
  const lastStepRef = useRef<number | null>(null);
  const progressedRef = useRef(false);
  const skipNextRef = useRef(false);
  const deviceSeenRef = useRef(false);

  const barMs = useCallback((): number => {
    const t = tempoRef.current;
    return t > 0 ? BAR_MS_44 / t : 2000;
  }, []);

  /** Pin 2: drain the capture buffer into the pass; notes older than
   *  2 bars are dropped (late-arrival guard). */
  const drainBuffer = useCallback(
    (now: number): void => {
      const buf = bufferRef.current;
      if (buf.length === 0) return;
      const cutoff = now - 2 * barMs();
      const pass = notesRef.current;
      for (let i = 0; i < buf.length; i++) {
        const n = buf[i];
        if (n.atMs >= cutoff) pass.push(n);
      }
      bufferRef.current = [];
    },
    [barMs],
  );

  const resetPass = useCallback((): void => {
    notesRef.current = [];
    boundariesRef.current = [];
    passGridRef.current = [];
    progressedRef.current = false;
  }, []);

  /** Pure derivation over the stamped prefix + setPerBar (the ONE
   *  boundary mirror write - D135.6). */
  const evaluate = useCallback((): PhraseMatch | null => {
    const n = boundariesRef.current.length;
    if (n === 0) {
      setPerBar(EMPTY_BARS);
      return null;
    }
    const m = matchPhrase({
      expected: passGridRef.current.slice(0, n),
      boundariesMs: boundariesRef.current.slice(0, n),
      performed: notesRef.current,
      toleranceMs: tolRef.current,
      latencyCompensationMs: compRef.current,
    });
    setPerBar(m.bars);
    return m;
  }, []);

  /** Stamp the start of grid position `pos` (the live grid entry is
   *  frozen HERE - later rebuilds never touch scored bars) then
   *  drain + evaluate. */
  const beginBarAt = useCallback(
    (pos: number, now: number): void => {
      const live = gridRef.current;
      boundariesRef.current.push(now);
      passGridRef.current.push(live[pos] ?? UNSCORED_ENTRY);
      if (pos > 0) progressedRef.current = true;
      drainBuffer(now);
      evaluate();
    },
    [drainBuffer, evaluate],
  );

  /** Pass end: final evaluation over the frozen grid, verdict out
   *  (pin 4: ONLY with expected notes), then a fresh pass at the
   *  head stamped with THIS boundary. */
  const endPass = useCallback(
    (now: number): void => {
      drainBuffer(now);
      const m = evaluate();
      resetPass();
      const live = gridRef.current;
      if (live.length > 0) {
        boundariesRef.current.push(now);
        passGridRef.current.push(live[0]);
      }
      if (m !== null && m.expectedTotal > 0) {
        setPhrase(m);
        onPassRef.current(m);
      }
    },
    [drainBuffer, evaluate, resetPass],
  );

  const flushNow = useCallback((): void => {
    if (!enabledRef.current) return; // disarmed = inert (no listeners either)
    const now = performance.now();
    const live = gridRef.current;
    if (live.length === 0) return;
    const stamped = boundariesRef.current.length;
    if (stamped === 0) {
      beginBarAt(0, now);
      return;
    }
    if (stamped < live.length) {
      beginBarAt(stamped, now);
      return;
    }
    endPass(now);
  }, [beginBarAt, endPass]);

  const resetRun = useCallback((): void => {
    bufferRef.current = [];
    resetPass();
    lastStepRef.current = null;
    skipNextRef.current = false;
    setPerBar(EMPTY_BARS);
    setPhrase(null);
  }, [resetPass]);

  /** The clock-observed boundary (D129 pin): the flip INTO the grid
   *  head after the pass progressed is the pass end; sequential
   *  advances stamp their bar; anything else (seek, skipped
   *  boundary, mid-pass span change) resyncs - a partial pass is
   *  discarded, never mis-scored. */
  const flushAtStep = useCallback(
    (step: number, now: number): void => {
      const live = gridRef.current;
      if (live.length === 0) return;
      const pos = live.findIndex((g) => g.bar === step);
      if (pos === 0 && progressedRef.current && boundariesRef.current.length > 0) {
        endPass(now);
        return;
      }
      if (pos >= 0 && pos === boundariesRef.current.length) {
        beginBarAt(pos, now);
        return;
      }
      if (pos === -1) return; // outside the scored span: no boundary
      resetPass();
      if (pos === 0) beginBarAt(0, now);
    },
    [beginBarAt, endPass, resetPass],
  );

  useEffect(() => {
    if (!args.enabled) return;
    const onMidin = (e: Event): void => {
      const detail = (e as CustomEvent<Partial<MidiInEvent> | undefined>).detail;
      if (!detail || detail.type !== "noteon") return; // pin 1: onset-only
      if (typeof detail.note !== "number" || !Number.isInteger(detail.note)) return;
      const bass = bassRef.current;
      if (bass !== null && detail.channel === bass) return; // pin 1
      const atMs =
        typeof detail.timestamp === "number" && Number.isFinite(detail.timestamp)
          ? detail.timestamp
          : performance.now();
      const buf = bufferRef.current;
      buf.push({ note: detail.note, atMs });
      if (buf.length > BUFFER_CAP) buf.splice(0, buf.length - BUFFER_CAP);
      if (!deviceSeenRef.current) {
        deviceSeenRef.current = true;
        setHasDevice(true); // ONE state touch, first event ever
      }
    };
    const onTick = (d: TickDetail): void => {
      if (!d.isRunning) return;
      if (skipNextRef.current) {
        // Pin 3 (D129 guard): the first flip after a tab-hide carries
        // a stale anchor - skip the boundary, keep the step fresh.
        skipNextRef.current = false;
        lastStepRef.current = d.step;
        return;
      }
      if (!playingRef.current) return;
      if (d.step === lastStepRef.current) return;
      lastStepRef.current = d.step;
      flushAtStep(d.step, performance.now());
    };
    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.hidden) {
        bufferRef.current = [];
        skipNextRef.current = true;
      }
    };
    window.addEventListener("midin", onMidin);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = playbackClock.subscribe(onTick);
    return () => {
      window.removeEventListener("midin", onMidin);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [args.enabled, flushAtStep]);

  // Disarming clears the mirrors (the overlay must not linger).
  useEffect(() => {
    if (!args.enabled) {
      bufferRef.current = [];
      resetPass();
      setPerBar(EMPTY_BARS);
      setPhrase(null);
    }
  }, [args.enabled, resetPass]);

  return {
    enabled: args.enabled,
    unavailable,
    hasDevice,
    perBar,
    phrase,
    flushNow,
    resetRun,
  };
}
