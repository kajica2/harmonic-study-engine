import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Trophy } from "lucide-react";
import { StageFrame } from "./StageFrame";
import {
  createStageSession,
  processBlock,
  startAudioCapture,
  type StageSession,
} from "../lib/trumpetStageTrainer";
import type { StageConfig } from "../lib/trumpetStage";
import type { HarmonicPath } from "../lib/paths";
import { autoStageConfig } from "../lib/autoStage";

interface Props {
  onClose: () => void;
  initialConfig?: StageConfig;
  /** Optional active path — when provided, the modal auto-derives a
   *  chord + degree sequence from path.key + path.steps[].notes
   *  histogram when no initialConfig is supplied. */
  path?: HarmonicPath;
}

function defaultConfig(): StageConfig {
  return {
    chordRoot: "C",
    chordQuality: "maj7",
    degreeSequence: ["1", "3", "5", "7", "9"],
    perNoteToleranceCents: 7,
    sustainSeconds: 0.6,
    timeoutSeconds: 15,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/**
 * TrumpetStageModal — live mic tuner that walks the player through a
 * scale-degree sequence over a chosen chord. Each played note is
 * graded for in-tune / wrong-tone / miss / timeout and the score
 * card updates in real time.
 *
 * Mic capture runs through the existing Web Audio stack (same shape
 * as audioRecorder.ts). Stopping closes the AudioContext + mic
 * stream.
 */
export const TrumpetStageModal: React.FC<Props> = ({
  onClose,
  initialConfig,
  path,
}) => {
  // Resolve config: explicit initialConfig > path-derived > hardcoded
  // default. Memoized per path identity so changing steps but not
  // chord doesn't reset the session.
  const resolvedConfig = useMemo<StageConfig>(() => {
    if (initialConfig) return initialConfig;
    if (path) return autoStageConfig(path);
    return defaultConfig();
  }, [initialConfig, path]);

  const [session, setSession] = useState<StageSession>(() =>
    createStageSession(resolvedConfig),
  );
  const cleanupRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  const start = async () => {
    setError(null);
    try {
      const fresh = createStageSession(resolvedConfig);
      fresh.status = "running";
      setSession({ ...fresh });
      sessionRef.current = fresh;
      const stop = await startAudioCapture((block) => {
        const next = processBlock(
          sessionRef.current,
          block,
          performance.now(),
        );
        sessionRef.current = next;
        // Throttle React state — re-render at most every ~250 ms.
        const last = next._lastRender ?? 0;
        if (performance.now() - last > 250) {
          next._lastRender = performance.now();
          setSession({ ...next });
        }
      });
      cleanupRef.current = stop;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the tuner.",
      );
      setSession((s) => ({ ...s, status: "stopped" }));
    }
  };

  const stop = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setSession((s) => ({ ...s, status: "stopped" }));
  };

  const isRunning = session.status === "running";
  const active = session.active;
  const attempts = session.attempts;
  const hits = attempts.filter((a) => a.outcome === "hit").length;
  const wrongs = attempts.filter((a) => a.outcome === "wrong").length;
  const misses = attempts.filter((a) => a.outcome === "miss").length;
  const timeouts = attempts.filter((a) => a.outcome === "timeout").length;

  return (
    <StageFrame
      accent
      eyebrow="Trumpet Stage"
      title={`${session.config.chordRoot}${session.config.chordQuality}`}
      meta={
        path && !initialConfig
          ? `auto: "${truncate(path.title, 24)}" · ${attempts.length} attempts · ${hits} hit · ±${session.config.perNoteToleranceCents}¢`
          : `${attempts.length} attempts · ${hits} hit · ±${session.config.perNoteToleranceCents}¢`
      }
      actions={
        <button
          onClick={isRunning ? stop : start}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] text-xs hover:bg-[color:var(--color-brand-strong)] transition-colors"
          aria-label={isRunning ? "Stop tuner" : "Start tuner"}
        >
          {isRunning ? <Square size={12} /> : <Mic size={12} />}
          {isRunning ? "Stop" : "Start"}
        </button>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="text-[11px] text-red-400 t-mono">{error}</div>
        )}

        <div className="surface-2 border rounded-[var(--radius-sm)] px-3 py-2 text-xs flex items-center justify-between">
          <span className="text-[color:var(--color-text-3)]">Next target:</span>
          {active ? (
            <span className="t-mono">
              {active.targetPc}
              {active.targetOctave}{" "}
              <span className="text-[color:var(--color-text-3)]">
                ({active.degree})
              </span>
            </span>
          ) : (
            <span className="text-[color:var(--color-text-3)]">—</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-[10px] t-mono text-[color:var(--color-text-3)]">
          <span>Degrees: {session.config.degreeSequence.join(" ")}</span>
          <span>Tolerance: ±{session.config.perNoteToleranceCents}¢</span>
          <span>Sustain: {session.config.sustainSeconds}s</span>
          <span>Timeout: {session.config.timeoutSeconds}s</span>
        </div>

        <ol className="t-mono text-[10px] space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
          {attempts.length === 0 && (
            <li className="text-[color:var(--color-text-3)] italic">
              No attempts yet — press Start and play through the degree
              sequence.
            </li>
          )}
          {attempts.map((a, i) => {
            const tone = (
              {
                hit: "text-emerald-300",
                wrong: "text-rose-300",
                miss: "text-amber-300",
                timeout: "text-neutral-500",
              } as const
            )[a.outcome];
            return (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-[color:var(--color-text-3)] w-6 text-right">
                  {i + 1}
                </span>
                <span className="w-8 text-[color:var(--color-text-2)]">
                  {a.degree}
                </span>
                <span className="w-10">
                  {a.targetPc}
                  {a.targetOctave}
                </span>
                <span className={`w-16 ${tone}`}>{a.outcome}</span>
                <span className="text-[color:var(--color-text-3)]">
                  {a.avgCents !== null
                    ? `${a.avgCents >= 0 ? "+" : ""}${a.avgCents.toFixed(1)}¢`
                    : "—"}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-3 text-[10px] t-mono text-[color:var(--color-text-3)]">
          <Trophy size={12} className="text-emerald-300" />
          <span>Hits: {hits}</span>
          <span className="text-rose-300">Wrong: {wrongs}</span>
          <span className="text-amber-300">Miss: {misses}</span>
          <span className="text-neutral-500">Timeout: {timeouts}</span>
        </div>

        <button
          onClick={onClose}
          className="text-[10px] t-mono text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
        >
          Close
        </button>
      </div>
    </StageFrame>
  );
};

export default TrumpetStageModal;