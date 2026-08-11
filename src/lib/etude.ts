import { HarmonicPath, HarmonicStep } from "./paths";

export type EtudeAlgorithm =
  | "fibonacci"
  | "sacred_geometry"
  | "coltrane_fractal"
  | "magenta_rnn"
  | "gemini_jazz"
  | "gemini_classical"
  | "gemini_modern"
  | "gemini_romantic"
  | "trumpet_etude";

const NOTE_NAMES = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];
function getNoteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

function prettyAlgorithmTitle(algorithm: EtudeAlgorithm): string {
  if (algorithm === "trumpet_etude") return "Etude: Trumpet Etude";
  if (algorithm === "magenta_rnn") return "Etude: Magenta RNN";
  if (algorithm === "sacred_geometry") return "Etude: Sacred Geometry";
  if (algorithm === "coltrane_fractal") return "Etude: Coltrane Fractal";
  if (algorithm === "fibonacci") return "Etude: Fibonacci";
  if (algorithm.startsWith("gemini_")) {
    const feel = algorithm.replace("gemini_", "");
    return `Etude: Gemini ${feel.charAt(0).toUpperCase() + feel.slice(1)}`;
  }
  return `Etude: ${algorithm}`;
}

// ---------------------------------------------------------------------------
// Trumpet-flavoured etude: idioms over an ii-V-I cadence
// Idiom palette rotates each bar:
//   arpeggio    — bridge arpeggio in/out of the altissimo register
//   long_tone   — sustained tonic for breath control
//   blues_motif — b7 → b3 → natural 5 → root over V
//   chromatic   — 4-note chromatic ascent to the dominant
// Each phrase of 4 bars resolves, then the tonic modulates up a perfect 4th.
// ---------------------------------------------------------------------------
function buildTrumpetEtude(length: number, rootMidi: number): HarmonicStep[] {
  const IDIOMS = ["arpeggio", "long_tone", "blues_motif", "chromatic"];
  const steps: HarmonicStep[] = [];
  let tonic = rootMidi;
  const range: [number, number] = [
    Math.max(48, tonic - 12),
    Math.min(78, tonic + 18),
  ];
  const clamp = (n: number) => Math.min(Math.max(n, range[0]), range[1]);

  for (let i = 0; i < length; i++) {
    let notes: number[];
    let label: string;
    let desc: string;
    const idiom = IDIOMS[i % IDIOMS.length];

    if (idiom === "arpeggio") {
      // Bridge arpeggio: tonic → octave → 12th → octave → tonic
      const top = clamp(tonic + 12 + 7);
      notes = Array.from(new Set([tonic, tonic + 12, top, tonic + 12, tonic]));
      label = `${getNoteName(tonic)} arpeggio`;
      desc = "Bridge arpeggio across two octaves — peak lands in altissimo register";
    } else if (idiom === "long_tone") {
      notes = [tonic];
      label = `${getNoteName(tonic)} long tone`;
      desc = "Sustained tonic for 4 beats — breath control & embouchure stability";
    } else if (idiom === "blues_motif") {
      const dom = tonic + 7;
      const b3 = tonic + 7 - 4;  // minor 7th above tonic, i.e. m3 of V
      const b7 = tonic + 7 - 1;  // major 7th above tonic, b7 of V
      const nat5 = tonic + 7 - 7 + 12; // major 3rd above dom
      notes = Array.from(new Set([b7, b3, dom, nat5]));
      label = `blues over ${getNoteName(dom)}`;
      desc = "b7 → b3 → natural 5 → root — defines the V7 blues sound";
    } else {
      const end = tonic + 7;
      notes = [end - 3, end - 2, end - 1, end];
      label = `chromatic to ${getNoteName(end)}`;
      desc = "Chromatic ascent into the dominant — pre-V tension";
    }
    notes = notes.map(clamp);

    steps.push({ name: label, notes, descriptions: desc });

    // every 4 bars, modulate tonic up a perfect 4th
    if ((i + 1) % 4 === 0) {
      tonic = Math.min(Math.max(tonic + 5, 48), 76);
    }
  }
  return steps;
}

export function generateEtude(
  algorithm: EtudeAlgorithm,
  length: number,
  rootMidi: number = 60,
): HarmonicPath {
  const steps: HarmonicStep[] = [];

  if (algorithm === "fibonacci") {
    // Generate intervals based on Fibonacci sequence (1, 1, 2, 3, 5, 8, 13...)
    let a = 1;
    let b = 1;
    let currentMidi = rootMidi;

    for (let i = 0; i < length; i++) {
      const note1 = currentMidi;
      const note2 = currentMidi + a;
      const note3 = currentMidi + b;
      const note4 = currentMidi + a + b;

      const notes = Array.from(new Set([note1, note2, note3, note4])).sort(
        (x, y) => x - y,
      );

      steps.push({
        name: `Fib ${a}-${b}`,
        notes,
        descriptions: `Fibonacci interval shift: ${a}, ${b}`,
      });

      const next = a + b;
      a = b;
      b = next;

      if (b > 13) {
        a = 1;
        b = 2;
        currentMidi = currentMidi + 7;
        if (currentMidi > 72) currentMidi -= 12;
      }
    }
  } else if (algorithm === "sacred_geometry") {
    let current = rootMidi;
    const intervals = [3, 4];
    for (let i = 0; i < length; i++) {
      const root = current;
      const chord = [root, root + 4, root + 8, root + 11];
      steps.push({
        name: `${getNoteName(root)}maj7#5`,
        notes: chord,
        descriptions: "Golden Ratio / Symmetrical Expansion",
      });
      current += intervals[i % intervals.length];
      if (current > 80) current -= 12;
    }
  } else if (algorithm === "coltrane_fractal") {
    let current = rootMidi;
    for (let i = 0; i < length; i++) {
      const isDom = i % 2 !== 0;
      const root = current;
      if (isDom) {
        steps.push({
          name: `${getNoteName(root)}7`,
          notes: [root, root + 4, root + 7, root + 10],
          descriptions: "V7 fractal shift",
        });
        current = current + 5;
      } else {
        steps.push({
          name: `${getNoteName(root)}maj7`,
          notes: [root, root + 4, root + 7, root + 11],
          descriptions: "Imaj7 fractal anchor",
        });
        current = current - 4;
      }
      while (current > 72) current -= 12;
      while (current < 48) current += 12;
    }
  } else if (algorithm === "trumpet_etude") {
    steps.push(...buildTrumpetEtude(length, rootMidi));
  }

  return {
    id: `etude-${algorithm}-${Date.now()}`,
    title: prettyAlgorithmTitle(algorithm),
    description: `Algorithmic etude generated using ${algorithm} logic.`,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Async Magenta wrapper. The deterministic algorithms above stay sync
// so the UI can call them straight from a click handler; the network-
// bound Magenta path returns a Promise with a Fib fallback if the model
// fails to initialize.
// ---------------------------------------------------------------------------
export async function generateEtudeAsync(
  algorithm: EtudeAlgorithm,
  length: number,
  rootMidi: number = 60,
): Promise<HarmonicPath> {
  if (algorithm === "magenta_rnn") {
    try {
      const { generateMagentaSequence } = await import("./magentaHelper");
      return await generateMagentaSequence(rootMidi, length, 1.0);
    } catch (err) {
      console.warn("[etude] Magenta RNN failed, falling back to Fibonacci:", err);
      return generateEtude("fibonacci", length, rootMidi);
    }
  }
  // Async variants for any deterministic alg just run the sync version
  return Promise.resolve(generateEtude(algorithm, length, rootMidi));
}
