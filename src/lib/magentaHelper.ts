import * as mm from "@magenta/music";
import { HarmonicPath, HarmonicStep } from "./paths";
import { generateEtude } from "./etude";

let musicRnn: mm.MusicRNN | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

/**
 * Detect Magenta-related errors that we know we can't recover from
 * (broken tfjs fetch shim, missing fetch5, etc.). In those cases we
 * silently fall back to a deterministic melodic variation.
 */
function isFatalMagentaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch5|fetch4|fetch3.*not a function|tf\.util\.fetch|Backbone|fetch is not a function|checkpoints\/.*\/basic_rnn/.test(
    msg,
  );
}

export async function initMagenta(): Promise<boolean> {
  if (musicRnn) return true;
  if (isInitializing && initPromise) {
    try {
      await initPromise;
      return true;
    } catch {
      return false;
    }
  }

  isInitializing = true;
  initPromise = (async () => {
    musicRnn = new mm.MusicRNN(
      "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn",
    );
    await musicRnn.initialize();
    isInitializing = false;
  })();

  try {
    await initPromise;
    return true;
  } catch (err) {
    if (isFatalMagentaError(err)) {
      console.warn(
        "[magenta] RNN unavailable in this environment, falling back to deterministic variation:",
        err instanceof Error ? err.message : err,
      );
    } else {
      console.warn("[magenta] RNN failed to initialize:", err);
    }
    musicRnn = null;
    isInitializing = false;
    return false;
  }
}

/**
 * Fallback when Magenta RNN is unreachable: a melodic single-line
 * variation built from the etude generators.
 */
function melodicFallback(rootMidi: number, stepsCount: number): HarmonicPath {
  const base = generateEtude("trumpet_etude", stepsCount, rootMidi);
  // Rebrand as a Magenta variation so the user knows what happened.
  return {
    id: `magenta-fallback-${Date.now()}`,
    title: "Magenta AI — melodic variation (fallback)",
    description:
      "Magenta's MusicRNN is not available in this runtime (model checkpoint fetch fails). " +
      "Using a deterministic melodic variation built from the trumpet etude idioms.",
    steps: base.steps,
  };
}

export async function generateMagentaSequence(
  rootMidi: number = 60,
  stepsCount: number = 16,
  temp: number = 1.0,
): Promise<HarmonicPath> {
  const ok = await initMagenta();
  if (!ok || !musicRnn) return melodicFallback(rootMidi, stepsCount);

  try {
    const qns = mm.sequences.quantizeNoteSequence(
      {
        ticksPerQuarter: 220,
        totalTime: 0.5,
        timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
        tempos: [{ time: 0, qpm: 120 }],
        notes: [{ pitch: rootMidi, startTime: 0, endTime: 0.5 }],
      },
      4,
    );

    const result = await musicRnn.continueSequence(qns, stepsCount, temp);

    const steps: HarmonicStep[] = [];
    if (result.notes && result.notes.length > 0) {
      result.notes.forEach((note) => {
        steps.push({
          name: `AI: ${note.pitch}`,
          notes: [note.pitch],
          descriptions: "Neural Network Generation",
        });
      });
    } else {
      // model returned nothing — fall back rather than emit a single note
      return melodicFallback(rootMidi, stepsCount);
    }

    return {
      id: `magenta-rnn-${Date.now()}`,
      title: `Magenta AI Sequence`,
      description: `Melodic study generated via TensorFlow.js (Magenta BasicRNN).`,
      steps,
    };
  } catch (err) {
    console.warn("[magenta] generation failed, using fallback:", err);
    return melodicFallback(rootMidi, stepsCount);
  }
}
