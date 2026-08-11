export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function getMidiFromNoteName(noteName: string): number {
  const noteContent = noteName.match(/([A-G]#?)(\d)/);
  if (!noteContent) return 60;

  const [, note, octave] = noteContent;
  const noteIndex = NOTE_NAMES.indexOf(note);
  return noteIndex + (parseInt(octave) + 1) * 12;
}

export function getNoteNameFromMidi(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[midi % 12];
  return `${noteName}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Synesthesia Color Mappings based loosely on Scriabin / Kandinsky color theory ideas
// C = Red, C# = Red/Violet, D = Yellow, D# = Steel Blue, E = Pearly White / Blue, F = Dark Red, F# = Blue, G = Orange, G# = Purple, A = Green, A# = Rose, B = Blue
export const PITCH_COLORS: Record<string, string> = {
  C: "#E23D28", // Red
  "C#": "#9328E2", // Magenta/Violet
  D: "#F1C40F", // Yellow
  "D#": "#6A809C", // Steel Blue
  E: "#9BCCFF", // Light Blue/Pearly
  F: "#8B0000", // Dark Red
  "F#": "#2980B9", // Deep Blue
  G: "#E67E22", // Orange
  "G#": "#8E44AD", // Purple
  A: "#27AE60", // Green
  "A#": "#FF69B4", // Rose/Hot Pink
  B: "#1ABC9C", // Teal / Aquamarine
};

export const getColorForNote = (midi: number): string => {
  const note = NOTE_NAMES[midi % 12];
  return PITCH_COLORS[note] || "#CCC";
};

export const getShapeForNote = (
  midi: number,
): "circle" | "triangle" | "square" | "line" => {
  const pitchClass = midi % 12;
  // Map interval structures to shapes (arbitrary synesthesia mapping)
  if ([0, 7].includes(pitchClass)) return "circle"; // stable (Roots, Fifths)
  if ([2, 4, 9].includes(pitchClass)) return "square"; // somewhat stable (2nd, 3rds, 6ths)
  if ([1, 6, 11].includes(pitchClass)) return "triangle"; // dissonant (m2, Tritone, M7)
  return "line";
};

/**
 * Total semitones traveled across all voices between two chords.
 * Lower is "smoother" voice leading.
 */
export function voiceLeadingDistance(
  prevNotes: number[],
  currNotes: number[],
): number {
  if (prevNotes.length === 0 || currNotes.length === 0) return 0;
  const a = [...prevNotes].sort((x, y) => x - y);
  const b = [...currNotes].sort((x, y) => x - y);
  const n = Math.max(a.length, b.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? a[a.length - 1];
    const bv = b[i] ?? b[b.length - 1];
    total += Math.abs((av ?? bv) - (bv ?? av));
  }
  // Bass motion (always part of score)
  total += Math.abs(Math.min(...a) - Math.min(...b));
  return total;
}

/**
 * Quick voice-leading score: "minimized top-voice motion: N semitones"
 */
export function voiceLeadingScore(
  prevNotes: number[],
  currNotes: number[],
): string {
  if (prevNotes.length === 0) return "no prior chord";
  const top = Math.max(...currNotes);
  const prevTop = Math.max(...prevNotes);
  const semitones = Math.abs(top - prevTop);
  if (semitones === 0) return "common tone on top — held";
  return `top-voice motion: ${semitones} st`;
}

/**
 * Generate a single contextual alternative voicing for the current chord:
 *  - "inversion" — shift bass up by an octave
 *  - "drop2" — take the second voice from the top and drop it an octave
 *  - "smooth" — apply voice-leading from the previous chord
 */
export type AlternativeKind = "inversion" | "drop2" | "smooth" | "spread" | "rootless" | "simplify";

export function alternativeVoicing(
  prevNotes: number[],
  currNotes: number[],
  kind: AlternativeKind,
): number[] {
  const uniq = Array.from(new Set(currNotes)).sort((a, b) => a - b);
  if (uniq.length === 0) return currNotes;
  if (kind === "inversion") {
    // Move bass up an octave (only if a higher voice exists above it)
    const bass = uniq[0];
    const candidates = uniq.slice(1).filter((n) => n < bass + 12);
    if (candidates.length === 0) return currNotes;
    return [bass + 12, ...candidates];
  }
  if (kind === "drop2") {
    // Move the second-highest voice down an octave, then re-sort
    if (uniq.length < 2) return currNotes;
    const sorted = [...uniq];
    const second = sorted[sorted.length - 2];
    const dropped = second - 12;
    const out = [...sorted.filter((n) => n !== second), dropped].sort((a, b) => a - b);
    return out;
  }
  if (kind === "spread") {
    // Move alternating voices up an octave (drop-2 + spread-by-2)
    if (uniq.length < 3) return uniq;
    const sorted = [...uniq];
    const out = sorted.map((n, i) => (i % 2 === 1 ? n + 12 : n)).sort((a, b) => a - b);
    return Array.from(new Set(out));
  }
  if (kind === "rootless") {
    // Drop the bass; keep the chord tones from the 3rd up. Useful for ii-V-I.
    if (uniq.length < 2) return uniq;
    return uniq.slice(1);
  }
  if (kind === "simplify") {
    // Keep only root, 3rd/10th, 7th — drop 9/11/13 tensions for clarity
    return uniq.slice(0, Math.min(4, uniq.length));
  }
  // smooth
  return applyVoiceLeading(prevNotes, currNotes);
}

/**
 * Chord metadata derived from a list of MIDI pitches — used by the
 * Chord Inspector to label Roman numeral / function / tensions /
 * inversion / bass. Pure derivation, no AI.
 */
export interface ChordAnalysis {
  /** Lowest note, displayed as "C3" etc. */
  bass: string;
  /** Lowest pitch-class name — e.g. "C" for C-root */
  rootName: string;
  /** Inversion index: 0 = root position, 1 = 1st, 2 = 2nd, 3 = 3rd */
  inversion: number;
  /** Major 7th and minor 7th interpretations only — qualitative. */
  family: "major" | "minor" | "dominant" | "half-diminished" | "diminished" | "unknown";
  /** Available tensions: 9th, #9, 11, #11, 13, b13 */
  tensions: string[];
  /** Roman numeral (major-mode assumption: derived from semitones above root) */
  roman: string;
  /** Function label (very lightweight) */
  function: "tonic" | "subdominant" | "dominant" | "predominant" | "color";
}

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
  G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};
const PC_TO_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ROMAN_BY_SEMITONE: Record<number, string> = {
  0: "I", 2: "ii", 4: "III", 5: "IV", 7: "V", 9: "vi", 11: "vii°",
};

function intervalSemitones(a: number, b: number): number {
  return ((b - a) % 12 + 12) % 12;
}

export function analyzeChord(notes: number[]): ChordAnalysis {
  if (notes.length === 0) {
    return {
      bass: "—", rootName: "?", inversion: 0,
      family: "unknown", tensions: [], roman: "?", function: "color",
    };
  }
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const bassMidi = sorted[0];
  const bassPc = ((bassMidi % 12) + 12) % 12;
  const bassName = `${PC_TO_NOTE[bassPc]}${Math.floor(bassMidi / 12) - 1}`;
  const rootName = PC_TO_NOTE[bassPc];

  // Pick the root: try the bass, then the third-above if present
  let root = bassPc;
  for (let i = 1; i < sorted.length; i++) {
    const s = intervalSemitones(root, sorted[i]);
    if (s === 4 || s === 3) break;
  }
  // Detect inversion: is the chord built on the bass or on a higher note?
  // Heuristic: bass = root → root position; bass = root+3 or 4 → 1st inv; root+7 → 2nd inv
  let inversion = 0;
  // Find a 3rd, 5th, 7th by relative semitones; whichever the bass is closest to
  const candidates = [0, 3, 4, 5, 7, 8, 9, 10, 11];
  // The "actual root" of this inversion is the lowest note whose pitch class is the bass or its stacked 3rds
  // We use a simple test: if a major or minor 3rd above the bass exists in the chord,
  // it's most likely the bass of a triad → inversion 0
  let hasThirdAboveBass = false;
  for (const n of sorted.slice(1)) {
    const s = intervalSemitones(bassPc, n);
    if (s === 3 || s === 4) { hasThirdAboveBass = true; break; }
  }
  inversion = hasThirdAboveBass ? 0 : 1;

  // Tensions: look for 9 (semitone 2), #9 (3), 11 (5), #11 (6), 13 (9), b13 (8)
  // relative to root — but root we treat as bass pc unless inversion > 0
  const rootPc = root;
  const tensions: string[] = [];
  for (const n of sorted) {
    if (n === bassMidi) continue;
    const s = intervalSemitones(rootPc, n);
    if (s === 2) tensions.push("9");
    else if (s === 3 && !tensions.includes("b3")) tensions.push("#9");
    else if (s === 5 && !tensions.includes("5")) tensions.push("11");
    else if (s === 6) tensions.push("#11");
    else if (s === 8) tensions.push("b13");
    else if (s === 9 && !tensions.includes("9")) tensions.push("13");
  }

  // Family: based on the lowest three notes (the chord's triad plus a 7th if present)
  // Treat M3+m7 as dominant, M3+M7 as major, m3+m3 as diminished, etc.
  // First detect the 7th by the 4th note (if any), then the triad type by 3rd+5th.
  const lowestThree = sorted.slice(0, Math.min(3, sorted.length));
  const third = intervalSemitones(bassPc, lowestThree[1] ?? bassPc);
  const fifth = intervalSemitones(bassPc, lowestThree[2] ?? bassPc);
  // Look for the chord's 7th (4th unique note from the bass)
  const fourth = sorted[3] !== undefined ? intervalSemitones(bassPc, sorted[3]) : -1;
  const hasMinor7 = fourth === 10;
  const hasMajor7 = fourth === 11;

  let family: ChordAnalysis["family"] = "unknown";
  if (third === 4 && (fifth === 7 || fifth === 14) && (hasMinor7 || sorted.length < 4)) {
    if (hasMajor7) family = "major";        // M3 P5 M7
    else if (hasMinor7) family = "dominant"; // M3 P5 m7 = dominant 7th
    else family = "major";                   // triad only
  }
  else if (third === 3 && (fifth === 7 || fifth === 14) && (hasMinor7 || sorted.length < 4)) {
    if (hasMajor7) family = "minor";         // m3 P5 M7 = mMaj7
    else family = "minor";                   // m3 P5 m7 = min 7th
  }
  else if (third === 3 && fifth === 6) family = "half-diminished";
  else if (third === 3 && fifth === 5) family = "diminished";
  // Fallbacks when chord exceeds 3 notes but classification failed above:
  else if (third === 4 && hasMinor7) family = "dominant";
  else if (third === 4 && hasMajor7) family = "major";

  // Roman numeral based on root pc in major scale
  const roman = ROMAN_BY_SEMITONE[bassPc] ?? "?";

  // Function (very lightweight; assumes major key center)
  let fn: ChordAnalysis["function"] = "color";
  if (bassPc === 0) fn = "tonic";
  else if (bassPc === 5) fn = "subdominant";
  else if (bassPc === 7) fn = "dominant";
  else if (bassPc === 2 || bassPc === 4 || bassPc === 9) fn = "predominant";
  else fn = "color";

  return {
    bass: bassName,
    rootName,
    inversion,
    family,
    tensions,
    roman,
    function: fn,
  };
}

export function applyVoiceLeading(
  prevNotes: number[],
  targetNotes: number[],
): number[] {
  if (prevNotes.length === 0) return targetNotes;

  const targetBass = Math.min(...targetNotes);
  const targetPCs = targetNotes
    .filter((n) => n !== targetBass)
    .map((n) => n % 12);

  const prevBass = Math.min(...prevNotes);
  const prevUpper = prevNotes
    .filter((n) => n !== prevBass)
    .sort((a, b) => a - b);

  if (prevUpper.length === 0) return targetNotes;

  let newNotes = [targetBass];

  let availableTargetPCs = [...targetPCs];

  // Greedily match each prevUpper to the closest available target PC
  for (const p of prevUpper) {
    if (availableTargetPCs.length === 0) break;

    let bestPCIndex = -1;
    let minDistance = Infinity;
    let bestNote = -1;

    for (let i = 0; i < availableTargetPCs.length; i++) {
      const pc = availableTargetPCs[i];
      // closest octave for pc to p
      const nearestOctaveNote = p - (p % 12) + pc;
      const candidates = [
        nearestOctaveNote - 12,
        nearestOctaveNote,
        nearestOctaveNote + 12,
      ];
      for (const cand of candidates) {
        if (cand <= targetBass) continue;
        const dist = Math.abs(cand - p);
        if (dist < minDistance) {
          minDistance = dist;
          bestPCIndex = i;
          bestNote = cand;
        }
      }
    }

    if (bestPCIndex !== -1) {
      newNotes.push(bestNote);
      availableTargetPCs.splice(bestPCIndex, 1);
    }
  }

  // If there are leftover target PCs, place them close to the average of newNotes
  const avg =
    newNotes.length > 1
      ? newNotes.slice(1).reduce((a, b) => a + b, 0) / (newNotes.length - 1)
      : targetBass + 12;
  for (const pc of availableTargetPCs) {
    let minDistance = Infinity;
    let bestNote = pc + 48;
    for (let oct = 2; oct <= 6; oct++) {
      const cand = pc + oct * 12;
      if (cand <= targetBass) continue;
      const dist = Math.abs(cand - avg);
      if (dist < minDistance) {
        minDistance = dist;
        bestNote = cand;
      }
    }
    newNotes.push(bestNote);
  }

  return Array.from(new Set(newNotes)).sort((a, b) => a - b);
}
