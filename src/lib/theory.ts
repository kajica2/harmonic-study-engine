import type { HarmonicPath } from "./paths";
import type { Persona } from "./personas";

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
 * Voicing registry — every supported voicing shape lives here.
 *
 * `intervals` is the stack of semitones above the bass note that
 * makes up the voicing. The bass note itself is implicit (the lowest
 * note of the chord). For "drop" voicings and similar, the helper
 * `applyVoicing(chord, voicing)` does the math.
 */
export type VoicingId =
  | "closed"
  | "drop2"
  | "minimum_motion"
  | "spread"
  | "inversion"
  | "quartal"
  | "open_drop3"
  | "closed_dense"
  | "melody_first";

export interface Voicing {
  id: VoicingId;
  label: string;
  description: string;
  /** Semitones above bass. Root is omitted (bass IS the root). */
  intervals: number[];
  usedBy: string[];
  minNotes?: number;
  maxNotes?: number;
  minHandSpan?: string;
  allowMiddleGap?: boolean;
  innerVoiceTracking?: boolean;
  melodyOnTop?: boolean;
}

export const VOICINGS: Record<VoicingId, Voicing> = {
  closed: {
    id: "closed",
    label: "Closed",
    description: "Tight stacked triad/seventh, all notes within an octave.",
    intervals: [3, 5, 7],
    usedBy: ["coltrane", "bach", "debussy", "eno", "glass", "monk", "miles", "chet", "dizzy", "hubbard", "shorter", "kandinsky", "mahler"],
  },
  drop2: {
    id: "drop2",
    label: "Drop-2",
    description: "Take the second voice from the top, drop it an octave.",
    intervals: [3, 5, 7],
    usedBy: [],
  },
  minimum_motion: {
    id: "minimum_motion",
    label: "Minimum Motion",
    description: "Voice-lead every transition for minimal total semitones.",
    intervals: [],
    usedBy: [],
  },
  spread: {
    id: "spread",
    label: "Spread",
    description: "Drop-2 plus alternating octaves. Open, jazz-balled.",
    intervals: [],
    usedBy: [],
  },
  inversion: {
    id: "inversion",
    label: "Inversion",
    description: "Bass moves up an octave; chord stack remains.",
    intervals: [],
    usedBy: [],
  },
  quartal: {
    id: "quartal",
    label: "Quartal",
    description: "Stacked fourths. Open, ambiguous, impressionist. Scriabin's mystic sound.",
    intervals: [5, 10, 15, 20],
    usedBy: ["scriabin"],
    minNotes: 3,
    maxNotes: 6,
  },
  open_drop3: {
    id: "open_drop3",
    label: "Open Drop-3",
    description: "Wide spacing with an empty middle register. Bell-like, pianistic.",
    intervals: [7, 16, 19],
    usedBy: ["rachmaninov"],
    allowMiddleGap: true,
  },
  closed_dense: {
    id: "closed_dense",
    label: "Closed Dense",
    description: "Tight cluster in the middle register with independent inner voices. Brahms.",
    intervals: [4, 7, 11],
    usedBy: ["brahms"],
    innerVoiceTracking: true,
  },
  melody_first: {
    id: "melody_first",
    label: "Melody-First",
    description: "Top voice leads; harmony fills underneath. Simple accompaniment, lyrical line.",
    intervals: [4, 7],
    usedBy: ["tchaikovsky"],
    melodyOnTop: true,
  },
};

/**
 * Apply a voicing to a chord's MIDI notes.
 * - Bass is the lowest note.
 * - Upper voices = bass + intervals[i] (intervals relative to bass).
 * - For `intervals` that exceed available chord tones, the voicing
 *   re-uses the chord's actual pitch classes and re-bases them
 *   around the bass, so it still respects the chord.
 */
export function applyVoicing(notes: number[], voicingId: VoicingId): number[] {
  const v = VOICINGS[voicingId];
  if (notes.length === 0) return notes;
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const bass = sorted[0];
  const upperPcs = sorted.slice(1).map((n) => n % 12);
  if (upperPcs.length === 0) return [bass];

  if (voicingId === "minimum_motion" || voicingId === "spread" || voicingId === "inversion" || voicingId === "drop2") {
    // Delegate to existing helpers.
    if (voicingId === "inversion") return alternativeVoicing([], notes, "inversion");
    if (voicingId === "drop2") return alternativeVoicing([], notes, "drop2");
    if (voicingId === "spread") return alternativeVoicing([], notes, "spread");
    if (voicingId === "minimum_motion") return notes; // requires prior chord; App handles
  }

  // Stack the voicing from the chord's own pitch classes, climbing from bass.
  const stack: number[] = [bass];
  // Use voicing intervals as the target layer positions; pick the chord's
  // pitch class closest to each target layer.
  for (const targetSemi of v.intervals) {
    const targetMidi = bass + targetSemi;
    // Find chord pc closest to targetSemi.
    const targetPc = targetSemi % 12;
    let bestPc: number | null = null;
    let bestDist = Infinity;
    for (const pc of upperPcs) {
      const dist = Math.min(
        Math.abs(pc - targetPc),
        12 - Math.abs(pc - targetPc),
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestPc = pc;
      }
    }
    if (bestPc === null) break;
    // Pick the octave of bestPc that puts it closest to targetMidi.
    const candOctaves = [
      bass + 12 * Math.floor(targetSemi / 12) + bestPc - (bass % 12),
      bass + 12 * Math.ceil(targetSemi / 12) + bestPc - (bass % 12),
    ].filter((c) => c > bass);
    const cand =
      candOctaves.length === 0
        ? bass + bestPc + 12
        : candOctaves.reduce((a, b) =>
            Math.abs(a - targetMidi) < Math.abs(b - targetMidi) ? a : b,
          );
    stack.push(cand);
  }

  return Array.from(new Set(stack)).sort((a, b) => a - b);
}

/**
 * Phase 5: per-bar transpose drift from a path + persona.
 *
 * Two sources of drift:
 *  - sequenceStepper (Tchaikovsky): when active path has
 *    `sequenceStepper: true`, each bar after bar 0 climbs by
 *    `sequenceInterval` semitones (default 2). sequence_ascent
 *    declares sequenceInterval=2 → bars climb +2, +4, +6…
 *  - keyDrift (Mahler): when active path declares a `key` like
 *    "D minor → C major", drift from start to end across the path's bars.
 *    Linear interpolation in semitones.
 *
 * Returns one semitone shift per PATH STEP (not per bar). For paths
 * that don't declare any drift, returns 0s — no-op.
 *
 * Cheap to compute; caller memoizes on (path, personaId).
 */
export function deriveBarTransposeDrift(
  path: HarmonicPath,
  persona: Persona | undefined,
): number[] {
  const totalBars = Math.ceil(path.steps.length / 4);
  const rules = persona?.rules ?? {};
  const seqEnabled = (path as any).sequenceStepper === true;
  const seqInterval =
    typeof (path as any).sequenceInterval === "number"
      ? (path as any).sequenceInterval
      : 2;
  const keyDriftEnabled =
    rules.keyDriftAcrossPath === true ||
    Boolean(path.key && /\u2192/.test(path.key));
  let keyDriftTotal = 0;
  let startKeyPc: number | null = null;
  if (keyDriftEnabled && path.key) {
    const noteToPc: Record<string, number> = {
      C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
      "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
    };
    const parts = path.key.split(/\u2192/).map((s: string) => s.trim());
    const startTok = parts[0]?.replace(/\s*m(in)?(aj)?\s*$/i, "").trim() ?? "";
    const endTok = parts[1]?.replace(/\s*m(in)?(aj)?\s*$/i, "").trim() ?? "";
    startKeyPc = noteToPc[startTok] ?? null;
    const endPc = noteToPc[endTok] ?? null;
    if (startKeyPc !== null && endPc !== null) {
      // Drift relative to the start key. Convert to a linear range
      // across the shorter of (forward, backward) intervals.
      let delta = endPc - startKeyPc;
      if (delta > 6) delta -= 12;
      if (delta < -6) delta += 12;
      keyDriftTotal = delta;
    }
  }

  // Build per-step shifts (4 steps per bar).
  const out: number[] = [];
  for (let bar = 0; bar < totalBars; bar++) {
    let shift = 0;
    if (seqEnabled) {
      shift += bar * seqInterval;
    }
    if (keyDriftEnabled && startKeyPc !== null && totalBars > 1) {
      // Linear ramp 0 → keyDriftTotal across (totalBars - 1) bars.
      // Round to nearest integer semitone.
      shift += Math.round((bar / (totalBars - 1)) * keyDriftTotal);
    }
    for (let s = 0; s < 4; s++) out.push(shift);
  }
  // Trim to the actual path step count.
  return out.slice(0, path.steps.length);
}

/**
 * Phase 5: behavioral markers — derived from a path + the active
 * persona. Returns one marker per BAR (not per step) so the bar strip
 * can render per-bar overlays: motifTracker badges for transformations,
 * frozenBass indicators for held bass, keyDrift hues for tonal shift.
 *
 * Cheap to compute. Caller memoizes on (path, personaId).
 */
export interface BehavioralMarker {
  /** Stable per-bar accent color (hex). Pulled from persona.colorPalette
   *  when available; falls back to a neutral brass for non-persona paths. */
  accentHex: string;
  /** True if this bar represents a "transformation" of the prior bar's
   *  pitch content (Brahms-style). Derived from note-set diff vs the
   *  previous bar. */
  isMotifTransformation: boolean;
  /** True if the bass note carries from the previous bar without change
   *  (Rachmaninov-style frozen bass). Derived from comparing bar bass. */
  bassFrozen: boolean;
  /** Optional secondary hint (e.g. "Δ", "≈") for the bar UI. */
  hint: string;
}

export function deriveBehavioralMarkers(
  path: HarmonicPath,
  persona: Persona | undefined,
): BehavioralMarker[] {
  const palette = persona?.colorPalette ?? ["#D4A857", "#8B6914", "#C9A227", "#5A5A5A"];
  const totalBars = Math.ceil(path.steps.length / 4);
  const out: BehavioralMarker[] = [];
  let prevBarBass: number | null = null;
  let prevBarPcs: Set<number> | null = null;
  for (let b = 0; b < totalBars; b++) {
    const barSteps = path.steps.slice(b * 4, b * 4 + 4);
    const bassNotes = barSteps
      .map((s) => (s.notes.length ? Math.min(...s.notes) : null))
      .filter((n): n is number => n !== null);
    const bass = bassNotes.length ? bassNotes[0] : null;
    const bassFrozen = bass !== null && bass === prevBarBass;
    const pcs = new Set<number>();
    for (const s of barSteps) for (const n of s.notes) pcs.add(n % 12);
    let isMotifTransformation = false;
    if (prevBarPcs !== null) {
      // Transformation = either same root set with new voicing, or a
      // derived inversion. Heuristic: any overlap but at least one new pc.
      const overlap = [...pcs].filter((p) => prevBarPcs!.has(p)).length;
      const newPcs = [...pcs].filter((p) => !prevBarPcs!.has(p)).length;
      isMotifTransformation = overlap > 0 && newPcs > 0 && b > 0;
    }
    const accentHex = palette[b % palette.length];
    const hints: string[] = [];
    if (isMotifTransformation) hints.push("Δ");
    if (bassFrozen && b > 0) hints.push("≈");
    out.push({
      accentHex,
      isMotifTransformation,
      bassFrozen,
      hint: hints.join(" "),
    });
    prevBarBass = bass;
    prevBarPcs = pcs;
  }
  return out;
}

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
