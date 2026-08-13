/**
 * rhythmDrill — the masterclass "3-iteration rhythm drill".
 *
 * From PJ 2 / MC 28 / MC 40:
 *   Three iterations of the same phrase — quarter notes, then 8th
 *   notes, then 16th notes. The trumpeter plays the same melodic
 *   shape three times, each time at a finer subdivision. This
 *   trains the user to hear the phrase at multiple densities, which
 *   is the foundation of bebop phrasing and rhythmic independence.
 *
 * The function takes a 2-bar phrase (chord + next chord's notes) and
 * plays it three times at the user's tempo:
 *
 *   iteration 1: quarter notes  (one note per beat)
 *   iteration 2: 8th notes      (two notes per beat)
 *   iteration 3: 16th notes     (four notes per beat)
 *
 * Each iteration is two bars long, so the total drill takes
 * (4 beats * 3) / tempoBpm * 60s = 12 / tempo seconds at quarter
 * notes — about 7.2s at 100 BPM. Fast at 16ths.
 *
 * Honours the active AudioContext clock so it stays in phase with
 * the rhythm / backing engines.
 */
import { audioEngine } from "./audio";

export type DrillSubdivision = "quarter" | "eighth" | "sixteenth";

const SUBDIVISION_DIVISOR: Record<DrillSubdivision, number> = {
  // One note per beat (4 notes per bar in 4/4)
  quarter: 1,
  // Two notes per beat (8 notes per bar)
  eighth: 2,
  // Four notes per beat (16 notes per bar)
  sixteenth: 4,
};

export interface DrillConfig {
  /** MIDI notes of the phrase (one chord). */
  notes: number[];
  /** Tempo in BPM. */
  tempoBpm: number;
  /** Length of the phrase in beats (defaults to 8 = two 4/4 bars). */
  beats?: number;
}

/**
 * Play the 3-iteration rhythm drill. Returns the total duration in
 * seconds so the UI can show a progress indicator.
 */
export function playRhythmDrill(cfg: DrillConfig): number {
  const ctx = audioEngine.getCtx();
  if (!ctx || !cfg.notes.length) return 0;
  const beats = cfg.beats ?? 8; // two 4/4 bars
  const beatSec = 60 / cfg.tempoBpm;
  const totalBars = beats / 4;
  // Stagger the start by 50ms so the UI button state can update.
  const now = ctx.currentTime + 0.05;

  // Pick the order of iterations: quarter, eighth, sixteenth —
  // slowest to fastest. This is the masterclass pattern.
  const iterations: DrillSubdivision[] = ["quarter", "eighth", "sixteenth"];

  let cursorSec = now;
  for (let iterIdx = 0; iterIdx < iterations.length; iterIdx++) {
    const sub = iterations[iterIdx];
    const divisor = SUBDIVISION_DIVISOR[sub];
    const notesPerBar = 4 * divisor;
    const totalNotes = notesPerBar * totalBars;
    const noteDurSec = beatSec / divisor;

    // Spread the phrase across the bar(s). If the phrase has fewer
    // notes than the subdivision allows, repeat the phrase so the
    // bar is filled. If it has more, truncate.
    for (let n = 0; n < totalNotes; n++) {
      const phraseIdx = n % cfg.notes.length;
      const midi = cfg.notes[phraseIdx];
      const when = cursorSec + n * noteDurSec;
      audioEngine.playNote(midi);
      // Auto-release so the next note's attack isn't muddied by the
      // previous note's ring. 90% of the slot duration gives a
      // small gap (a legato feel would be 100%+).
      const stopAt = when + noteDurSec * 0.9;
      const stopDelay = Math.max(0, (stopAt - ctx.currentTime) * 1000);
      setTimeout(() => audioEngine.stopNote(midi), stopDelay);
    }
    cursorSec += totalNotes * noteDurSec;
    // Add a small gap between iterations so the player can reset
    // mentally. 200ms is enough to register without breaking the
    // sense of a single drill exercise.
    cursorSec += 0.2;
  }
  return cursorSec - now;
}

export const DRILL_SUBDIVISIONS: DrillSubdivision[] = [
  "quarter",
  "eighth",
  "sixteenth",
];