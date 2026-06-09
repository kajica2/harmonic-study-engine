import * as mm from "@magenta/music";
import { HarmonicPath, HarmonicStep } from "./paths";

let musicRnn: mm.MusicRNN | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

export async function initMagenta() {
  if (musicRnn) return;
  if (isInitializing && initPromise) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    // using a small basic rnn model
    musicRnn = new mm.MusicRNN(
      "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn",
    );
    await musicRnn.initialize();
    isInitializing = false;
  })();

  return initPromise;
}

export async function generateMagentaSequence(
  rootMidi: number = 60,
  stepsCount: number = 16,
  temp: number = 1.0,
): Promise<HarmonicPath> {
  await initMagenta();

  if (!musicRnn) {
    throw new Error("Magenta failed to initialize");
  }

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

  // Magenta might return empty or sparse notes, so we map them to our grid if needed.
  // basic_rnn generates quantized steps.
  if (result.notes && result.notes.length > 0) {
    result.notes.forEach((note) => {
      // if basic_rnn generates chords we could group notes by quantizedStartStep
      // but basic_rnn is monophonic.
      steps.push({
        name: `AI: ${note.pitch}`,
        notes: [note.pitch],
        descriptions: "Neural Network Generation",
      });
    });
  } else {
    // fallback if model acts up
    steps.push({
      name: `AI: ${rootMidi}`,
      notes: [rootMidi],
      descriptions: "Default Note",
    });
  }

  return {
    id: `magenta-rnn-${Date.now()}`,
    title: `Magenta AI Sequence`,
    description: `Melodic study generated via TensorFlow.js (Magenta BasicRNN).`,
    steps,
  };
}
