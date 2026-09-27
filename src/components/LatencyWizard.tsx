/**
 * src/components/LatencyWizard.tsx - PRD-001 Phase 7 S3 (REQ-PRAC-40,
 * D134): the latency calibration wizard. ModalShell state machine
 *   idle -> gate -> arming -> rolling -> result -> saved
 *
 * The laws (docs/PHASE-7-S3-DETECTION.md D134, verbatim obligations):
 *   GATE: requires `typeof navigator.requestMIDIAccess === "function"`
 *     AND a device (the caller passes the shipped useMidiDevices input
 *     list - NO new permission flow; the Calibrate click itself is the
 *     user gesture midiIn.init() already listens for). Without a
 *     device: honest "Connect a MIDI input to calibrate" + the manual
 *     entry field (always available - the escape hatch and the e2e
 *     leg-3 path).
 *   ROLLING: fires N clicks (default 16, range 8..32) at the CURRENT
 *     beat period through audioEngine.playMetronomeClick - the SAME
 *     metronomeGain bus as practice: the measured path IS the practice
 *     path (handoff note). Emission performance.now() is recorded per
 *     click HERE (the engine never reads a clock); taps arrive on the
 *     window "midin" CustomEvent (D135.1 seam), first qualifying
 *     note-on within +/- half a beat pairs with its click, bass
 *     channel excluded (the shipped exclusion law).
 *   RESULT: inputLatencyMs = clamp(median(rawOffsets) - output, 0,
 *     500) via the pure engine math. Fewer than MIN_TAP_PAIRS valid
 *     pairs -> "not enough taps" retry, NEVER a silent 0 (honesty
 *     law). outputLatency = ctx.outputLatency ?? ctx.baseLatency ?? 0
 *     - WebAudio reports SECONDS, converted to ms (D134's pseudocode
 *     named the value outputLatencyMs; the unit conversion is the
 *     documented clarification, not a deviation).
 *   MANUAL OVERRIDE: numeric entry 0..500 ms on the result screen (and
 *     on the gate when no device exists); source "manual" stores
 *     output 0 so compensationOf() = the typed number exactly. The
 *     result screen's Save validates the DRAFT once edited (S3 fix
 *     round LOW-002): empty/garbage -> Save disabled, never a silent
 *     "0 ms manual" record.
 *   ABORT: Escape (ModalShell onDismiss -> unmount -> effect cleanup)
 *     and an 8 s idle watchdog - every interval/timeout/listener is
 *     torn down in the rolling effect's cleanup (no leaks, pinned by
 *     the timer-count test).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell, useModalLabel } from "./ModalShell";
import { audioEngine } from "../lib/audio";
import type { MidiInEvent } from "../lib/midiIn";
import {
  clampInputLatency,
  medianOffset,
  MIN_TAP_PAIRS,
} from "../../engine/practice/latency";
import { saveLatency, type LatencyRecord } from "../lib/practiceLatency";

type WizardPhase = "idle" | "gate" | "arming" | "rolling" | "result" | "saved";

export interface LatencyWizardProps {
  onClose: () => void;
  /** Current practice tempo (BPM) - the beat period the clicks ride. */
  tempo: number;
  /** Gate half 1: the Web MIDI API exists (REQ-PRAC-54 lineage). */
  hasMidiApi: boolean;
  /** Gate half 2: at least one MIDI INPUT device is present. */
  hasDevice: boolean;
  /** Display name for the stored record (selected input, best effort). */
  deviceName: string | null;
  /** Bass-channel exclusion (the shipped useGuideToneTrail law). */
  bassMidiChannel: number | null;
  /** Called after saveLatency so App re-reads the record (refresh seam). */
  onSaved: () => void;
}

/** D134 defaults + ranges (manual entry shares the 0..500 clamp). */
const DEFAULT_CLICKS = 16;
const CLICKS_MIN = 8;
const CLICKS_MAX = 32;
const MANUAL_MAX_MS = 500;
/** D134: 8 s without a click AND without a tap aborts the roll. */
const IDLE_ABORT_MS = 8_000;

interface RollResult {
  /** false = fewer than MIN_TAP_PAIRS valid pairs (never a fake 0). */
  ok: boolean;
  medianMs: number | null;
  inputMs: number;
  outputMs: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

/** Browser output latency in MS (D134): outputLatency preferred,
 *  baseLatency fallback (Firefox/Safari), 0 when no ctx / garbage.
 *  WebAudio's unit is SECONDS - the x1000 is the documented law. */
function outputLatencyMs(): number {
  const ctx = audioEngine.getCtx();
  if (ctx === null) return 0;
  const out = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
  const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
  const sec = out > 0 ? out : base;
  return Math.max(0, Math.round(sec * 1000));
}

export const LatencyWizard: React.FC<LatencyWizardProps> = ({
  onClose,
  tempo,
  hasMidiApi,
  hasDevice,
  deviceName,
  bassMidiChannel,
  onSaved,
}) => {
  const labelId = useModalLabel("latency-wizard");
  const [phase, setPhase] = useState<WizardPhase>("idle");
  const [clickCount, setClickCount] = useState(DEFAULT_CLICKS);
  const [emitted, setEmitted] = useState(0);
  const [paired, setPaired] = useState(0);
  const [result, setResult] = useState<RollResult | null>(null);
  const [draftMs, setDraftMs] = useState("");
  const [edited, setEdited] = useState(false);
  const [abortNote, setAbortNote] = useState<string | null>(null);

  const gateOk = hasMidiApi && hasDevice;

  // Live inputs the rolling effect must read WITHOUT re-subscribing
  // (a tempo/count change mid-roll never restarts the measurement).
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const countRef = useRef(clickCount);
  countRef.current = clickCount;
  const bassRef = useRef(bassMidiChannel);
  bassRef.current = bassMidiChannel;

  // Roll state (per-mount refs - the D135.5 StrictMode law).
  const pendingRef = useRef<number[]>([]);
  const pairsRef = useRef<{ click: number; tap: number }[]>([]);
  const tapNameRef = useRef<string | null>(null);

  const draftValid = (): boolean => {
    const raw = draftMs.trim();
    if (raw === "") return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= MANUAL_MAX_MS;
  };

  // idle -> gate -> arming: the gate AUTO-ADVANCES iff API + device
  // (calibrating with nothing to tap is theater - D134).
  useEffect(() => {
    if (phase === "idle") setPhase("gate");
  }, [phase]);
  useEffect(() => {
    if (phase === "gate" && gateOk) setPhase("arming");
  }, [phase, gateOk]);

  /** THE rolling session (D134): clicks out, taps in, pairs greedy-
   *  nearest within +/- half a beat. Everything tears down in the
   *  cleanup - interval, finish timer, watchdog, listener (Escape /
   *  unmount / phase change all land here; no leaked timers). */
  useEffect(() => {
    if (phase !== "rolling") return;

    const t = clampInt(tempoRef.current, 30, 240);
    const beatMs = 60_000 / t;
    const halfBeatMs = beatMs / 2;
    const total = clampInt(countRef.current, CLICKS_MIN, CLICKS_MAX);

    pendingRef.current = [];
    pairsRef.current = [];
    tapNameRef.current = null;
    setEmitted(0);
    setPaired(0);

    let intervalId: number | null = null;
    let finishId: number | null = null;
    let watchdogId: number | null = null;

    const resetWatchdog = (): void => {
      if (watchdogId !== null) window.clearTimeout(watchdogId);
      watchdogId = window.setTimeout(() => {
        setAbortNote("no taps observed - calibration stopped");
        setPhase("arming"); // cleanup tears the roll down
      }, IDLE_ABORT_MS);
    };

    const finalize = (): void => {
      const pairs = [...pairsRef.current].sort((a, b) => a.click - b.click);
      const clicks = pairs.map((p) => p.click);
      const taps = pairs.map((p) => p.tap);
      const median = medianOffset(clicks, taps); // null < MIN_TAP_PAIRS
      const outputMs = outputLatencyMs();
      const ok = median !== null;
      const inputMs = ok ? clampInputLatency(median, outputMs) : 0;
      setResult({ ok, medianMs: median, inputMs, outputMs });
      setEdited(false);
      setDraftMs(ok ? String(inputMs) : "");
      setPhase("result");
    };

    const emitClick = (): void => {
      const done = pendingRef.current.length + pairsRef.current.length;
      if (done >= total) {
        if (intervalId !== null) window.clearInterval(intervalId);
        intervalId = null;
        // Grace: one full beat for the LAST tap before finalizing.
        finishId = window.setTimeout(finalize, beatMs);
        return;
      }
      const at = performance.now();
      pendingRef.current.push(at);
      // SAME BUS as practice (handoff note): the measured path IS the
      // practice path. Accent every 4th click (downbeat convention).
      audioEngine.playMetronomeClick(done % 4 === 0);
      setEmitted(done + 1);
      resetWatchdog();
    };

    const onMidin = (e: Event): void => {
      const detail = (e as CustomEvent<Partial<MidiInEvent> | undefined>).detail;
      if (!detail || detail.type !== "noteon") return;
      if (typeof detail.note !== "number" || !Number.isInteger(detail.note)) return;
      const bass = bassRef.current;
      if (bass !== null && detail.channel === bass) return;
      const at =
        typeof detail.timestamp === "number" && Number.isFinite(detail.timestamp)
          ? detail.timestamp
          : performance.now();
      // Greedy NEAREST unpaired click within +/- half a beat (D134).
      let bestIdx = -1;
      let bestDist = halfBeatMs + 1;
      const pend = pendingRef.current;
      for (let i = 0; i < pend.length; i++) {
        const d = Math.abs(at - pend[i]);
        if (d <= halfBeatMs && d < bestDist) {
          bestIdx = i;
          bestDist = d;
        }
      }
      if (bestIdx === -1) return; // no click to answer - ignore
      const clickMs = pend[bestIdx];
      pend.splice(bestIdx, 1);
      pairsRef.current.push({ click: clickMs, tap: at });
      if (typeof detail.inputName === "string" && detail.inputName.length > 0) {
        tapNameRef.current = detail.inputName;
      }
      setPaired(pairsRef.current.length);
      resetWatchdog();
    };

    const onVisibility = (): void => {
      // A hidden tab cannot hear clicks; stop honestly, do not poison
      // the median with unobserved beats.
      if (document.hidden) {
        setAbortNote("tab hidden - calibration stopped");
        setPhase("arming");
      }
    };

    window.addEventListener("midin", onMidin);
    document.addEventListener("visibilitychange", onVisibility);
    resetWatchdog();
    emitClick(); // first click immediately, then one per beat
    intervalId = window.setInterval(emitClick, beatMs);

    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      if (finishId !== null) window.clearTimeout(finishId);
      if (watchdogId !== null) window.clearTimeout(watchdogId);
      window.removeEventListener("midin", onMidin);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase]);

  const startRoll = useCallback(() => {
    setAbortNote(null);
    setResult(null);
    setPhase("rolling");
  }, []);

  const save = useCallback(() => {
    const fromMidi = result !== null && result.ok && !edited;
    const inputMs = fromMidi
      ? result.inputMs
      : clampInt(Number(draftMs), 0, MANUAL_MAX_MS);
    const record: LatencyRecord = {
      version: 1,
      inputLatencyMs: inputMs,
      // Manual stores output 0: compensationOf() = the typed number
      // exactly (the single-sum law, practiceLatency).
      outputLatencyMs: fromMidi ? result.outputMs : 0,
      source: fromMidi ? "midi" : "manual",
      calibratedAtMs: Date.now(),
      deviceName: fromMidi ? tapNameRef.current ?? deviceName : null,
    };
    saveLatency(record);
    onSaved();
    setPhase("saved");
  }, [result, edited, draftMs, deviceName, onSaved]);

  // S3 FIX ROUND (LOW-002): once the draft is EDITED the median no
  // longer backs the save - the draft alone must validate. An
  // empty/garbled field would otherwise clampInt to a fake "0 ms
  // manual" record; Save goes DARK instead (the shipped <8-pairs
  // disabled-Save pattern, the same honesty law).
  const saveEnabled =
    result !== null && result.ok && !edited ? true : draftValid();

  return (
    <ModalShell labelledBy={labelId} onDismiss={onClose} className="w-full max-w-md rounded-[var(--radius-lg)] border border-[color:var(--color-border)] surface-1 p-4 shadow-2xl">
      <div data-testid="latency-wizard" data-phase={phase === "idle" ? "gate" : phase}>
        <h2
          id={labelId}
          className="text-sm font-semibold text-neutral-100 mb-1"
        >
          Latency calibration
        </h2>
        <p className="text-[11px] text-neutral-400 leading-snug mb-3">
          Play 16 clicks, tap any MIDI note on each one. The median
          offset (minus the browser&apos;s output latency) becomes your
          input latency - detection subtracts it automatically.
        </p>

        {abortNote !== null && phase === "arming" && (
          <div
            data-testid="wizard-abort"
            role="status"
            className="text-[11px] text-neutral-300 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 mb-2 surface-1"
          >
            {abortNote}
          </div>
        )}

        {(phase === "gate" || phase === "idle") && !gateOk && (
          <div data-testid="wizard-gate" className="flex flex-col gap-2">
            <p className="text-[11px] text-neutral-300 leading-snug">
              {!hasMidiApi
                ? "This browser has no Web MIDI API - calibrate by hand instead."
                : "Connect a MIDI input to calibrate."}{" "}
              You can enter the offset manually (0..500 ms) - it is used
              identically.
            </p>
            <ManualEntry
              draftMs={draftMs}
              setDraftMs={setDraftMs}
              saveEnabled={draftValid()}
              onSave={save}
            />
          </div>
        )}

        {(phase === "arming" ||
          ((phase === "gate" || phase === "idle") && gateOk)) && (
          <div data-testid="wizard-arming" className="flex flex-col gap-2">
            <p className="text-[11px] text-neutral-300 leading-snug">
              Ready: MIDI input {hasMidiApi && hasDevice ? "detected" : "required"}.
              Clicks ride the current tempo ({clampInt(tempo, 30, 240)} BPM)
              through the same metronome bus as practice.
            </p>
            <label className="flex items-center gap-1.5 text-[10px] t-mono text-neutral-400">
              Clicks
              <input
                type="number"
                min={CLICKS_MIN}
                max={CLICKS_MAX}
                step={1}
                aria-label="Calibration click count"
                data-testid="wizard-clicks"
                className="w-14 bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-1.5 py-1 text-xs t-mono text-neutral-200"
                value={clickCount}
                onChange={(e) =>
                  setClickCount(clampInt(Number(e.target.value), CLICKS_MIN, CLICKS_MAX))
                }
              />
            </label>
            <div>
              <button
                type="button"
                data-testid="wizard-start"
                onClick={startRoll}
                className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold border border-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] bg-[color:var(--color-brand-strong)] hover:opacity-90"
              >
                Start
              </button>
            </div>
          </div>
        )}

        {phase === "rolling" && (
          <div
            data-testid="wizard-rolling"
            role="status"
            aria-live="polite"
            className="flex flex-col gap-2"
          >
            <p className="text-[11px] text-neutral-200 t-mono">
              Listening... {emitted} clicks, {paired} taps.
            </p>
            <p className="text-[10px] text-neutral-400">
              Tap a MIDI note on every click. Escape or 8 s of silence
              stops the run.
            </p>
          </div>
        )}

        {phase === "result" && result !== null && (
          <div data-testid="wizard-result" className="flex flex-col gap-2">
            {result.ok ? (
              <p className="text-[11px] text-neutral-200 t-mono leading-snug">
                Median {Math.round(result.medianMs ?? 0)} ms | browser
                output {result.outputMs} ms | input latency{" "}
                {result.inputMs} ms
              </p>
            ) : (
              <p
                data-testid="wizard-not-enough"
                className="text-[11px] text-neutral-300 leading-snug"
              >
                not enough taps - at least {MIN_TAP_PAIRS} paired clicks
                are needed (never a silent 0). Retry, or enter a value
                by hand.
              </p>
            )}
            <ManualEntry
              draftMs={draftMs}
              setDraftMs={(v) => {
                setDraftMs(v);
                setEdited(true);
              }}
              saveEnabled={saveEnabled}
              onSave={save}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="wizard-retry"
                onClick={startRoll}
                className={secondaryBtn}
              >
                Retry
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 leading-snug">
              Browser-reported output latency excludes Bluetooth/USB
              buffering; calibration is per audio path - recalibrate
              when switching headphones or speakers.
            </p>
          </div>
        )}

        {phase === "saved" && (
          <div data-testid="wizard-saved" className="flex flex-col gap-2">
            <p role="status" className="text-[11px] text-neutral-200 leading-snug">
              Saved. Detection timing now subtracts it automatically -
              the panel shows when and via which device it was
              calibrated.
            </p>
            <div>
              <button
                type="button"
                data-testid="wizard-close"
                onClick={onClose}
                className={secondaryBtn}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

const secondaryBtn =
  "px-2 py-1 rounded-[var(--radius-sm)] text-xs t-mono border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 surface-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const ManualEntry: React.FC<{
  draftMs: string;
  setDraftMs: (v: string) => void;
  saveEnabled: boolean;
  onSave: () => void;
}> = ({ draftMs, setDraftMs, saveEnabled, onSave }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    <label className="flex items-center gap-1.5 text-[10px] t-mono text-neutral-400">
      ms
      <input
        type="number"
        min={0}
        max={MANUAL_MAX_MS}
        step={1}
        aria-label="Latency in milliseconds"
        data-testid="wizard-input-ms"
        className="w-16 bg-transparent border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-1.5 py-1 text-xs t-mono text-neutral-200"
        value={draftMs}
        onChange={(e) => setDraftMs(e.target.value)}
      />
    </label>
    <button
      type="button"
      disabled={!saveEnabled}
      data-testid="wizard-save"
      onClick={onSave}
      className={secondaryBtn}
    >
      Save
    </button>
  </div>
);
