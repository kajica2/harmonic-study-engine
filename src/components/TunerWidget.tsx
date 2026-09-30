/**
 * src/components/TunerWidget.tsx — persistent, always-visible tuner.
 *
 * Fixed bottom-right widget. When off, renders a single Mic icon
 * button. When on, runs its own audio capture loop (via
 * startAudioCapture from trumpetStageTrainer) and displays the
 * detected note name + cents deviation on a compact dark panel.
 *
 * Pitch detection is delegated to detectPitch from trumpetTuner;
 * freqToNote converts frequency -> note name + cents.
 */

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import {
  subscribeTuner,
  TunerError,
  type TunerCaptureHandle,
} from "../lib/tunerCapture";
import { detectPitch, freqToNote } from "../lib/trumpetTuner";

interface TunerWidgetProps {
  isOn: boolean;
  onToggle: () => void;
}

/** Cents range mapped to the bar (±50 cents = full width). */
const CENTS_RANGE = 50;

type ErrorStatus =
  | "unsupported"
  | "insecure"
  | "denied"
  | "no-mic"
  | "suspended"
  | "unknown";

/** Mirror of the widget's error state for the pill + aria-live. */
interface ErrorState {
  status: ErrorStatus;
  message: string;
}

function centsColor(cents: number): string {
  const abs = Math.abs(cents);
  if (abs < 10) return "text-emerald-400";
  if (abs <= 25) return "text-amber-400";
  return "text-rose-400";
}

function barColor(cents: number): string {
  const abs = Math.abs(cents);
  if (abs < 10) return "bg-emerald-400";
  if (abs <= 25) return "bg-amber-400";
  return "bg-rose-400";
}

export function TunerWidget({ isOn, onToggle }: TunerWidgetProps) {
  const [noteName, setNoteName] = useState<string>("--");
  const [cents, setCents] = useState<number>(0);
  const [hasSignal, setHasSignal] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>({
    status: "unknown",
    message: "",
  });
  const stopRef = useRef<TunerCaptureHandle | null>(null);

  useEffect(() => {
    if (!isOn) {
      setNoteName("--");
      setCents(0);
      setHasSignal(false);
      setErrorState({ status: "unknown", message: "" });
      return;
    }

    let cancelled = false;
    let handle: TunerCaptureHandle | null = null;
    let sampleRate = 44100;

    (async () => {
      try {
        handle = await subscribeTuner((block) => {
          if (cancelled) return;
          const est = detectPitch(block, sampleRate);
          if (est.confidence < 0.5 || est.freq <= 0) {
            setHasSignal(false);
            return;
          }
          const ref = freqToNote(est.freq);
          if (!ref) {
            setHasSignal(false);
            return;
          }
          setHasSignal(true);
          setNoteName(`${ref.name}${ref.octave}`);
          setCents(Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, ref.cents)));
        });
        if (cancelled) {
          handle.stop();
          handle = null;
          return;
        }
        // Capture the real sample rate from the live handle now that
        // the graph is fully wired. This is the source of truth for
        // detectPitch; falls back to 44100 if the AudioContext was
        // somehow constructed with a 0-rate (test seam).
        sampleRate = handle.sampleRate() || 44100;
        stopRef.current = handle;
        // A successful subscribe clears any prior error.
        setErrorState({ status: "unknown", message: "" });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof TunerError) {
          setErrorState({
            status: err.kind as ErrorStatus,
            message: err.message,
          });
        } else {
          setErrorState({
            status: "unknown",
            message:
              err instanceof Error
                ? err.message
                : "Could not start the tuner.",
          });
        }
        setHasSignal(false);
      }
    })();

    return () => {
      cancelled = true;
      if (handle) {
        handle.stop();
        stopRef.current = null;
      }
    };
  }, [isOn]);

  // Bar position: 50% = in tune. Map cents (-50..+50) -> 0..100%.
  const barPct = 50 + (cents / CENTS_RANGE) * 50;
  const hasError = errorState.status !== "unknown";

  if (!isOn) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Enable tuner"
        title="Enable tuner"
        className="fixed bottom-4 right-4 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 shadow-lg transition-colors"
      >
        <Mic size={18} />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-stretch rounded-lg bg-neutral-900/95 border border-neutral-700 shadow-xl backdrop-blur overflow-hidden"
      role="status"
      aria-live={hasError ? "assertive" : "polite"}
      aria-label="Tuner"
    >
      <div className="flex flex-col justify-center px-3 py-2 min-w-[140px]">
        <div className="flex items-baseline gap-2">
          <span
            className={`t-mono text-xl font-bold leading-none ${
              hasError
                ? "text-rose-400"
                : hasSignal
                  ? centsColor(cents)
                  : "text-neutral-500"
            }`}
          >
            {hasError ? "!" : hasSignal ? noteName : "--"}
          </span>
          <span
            className={`t-mono text-xs leading-none ${
              hasError
                ? "text-rose-400"
                : hasSignal
                  ? centsColor(cents)
                  : "text-neutral-600"
            }`}
          >
            {hasError
              ? errorState.message
              : hasSignal
                ? `${cents >= 0 ? "+" : ""}${Math.round(cents)}¢`
                : "listening…"}
          </span>
        </div>
        <div
          className="mt-1.5 h-1 w-full rounded-full bg-neutral-800 relative overflow-hidden"
          aria-hidden="true"
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-600" />
          {hasSignal && !hasError && (
            <div
              className={`absolute top-0 bottom-0 w-1.5 -ml-[3px] rounded-full ${barColor(cents)}`}
              style={{ left: `${Math.max(0, Math.min(100, barPct))}%` }}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Disable tuner"
        title="Disable tuner"
        className="px-2 border-l border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors flex items-center"
      >
        <Mic size={14} />
      </button>
    </div>
  );
}
