import { useEffect, useRef, useState } from "react";
import type { PracticeSet, PracticeSession } from "../lib/paths";
import { playbackClock } from "../lib/playbackClock";
import { saveSession } from "../lib/practiceStore";
import { ALL_PATHS } from "../lib/paths";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  ChevronLeft,
} from "lucide-react";

interface Props {
  set: PracticeSet;
  options: {
    tempo: number;
    reps: number;
    transposeSemitones: number;
  };
  onStop: () => void;
  onStepChange: (pathIndex: number, stepIndex: number) => void;
}

interface PlayerState {
  currentItemIndex: number; // which PracticeSetItem we're on
  currentRep: number;        // 1-based
  isRunning: boolean;
  stepsCompleted: number;    // total steps played across all items/reps
  startTime: number;        // Date.now() when session started
}

/**
 * PracticeSessionPlayer takes over the playbackClock for the duration of a
 * practice set, walks through each path item step-by-step on each clock beat,
 * and writes a PracticeSession to localStorage on completion.
 *
 * The parent (App) still owns `activePathIndex` / `activeStepIndex` — we
 * emit new values via `onStepChange` so the canvas/keyboard/score always
 * render from the same state. The clock is shared: we configure it for the
 * practice sequence and stop + restore when done.
 */
export function PracticeSessionPlayer({
  set,
  options,
  onStop,
  onStepChange,
}: Props) {
  const { tempo, reps, transposeSemitones } = options;

  // Resolve path items to full HarmonicPath objects from ALL_PATHS
  const resolvedItems = set.items
    .map((item) => {
      const path = ALL_PATHS.find((p) => p.id === item.pathId);
      if (!path) return null;
      // Slice bars if startBar/endBar provided
      if (item.startBar != null || item.endBar != null) {
        const start = (item.startBar ?? 1) - 1;
        const end = item.endBar ?? path.steps.length;
        return {
          ...path,
          id: `${path.id}-slice-${start}-${end}`,
          title: `${path.title} (bars ${item.startBar ?? 1}–${item.endBar ?? path.steps.length})`,
          steps: path.steps.slice(start, end),
        };
      }
      return path;
    })
    .filter(Boolean) as typeof ALL_PATHS;

  if (resolvedItems.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No valid paths found in this set.
      </div>
    );
  }

  const totalStepsPerRep = resolvedItems.reduce(
    (sum, p) => sum + p.steps.length,
    0,
  );

  const [state, setState] = useState<PlayerState>({
    currentItemIndex: 0,
    currentRep: 1,
    isRunning: false,
    stepsCompleted: 0,
    startTime: Date.now(),
  });

  // Refs so callbacks always see the latest state without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Clock tick handler ────────────────────────────────────────────────────
  // We advance to the next step on each beat tick from playbackClock.
  // The clock drives one "step" per beat (1 step = 1 path step).
  const tickRef = useRef<(d: { step: number; beat: number }) => void>(
    () => {},
  );

  // ── Play / Pause ─────────────────────────────────────────────────────────
  function start() {
    const { currentItemIndex: ci, currentRep: cr } = stateRef.current;
    const path = resolvedItems[ci];

    // Configure clock for this path
    playbackClock.setTempo(tempo);
    playbackClock.setPathStepCount(path.steps.length);

    // Emit the initial step
    onStepChange(ci, 0);

    // Start the clock — it dispatches step=0 immediately via the rAF,
    // and our subscription fires on each step change.
    playbackClock.start();

    setState((s) => ({ ...s, isRunning: true }));
  }

  function pause() {
    playbackClock.stop();
    setState((s) => ({ ...s, isRunning: false }));
  }

  function stop() {
    playbackClock.stop();
    const { startTime, stepsCompleted } = stateRef.current;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    const session: PracticeSession = {
      setId: set.id,
      setTitle: set.title,
      completedAt: new Date().toISOString(),
      reps: reps - (stateRef.current.currentRep - 1),
      tempo,
      transposeSemitones,
      stepsCompleted,
      durationSeconds,
    };
    saveSession(session);

    setState((s) => ({ ...s, isRunning: false }));
    onStop();
  }

  // Advance one step (called by the clock tick subscription)
  function advanceStep() {
    const { currentItemIndex: ci, currentRep: cr, stepsCompleted } = stateRef.current;
    const path = resolvedItems[ci];
    const nextStepIndex = path.steps.length; // sentinel: no more steps in this path

    // Find where we are in the current path
    // We track step within path via the clock's own step counter
    // The clock dispatches on each step change; we read the step index from the tick
    setState((s) => {
      const newSteps = s.stepsCompleted + 1;
      const pathSteps = resolvedItems[s.currentItemIndex].steps.length;
      // How many steps have we done in the current path item?
      const stepsInCurrentItem = newSteps % pathSteps || pathSteps;

      // Check if current path item is done
      if (stepsInCurrentItem === pathSteps) {
        // Move to next item
        const nextItemIndex = s.currentItemIndex + 1;
        if (nextItemIndex >= resolvedItems.length) {
          // Rep done — check if more reps or finish
          if (s.currentRep < reps) {
            // Start next rep
            const nextRep = s.currentRep + 1;
            const firstItem = resolvedItems[0];
            playbackClock.setPathStepCount(firstItem.steps.length);
            playbackClock.setTempo(tempo);
            playbackClock.seekToStep(0);
            onStepChange(0, 0);
            return {
              ...s,
              currentItemIndex: 0,
              currentRep: nextRep,
              stepsCompleted: newSteps,
            };
          } else {
            // All done
            playbackClock.stop();
            const durationSeconds = Math.round((Date.now() - s.startTime) / 1000);
            const session: PracticeSession = {
              setId: set.id,
              setTitle: set.title,
              completedAt: new Date().toISOString(),
              reps: reps,
              tempo,
              transposeSemitones,
              stepsCompleted: newSteps,
              durationSeconds,
            };
            saveSession(session);
            return { ...s, isRunning: false, stepsCompleted: newSteps };
          }
        } else {
          // Next path item
          const nextPath = resolvedItems[nextItemIndex];
          playbackClock.setPathStepCount(nextPath.steps.length);
          playbackClock.setTempo(tempo);
          playbackClock.seekToStep(0);
          onStepChange(nextItemIndex, 0);
          return {
            ...s,
            currentItemIndex: nextItemIndex,
            stepsCompleted: newSteps,
          };
        }
      }

      // Still within current path item — step advances via clock tick (below)
      return s;
    });
  }

  // ── Clock subscription ────────────────────────────────────────────────────
  // We track the previous step to detect transitions.
  // playbackClock dispatches on EVERY rAF frame when running; we only care
  // when the step index changes.
  const prevStepRef = useRef<number>(-1);

  useEffect(() => {
    const off = playbackClock.subscribe((d) => {
      if (!stateRef.current.isRunning) return;
      // Detect step change
      if (d.step !== prevStepRef.current) {
        prevStepRef.current = d.step;
        const { currentItemIndex } = stateRef.current;
        const path = resolvedItems[currentItemIndex];
        if (!path) return;
        // If the clock's step is within the current path, emit it
        if (d.step < path.steps.length) {
          onStepChange(currentItemIndex, d.step);
          // Advance our global step counter (called once per clock step)
          advanceStep();
        }
      }
    });
    return off;
  }, [resolvedItems, onStepChange]);

  // ── Prev / Next buttons ───────────────────────────────────────────────────
  function prevStep() {
    const { currentItemIndex: ci, isRunning } = stateRef.current;
    const path = resolvedItems[ci];
    // Go to previous step; if at step 0 of current path, wrap to prev path
    const clockStep = prevStepRef.current;
    if (clockStep > 0) {
      playbackClock.seekToStep(clockStep - 1);
      onStepChange(ci, clockStep - 1);
      prevStepRef.current = clockStep - 1;
    } else if (ci > 0) {
      const prevPath = resolvedItems[ci - 1];
      playbackClock.setPathStepCount(prevPath.steps.length);
      playbackClock.seekToStep(prevPath.steps.length - 1);
      onStepChange(ci - 1, prevPath.steps.length - 1);
      prevStepRef.current = prevPath.steps.length - 1;
    }
  }

  function nextStep() {
    const { currentItemIndex: ci, isRunning } = stateRef.current;
    const path = resolvedItems[ci];
    const clockStep = prevStepRef.current;
    if (clockStep < path.steps.length - 1) {
      playbackClock.seekToStep(clockStep + 1);
      onStepChange(ci, clockStep + 1);
      prevStepRef.current = clockStep + 1;
    } else if (ci < resolvedItems.length - 1) {
      const nextPath = resolvedItems[ci + 1];
      playbackClock.setPathStepCount(nextPath.steps.length);
      playbackClock.seekToStep(0);
      onStepChange(ci + 1, 0);
      prevStepRef.current = 0;
    }
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      playbackClock.stop();
    };
  }, []);

  // ── Current step name ─────────────────────────────────────────────────────
  const currentPath = resolvedItems[state.currentItemIndex];
  const currentStepIndex = prevStepRef.current;
  const currentStep = currentPath?.steps[currentStepIndex];
  const currentPathIndex = ALL_PATHS.findIndex((p) => p.id === resolvedItems[state.currentItemIndex].id);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-purple-500/20 bg-purple-950/20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={stop}
          className="flex-shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-colors"
          title="Back to set browser"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-purple-200 truncate">
            {set.title}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            Rep {state.currentRep} of {reps} · {state.currentItemIndex + 1} of{" "}
            {resolvedItems.length} paths
          </div>
        </div>
        <div className="flex-shrink-0 text-xs font-mono text-neutral-600">
          {tempo} BPM
        </div>
      </div>

      {/* Current chord — prominent */}
      <div className="flex flex-col items-center gap-1 py-3">
        <div className="text-xs text-neutral-500 uppercase tracking-widest">
          {currentPath?.title.split(":")[0] ?? ""}
        </div>
        <div
          className="text-3xl font-bold text-purple-100 tracking-tight"
          style={{ textShadow: "0 0 20px rgba(168,85,247,0.5)" }}
        >
          {currentStep?.name ?? "—"}
        </div>
        <div className="text-xs text-neutral-600 font-mono">
          Step {currentStepIndex + 1} of {currentPath?.steps.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500/60 transition-all"
          style={{
            width: `${(state.stepsCompleted / (totalStepsPerRep * reps)) * 100}%`,
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={prevStep}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
          title="Previous step"
        >
          <SkipBack size={16} />
        </button>

        <button
          onClick={() =>
            state.isRunning ? pause() : start()
          }
          className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-colors ${
            state.isRunning
              ? "bg-white/10 text-neutral-200 hover:bg-white/15"
              : "bg-purple-600/80 text-white hover:bg-purple-500/80"
          }`}
        >
          {state.isRunning ? (
            <>
              <Pause size={14} className="fill-current" />
              Pause
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" />
              {state.stepsCompleted > 0 ? "Resume" : "Start"}
            </>
          )}
        </button>

        <button
          onClick={nextStep}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
          title="Next step"
        >
          <SkipForward size={16} />
        </button>

        <button
          onClick={stop}
          className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors ml-2"
          title="Stop and save session"
        >
          <Square size={14} className="fill-current" />
        </button>
      </div>

      {/* Step dots */}
      <div className="flex flex-wrap gap-1 justify-center">
        {resolvedItems.map((p, pi) =>
          p.steps.map((_, si) => (
            <div
              key={`${pi}-${si}`}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                pi === state.currentItemIndex
                  ? si === currentStepIndex
                    ? "bg-purple-400"
                    : si < currentStepIndex
                    ? "bg-purple-600/60"
                    : "bg-white/20"
                  : pi < state.currentItemIndex
                  ? "bg-purple-600/40"
                  : "bg-white/10"
              }`}
            />
          )),
        )}
      </div>
    </div>
  );
}
