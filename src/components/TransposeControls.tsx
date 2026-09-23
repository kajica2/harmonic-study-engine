/**
 * TransposeControls - PRD-001 Phase 2 (D15): the transpose button
 * rows rendered in the StageFrame meta region.
 *
 * Two rows:
 *  - Global: -12 / -1 / reset / +1 / +12 (store globalTranspose,
 *    clamped +/-24; keyboard brackets mirror this via D14).
 *  - Etude (rendered only when showExercise): -12 / -1 / reset / +1 /
 *    +12 against the per-exercise offset (clamped +/-12) + the
 *    cycle-all-12 toggle (D13).
 *
 * Sounding shift = global + exercise (D15). The exercise row lives
 * ONLY inside the Etude surface; PlaySessionRail keeps its
 * global-only control (its label says "Global transpose").
 *
 * All writes go through the zustand store actions; the exercise row
 * uses nudgeExerciseTranspose (functional set) so rapid clicks
 * accumulate correctly without reading stale render state.
 */

import { useSessionStore } from "../state/sessionStore";
import { ToolChip } from "./StageFrame";

interface TransposeControlsProps {
  /** Etude surface passes true (exercise row + cycle toggle);
   *  other surfaces get the global row only. */
  showExercise: boolean;
}

/** Signed display text for a semitone delta ("-12", "+1", ...). */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

const STEPS: readonly number[] = [-12, -1, 1, 12];

export const TransposeControls = ({
  showExercise,
}: TransposeControlsProps) => {
  const globalTranspose = useSessionStore((s) => s.globalTranspose);
  const exerciseTranspose = useSessionStore((s) => s.exerciseTranspose);
  const keyCycleActive = useSessionStore((s) => s.keyCycleActive);
  const setGlobalTranspose = useSessionStore((s) => s.setGlobalTranspose);
  const setExerciseTranspose = useSessionStore((s) => s.setExerciseTranspose);
  const nudgeExerciseTranspose = useSessionStore(
    (s) => s.nudgeExerciseTranspose,
  );
  const setKeyCycleActive = useSessionStore((s) => s.setKeyCycleActive);

  return (
    <span className="flex items-center gap-2">
      <span
        className="flex items-center gap-1"
        role="group"
        aria-label="Global transpose"
      >
        {STEPS.slice(0, 2).map((d) => (
          <ToolChip
            key={`g${d}`}
            onClick={() => setGlobalTranspose(globalTranspose + d)}
            title={`Global transpose ${signed(d)} semitones`}
          >
            {signed(d)}
          </ToolChip>
        ))}
        <ToolChip
          onClick={() => setGlobalTranspose(0)}
          title="Reset global transpose"
        >
          0
        </ToolChip>
        {STEPS.slice(2).map((d) => (
          <ToolChip
            key={`g${d}`}
            onClick={() => setGlobalTranspose(globalTranspose + d)}
            title={`Global transpose ${signed(d)} semitones`}
          >
            {signed(d)}
          </ToolChip>
        ))}
      </span>
      {showExercise && (
        <span
          className="flex items-center gap-1"
          role="group"
          aria-label="Etude transpose"
        >
          {STEPS.slice(0, 2).map((d) => (
            <ToolChip
              key={`e${d}`}
              onClick={() => nudgeExerciseTranspose(d)}
              title={`Etude transpose ${signed(d)} semitones`}
            >
              {signed(d)}
            </ToolChip>
          ))}
          <ToolChip
            onClick={() => setExerciseTranspose(0)}
            title="Reset etude transpose"
          >
            0
          </ToolChip>
          {STEPS.slice(2).map((d) => (
            <ToolChip
              key={`e${d}`}
              onClick={() => nudgeExerciseTranspose(d)}
              title={`Etude transpose ${signed(d)} semitones`}
            >
              {signed(d)}
            </ToolChip>
          ))}
          <ToolChip
            active={keyCycleActive}
            onClick={() => setKeyCycleActive(!keyCycleActive)}
            title="Cycle all 12 keys: advance the etude offset +1 semitone per form pass"
          >
            Cycle 12
          </ToolChip>
          <span className="t-mono text-[10px] text-[color:var(--color-text-3)]">
            {exerciseTranspose > 0 ? "+" : ""}
            {exerciseTranspose} st
          </span>
        </span>
      )}
    </span>
  );
};
