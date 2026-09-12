export interface HarmonicStep {
  name: string;
  notes: number[];
  descriptions: string;
}

export interface HarmonicPath {
  id: string;
  title: string;
  description: string;
  steps: HarmonicStep[];
  mvpReady?: boolean;
  feel?: string;
  /** Composer / writer (for standards). Optional — only present on
   * curated studies / standards. */
  composer?: string;
  /** Musical key (concert pitch). Optional. Examples: "F", "Bb", "G-", "Eb".
   * Can also declare a progressive tonality drift: "D minor → C major". */
  key?: string;
  /** Optional name alias used by some callers. Falls back to `title`. */
  name?: string;
  /** Phase 5: when true, each bar steps up by `sequenceInterval` semitones
   * (default 2). Used by Tchaikovsky persona for sequence_ascent. */
  sequenceStepper?: boolean;
  /** Phase 5: semitone interval per bar when sequenceStepper is true.
   * Defaults to 2. */
  sequenceInterval?: number;
  /** Phase 3: when true, the persona slices the path and loops each
   * slice as a motif. Mirrors `PersonaRules.sliceAndRepeat` on the
   * path object so concept exercises can be authored as raw paths. */
  sliceAndRepeat?: boolean;
  /** Phase 3: free-form technique tags surfaced in the catalog /
   * picker (e.g. "ii_v_i", "tritone_substitution", "modal"). */
  techniques?: string[];
  /** Phase 1: persona-side rule mirror — when true, the path is meant
   *  to be heard with the bass held while upper voices move (Miles's
   *  modal restraint, Rachmaninov's frozen bass). Derived markers
   *  pick this up alongside the persona rule. */
  bassIsolation?: boolean;
  /** Phase 1: persona-side rule mirror — when true, the bar-strip
   *  motif tracker highlights transformations across bars (Brahms
   *  developing variation). Mirrors `persona.rules.motifTracker`. */
  motifTracker?: boolean;
}

// ---------------------------------------------------------------------------
// Path length policy
// ---------------------------------------------------------------------------
// Each HarmonicStep is one BEAT (1/4 of a bar in 4/4). So
// `path.steps.length / 4` is the bar count. We require every path to be
// between MIN_PATH_BARS and MAX_PATH_BARS bars long, padded/trimmed at
// module-load by `padPath()` below.

export const STEPS_PER_BAR = 4;
export const MIN_PATH_BARS = 24;
export const MAX_PATH_BARS = 64;

/**
 * padPath — returns a copy of `path` whose steps array sits inside
 * `[MIN_PATH_BARS, MAX_PATH_BARS]` bars (i.e. steps in
 * `[MIN * STEPS_PER_BAR, MAX * STEPS_PER_BAR]`).
 *
 *   - Short paths: cycle the existing steps until they hit MIN bars.
 *   - Long paths: slice to MAX bars.
 *   - Already-in-range paths: pass through unchanged.
 *
 * The cycling strategy for short paths is "loop the form" — the most
 * musically sensible padding for both concept exercises (where the
 * short phrase is meant to be repeated) and standards (where looping
 * the 32-bar head three times is a standard practice technique).
 */
export function padPath(path: HarmonicPath): HarmonicPath {
  const minSteps = MIN_PATH_BARS * STEPS_PER_BAR;
  const maxSteps = MAX_PATH_BARS * STEPS_PER_BAR;
  let steps = path.steps;
  // Pad by cycling.
  while (steps.length < minSteps) {
    const need = Math.min(steps.length, minSteps - steps.length);
    steps = steps.concat(steps.slice(0, need));
  }
  // Trim to ceiling.
  if (steps.length > maxSteps) {
    steps = steps.slice(0, maxSteps);
  }
  if (steps === path.steps) return path;
  return { ...path, steps };
}

export const RAW_PATHS: HarmonicPath[] = [
  {
    id: "path-1",
    title: "Path I: The Resolution (II-V-I)",
    description:
      "The fundamental jazz cadence. Observe how the 7ths resolve down a half step to the 3rds.",
    steps: [
      {
        name: "Dm7",
        notes: [50, 53, 57, 60],
        descriptions: "Tension begins. Minor 7th chord",
      },
      {
        name: "G7",
        notes: [55, 53, 59, 62],
        descriptions: "The Dominant. F resolves to E.",
      },
      {
        name: "Cmaj7",
        notes: [48, 52, 59, 64],
        descriptions: "Home. The tritone is resolved.",
      },
      {
        name: "A7",
        notes: [45, 52, 55, 61],
        descriptions: "Secondary dominant to Dm.",
      },
      {
        name: "Dm7",
        notes: [50, 53, 57, 60],
        descriptions: "Back to the ii chord.",
      },
      {
        name: "G7",
        notes: [55, 59, 62, 65],
        descriptions: "Dominant V again.",
      },
      { name: "Cmaj7", notes: [48, 52, 59, 64], descriptions: "Resolution." },
      {
        name: "Bm7b5",
        notes: [47, 50, 53, 57],
        descriptions: "vii half-diminished.",
      },
      { name: "E7", notes: [40, 52, 56, 60], descriptions: "V of vi." },
      {
        name: "Am7",
        notes: [45, 52, 55, 60],
        descriptions: "Deceptive cadence to vi.",
      },
      { name: "D7", notes: [50, 54, 57, 60], descriptions: "V of V." },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "Dominant V." },
      {
        name: "C6",
        notes: [48, 52, 57, 60],
        descriptions: "Final stable resolution.",
      },
      { name: "Fmaj7", notes: [53, 57, 60, 64], descriptions: "IV chord." },
      { name: "Fm7", notes: [53, 56, 60, 63], descriptions: "Minor IV." },
      { name: "Cmaj7", notes: [48, 52, 59, 64], descriptions: "Back home." },
    ],
  },
  {
    id: "path-2",
    title: "Path II: Neo-Soul Borrowing",
    description:
      "Smooth movement using secondary dominants and altered tensions.",
    steps: [
      {
        name: "Ebmaj9",
        notes: [51, 55, 58, 63, 65],
        descriptions: "A warm, open major 9th voicing.",
      },
      {
        name: "D7#9#5",
        notes: [50, 54, 60, 63, 65],
        descriptions: "Sharp tension! Notice the jagged visual geometry.",
      },
      {
        name: "Gm9",
        notes: [55, 58, 62, 65, 69],
        descriptions: "Resolution into a dark, expansive minor chord.",
      },
      {
        name: "Cmaj9",
        notes: [48, 52, 55, 59, 62],
        descriptions: "Major home.",
      },
      {
        name: "Fmaj9",
        notes: [53, 57, 60, 64, 67],
        descriptions: "Subdominant.",
      },
      {
        name: "Bbmaj9",
        notes: [46, 53, 57, 60, 65],
        descriptions: "Borrowed bVII.",
      },
      {
        name: "Ebmaj9",
        notes: [51, 55, 58, 63, 65],
        descriptions: "Borrowed bIII.",
      },
      {
        name: "Abmaj9",
        notes: [44, 51, 56, 60, 63],
        descriptions: "Borrowed bVI.",
      },
      {
        name: "Dbmaj9",
        notes: [49, 53, 56, 60, 65],
        descriptions: "Borrowed bII.",
      },
      {
        name: "Gbmaj9",
        notes: [54, 58, 61, 66, 68],
        descriptions: "Distant relation.",
      },
      {
        name: "Bmaj9",
        notes: [47, 51, 54, 59, 63],
        descriptions: "Enharmonic slip.",
      },
      {
        name: "Emaj9",
        notes: [52, 56, 59, 64, 66],
        descriptions: "Modulation.",
      },
      {
        name: "Amaj9",
        notes: [45, 49, 52, 57, 61],
        descriptions: "Ascending 4ths.",
      },
      {
        name: "Dmaj9",
        notes: [50, 54, 57, 62, 66],
        descriptions: "Sequence continues.",
      },
      {
        name: "Gmaj9",
        notes: [43, 47, 50, 55, 59],
        descriptions: "Reaching home.",
      },
    ],
  },
  {
    id: "path-3",
    title: "Path III: Chromatic Descent",
    description:
      "Slipping down by half steps creates a feeling of sinking gravity.",
    steps: [
      {
        name: "Am7",
        notes: [57, 60, 64, 67],
        descriptions: "Starting high and stable.",
      },
      {
        name: "Ab7",
        notes: [56, 60, 63, 66],
        descriptions: "Tritone substitution creating downward pull.",
      },
      {
        name: "Gm7",
        notes: [55, 58, 62, 65],
        descriptions: "Resting momentarily on the new minor tonal center.",
      },
      {
        name: "Gb7",
        notes: [54, 58, 61, 64],
        descriptions: "The descent continues.",
      },
      {
        name: "Fmaj7",
        notes: [53, 57, 60, 64],
        descriptions: "Finally landing softly on the major.",
      },
      {
        name: "Em7",
        notes: [52, 55, 59, 62],
        descriptions: "Dropping further.",
      },
      { name: "Eb7", notes: [51, 55, 58, 61], descriptions: "Tritone sub." },
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "Next target." },
      { name: "Db7", notes: [49, 53, 56, 59], descriptions: "Tritone sub." },
      { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "Minor center." },
      { name: "B7", notes: [47, 51, 54, 57], descriptions: "Sub." },
      { name: "Bbm7", notes: [46, 49, 53, 56], descriptions: "Minor." },
      { name: "A7", notes: [45, 49, 52, 55], descriptions: "Sub." },
      { name: "Abm7", notes: [44, 47, 51, 54], descriptions: "Minor." },
      { name: "G7", notes: [43, 47, 50, 53], descriptions: "End of descent." },
    ],
  },
  {
    id: "path-4",
    title: "Path IV: Modal Interchange (Suspended)",
    description: "Floating, ambiguous chords that lack a defining 3rd.",
    steps: [
      {
        name: "Cmaj7",
        notes: [48, 55, 59, 64],
        descriptions: "Grounded major center.",
      },
      {
        name: "Eb/F (F9sus)",
        notes: [53, 58, 63, 67],
        descriptions:
          "Lifting off. The lack of a 3rd creates a feeling of suspension.",
      },
      {
        name: "Db/Eb (Eb9sus)",
        notes: [51, 56, 61, 65],
        descriptions: "Drifting into another key center entirely.",
      },
      {
        name: "Cmaj9",
        notes: [48, 52, 59, 62, 67],
        descriptions: "Unexpectedly dropping back home.",
      },
      {
        name: "Bb/C",
        notes: [48, 58, 62, 65],
        descriptions: "Mixolydian suspension.",
      },
      { name: "Ab/Bb", notes: [46, 56, 60, 63], descriptions: "Sliding down." },
      { name: "Gb/Ab", notes: [44, 54, 58, 61], descriptions: "Further down." },
      {
        name: "E/F#",
        notes: [42, 52, 56, 59],
        descriptions: "Modulation shift.",
      },
      {
        name: "D/E",
        notes: [40, 50, 54, 57],
        descriptions: "Suspended dominant.",
      },
      { name: "C/D", notes: [38, 48, 52, 55], descriptions: "Floating down." },
      { name: "Bb/C", notes: [36, 46, 50, 53], descriptions: "Low register." },
      { name: "G/A", notes: [45, 55, 59, 62], descriptions: "Jumping up." },
      { name: "F/G", notes: [43, 53, 57, 60], descriptions: "Suspension." },
      {
        name: "Cmaj9",
        notes: [48, 52, 59, 62, 67],
        descriptions: "Resolution.",
      },
    ],
  },
  {
    id: "path-5",
    title: "Path V: Bach - Perfect Cadence & Voice Leading",
    description:
      "Impeccable voice leading in a classic baroque resolution, focusing on independent melodic lines.",
    steps: [
      {
        name: "Bm (i)",
        notes: [47, 54, 59, 62],
        descriptions: "The minor tonic.",
      },
      {
        name: "Em7 (iv7)",
        notes: [40, 55, 59, 62],
        descriptions: "Subdominant preparation with suspended 7th.",
      },
      {
        name: "F#7sus4 (V7sus)",
        notes: [42, 54, 59, 64],
        descriptions:
          "Dominant tension arriving, but the 4th is held over (suspended).",
      },
      {
        name: "F#7 (V7)",
        notes: [42, 54, 58, 64],
        descriptions:
          "The suspension resolves downwards to the leading tone (A#).",
      },
      {
        name: "Bm (i)",
        notes: [35, 54, 59, 62],
        descriptions: "Perfect authentic cadence. Complete stability.",
      },
      {
        name: "Gmaj7",
        notes: [43, 55, 59, 62],
        descriptions: "Modulation to VI.",
      },
      {
        name: "Cmaj7",
        notes: [48, 55, 59, 64],
        descriptions: "Passing to Neapolitan.",
      },
      { name: "F#m7b5", notes: [42, 52, 57, 60], descriptions: "vii of V." },
      { name: "B7", notes: [47, 54, 57, 63], descriptions: "V of vi." },
      {
        name: "Em",
        notes: [40, 55, 59, 64],
        descriptions: "Deceptive move to iv.",
      },
      { name: "A7", notes: [45, 52, 55, 61], descriptions: "V of VII." },
      { name: "Dmaj7", notes: [50, 54, 57, 61], descriptions: "Modulation." },
      { name: "Gmaj7", notes: [43, 54, 59, 62], descriptions: "Sequence." },
      { name: "C#m7b5", notes: [49, 52, 55, 61], descriptions: "ii of Bm." },
      {
        name: "F#7sus4",
        notes: [42, 54, 59, 64],
        descriptions: "Cadential setup.",
      },
      {
        name: "F#7",
        notes: [42, 54, 58, 64],
        descriptions: "Resolution pulling to tonic.",
      },
      { name: "Bm", notes: [35, 54, 59, 62], descriptions: "Final home." },
    ],
  },
  {
    id: "path-6",
    title: "Path VI: Chopin - Romantic Chromaticism",
    description:
      "Expressive inner voices moving chromatically to heighten emotional tension before resolution.",
    steps: [
      {
        name: "Emaj",
        notes: [40, 52, 56, 59],
        descriptions: "Starting with a simple major triad.",
      },
      {
        name: "Emaj/D#",
        notes: [39, 52, 56, 59],
        descriptions: "The bass slips down, destabilizing the chord.",
      },
      {
        name: "C#m7",
        notes: [37, 52, 56, 59],
        descriptions: "Moving to the relative minor smoothly.",
      },
      {
        name: "F#9",
        notes: [42, 52, 58, 61],
        descriptions: "A secondary dominant introduces the tritone (E - A#).",
      },
      {
        name: "Bmaj7",
        notes: [47, 51, 58, 63],
        descriptions: "Romantic yearning satisfied in the new major center.",
      },
      { name: "Fm7", notes: [41, 53, 56, 60], descriptions: "Distant minor." },
      {
        name: "Bb9",
        notes: [46, 53, 56, 60],
        descriptions: "Dominant preparation.",
      },
      { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Resolution." },
      {
        name: "Abmaj7",
        notes: [44, 51, 55, 60],
        descriptions: "Lydian shift.",
      },
      {
        name: "Dbmaj7",
        notes: [49, 53, 56, 60],
        descriptions: "Chromatic planing.",
      },
      {
        name: "C7",
        notes: [48, 52, 55, 58],
        descriptions: "German augmented sixth.",
      },
      {
        name: "Bmaj7",
        notes: [47, 51, 54, 58],
        descriptions: "Enharmonic target.",
      },
      { name: "Emaj7", notes: [40, 52, 56, 59], descriptions: "Modulation." },
      {
        name: "Amaj7",
        notes: [45, 52, 56, 61],
        descriptions: "Continued sequence.",
      },
      { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "Return." },
    ],
  },
  {
    id: "path-7",
    title: "Path VII: Debussy - Planing & Whole Tone",
    description:
      "Parallel motion (planing) and extended tertian/whole-tone ambiguity breaking traditional tonal gravity.",
    steps: [
      {
        name: "C9(b5)",
        notes: [48, 54, 58, 62],
        descriptions: "A mysterious whole-tone sonority.",
      },
      {
        name: "D9(b5)",
        notes: [50, 56, 60, 64],
        descriptions:
          "Exactly the same shape shifted up a major second. Planing.",
      },
      {
        name: "E9(b5)",
        notes: [52, 58, 62, 66],
        descriptions:
          "Continuing the whole tone ascent. Traditional harmony is suspended.",
      },
      {
        name: "Ebmaj9",
        notes: [51, 58, 62, 65, 67],
        descriptions:
          "Suddenly resolving to a lush, colorful extended major voicing.",
      },
      {
        name: "E9(b5)",
        notes: [52, 58, 62, 66],
        descriptions: "Whole tone shift.",
      },
      { name: "Gb9(b5)", notes: [54, 60, 64, 68], descriptions: "Further up." },
      { name: "Ab9(b5)", notes: [56, 62, 66, 70], descriptions: "Expanding." },
      { name: "Bb9(b5)", notes: [58, 64, 68, 72], descriptions: "Continuing." },
      {
        name: "C9(b5)",
        notes: [60, 66, 70, 74],
        descriptions: "Octave reached.",
      },
      {
        name: "B9(b5)",
        notes: [59, 65, 69, 73],
        descriptions: "Slipping down.",
      },
      { name: "A9(b5)", notes: [57, 63, 67, 71], descriptions: "Descending." },
      { name: "G9(b5)", notes: [55, 61, 65, 69], descriptions: "Descending." },
      { name: "F9(b5)", notes: [53, 59, 63, 67], descriptions: "Descending." },
      {
        name: "Ebmaj9",
        notes: [51, 58, 62, 65, 67],
        descriptions: "Major landing.",
      },
    ],
  },
  {
    id: "path-8",
    title: "Path VIII: Brian Eno - Ambient Stasis",
    description:
      "Suspended diatonic clusters without traditional functional resolution, creating a floating, ambient atmosphere.",
    steps: [
      {
        name: "Dmaj9(no3)",
        notes: [38, 50, 55, 57, 60, 64],
        descriptions: "A wide, floating chord missing the defining third.",
      },
      {
        name: "Gmaj7(sus2)",
        notes: [43, 55, 57, 62, 66],
        descriptions:
          "A gentle wash of color, maintaining common tones with the previous chord.",
      },
      {
        name: "A9sus4",
        notes: [45, 52, 57, 60, 64],
        descriptions:
          "Tension that doesn't demand resolution; it simply exists.",
      },
      {
        name: "Dmaj7(sus2)",
        notes: [38, 50, 57, 61, 64],
        descriptions:
          "Returning to stability without feeling like a traditional cadence.",
      },
      {
        name: "Em9(no3)",
        notes: [40, 52, 57, 59, 62, 66],
        descriptions: "Lifting softly.",
      },
      {
        name: "Amaj7(sus2)",
        notes: [45, 57, 59, 64, 68],
        descriptions: "Gentle wash.",
      },
      {
        name: "B9sus4",
        notes: [47, 54, 59, 62, 66],
        descriptions: "Floating.",
      },
      {
        name: "Emaj7(sus2)",
        notes: [40, 52, 59, 63, 66],
        descriptions: "Stability.",
      },
      {
        name: "F#m9(no3)",
        notes: [42, 54, 59, 61, 64, 68],
        descriptions: "Lifting softly.",
      },
      {
        name: "Bmaj7(sus2)",
        notes: [47, 59, 61, 66, 70],
        descriptions: "Gentle wash.",
      },
      {
        name: "C#9sus4",
        notes: [49, 56, 61, 64, 68],
        descriptions: "Floating.",
      },
      {
        name: "F#maj7(sus2)",
        notes: [42, 54, 61, 65, 68],
        descriptions: "Stability.",
      },
      {
        name: "Emaj9(no3)",
        notes: [40, 52, 57, 59, 62, 66],
        descriptions: "Lifting softly.",
      },
      {
        name: "Dmaj7(sus2)",
        notes: [38, 50, 57, 61, 64],
        descriptions: "Home.",
      },
    ],
  },
  {
    id: "path-9",
    title: "Path IX: John Coltrane - Giant Steps",
    description:
      "The famous Coltrane Changes, rapidly modulating through keys separated by major thirds.",
    steps: [
      {
        name: "Bmaj7",
        notes: [47, 54, 58, 63],
        descriptions: "The initial major center.",
      },
      {
        name: "D7",
        notes: [50, 54, 60, 65],
        descriptions: "A dominant chord pulling down a major third from B.",
      },
      {
        name: "Gmaj7",
        notes: [43, 50, 55, 59],
        descriptions: "Resolving to the new key of G major.",
      },
      {
        name: "Bb7",
        notes: [46, 50, 56, 61],
        descriptions: "Another dominant, pulling down another major third.",
      },
      {
        name: "Ebmaj7",
        notes: [51, 55, 58, 62],
        descriptions:
          "Resolving to Eb major. The cycle of major thirds is complete.",
      },
      {
        name: "Am7",
        notes: [45, 52, 55, 60],
        descriptions: "Coltrane matrix continues.",
      },
      { name: "D7", notes: [50, 54, 60, 65], descriptions: "V of G." },
      { name: "Gmaj7", notes: [43, 50, 55, 59], descriptions: "Tonic." },
      { name: "C#m7", notes: [49, 52, 56, 61], descriptions: "ii of B." },
      { name: "F#7", notes: [42, 46, 52, 57], descriptions: "Transition." },
      { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "Tonic." },
      { name: "Fm7", notes: [41, 48, 51, 56], descriptions: "ii of Eb." },
      { name: "Bb7", notes: [46, 50, 56, 61], descriptions: "V of Eb." },
      { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Tonic." },
      { name: "Am7", notes: [45, 52, 55, 60], descriptions: "ii of G." },
      { name: "D7", notes: [50, 54, 60, 65], descriptions: "V of G." },
      { name: "Gmaj7", notes: [43, 50, 55, 59], descriptions: "Tonic." },
      { name: "C#m7", notes: [49, 52, 56, 61], descriptions: "ii of B." },
      { name: "F#7", notes: [42, 46, 52, 57], descriptions: "V of B." },
      { name: "Bmaj7", notes: [47, 54, 58, 63], descriptions: "Resolution." },
    ],
  },
  {
    id: "path-10",
    title: "Path X: Philip Glass - Minimalist Oscillation",
    description:
      "Relentless oscillation between closely related minor chords, emphasizing rhythmic pulse over harmonic motion.",
    steps: [
      {
        name: "Fm",
        notes: [41, 53, 56, 60],
        descriptions: "A stark, minor starting point.",
      },
      {
        name: "Db/F",
        notes: [41, 53, 56, 61],
        descriptions:
          "A subtle shift, highlighting the chromatic descent from C to Db.",
      },
      {
        name: "Cm",
        notes: [48, 55, 60, 63],
        descriptions: "Moving to the dominant minor.",
      },
      {
        name: "Ab/C",
        notes: [48, 56, 60, 63],
        descriptions:
          "Another subtle chromatic shift, maintaining the rhythmic momentum.",
      },
      { name: "Fm", notes: [41, 53, 56, 60], descriptions: "Back to start." },
      { name: "Db/F", notes: [41, 53, 56, 61], descriptions: "Swaying." },
      { name: "Cm", notes: [48, 55, 60, 63], descriptions: "Dominant." },
      { name: "Ab/C", notes: [48, 56, 60, 63], descriptions: "Swaying." },
      { name: "Fm", notes: [41, 53, 56, 60], descriptions: "Back to start." },
      { name: "Db/F", notes: [41, 53, 56, 61], descriptions: "Swaying." },
      { name: "Cm", notes: [48, 55, 60, 63], descriptions: "Dominant." },
      { name: "Ab/C", notes: [48, 56, 60, 63], descriptions: "Swaying." },
      { name: "Fm", notes: [41, 53, 56, 60], descriptions: "Back to start." },
      { name: "Db/F", notes: [41, 53, 56, 61], descriptions: "Swaying." },
    ],
  },
  {
    id: "path-11",
    title: "Path XI: Thelonious Monk - Angular Chromaticism",
    description:
      "Distinctive whole-tone clusters, parallel chromatic seventh chords, and unexpected tritone resolutions characteristic of Monk's style.",
    steps: [
      {
        name: "C#7",
        notes: [49, 53, 59, 63],
        descriptions: "Starting out of key.",
      },
      {
        name: "D7",
        notes: [50, 54, 60, 64],
        descriptions: "Chromatic shift up.",
      },
      { name: "C#7", notes: [49, 53, 59, 63], descriptions: "Back down." },
      { name: "D7", notes: [50, 54, 60, 64], descriptions: "Up again." },
      { name: "F#7", notes: [42, 52, 58, 64], descriptions: "Angular leap." },
      {
        name: "F7",
        notes: [41, 51, 57, 63],
        descriptions: "Chromatic descent.",
      },
      { name: "F#7", notes: [42, 52, 58, 64], descriptions: "Up." },
      { name: "F7", notes: [41, 51, 57, 63], descriptions: "Down." },
      {
        name: "Fm7b5",
        notes: [41, 48, 51, 56],
        descriptions: "Half-diminished tension.",
      },
      {
        name: "Bb7#9",
        notes: [46, 50, 56, 61, 65],
        descriptions: "Aggressive altered dominant.",
      },
      {
        name: "Ebmaj7",
        notes: [51, 55, 58, 62],
        descriptions: "Temporary resolution.",
      },
      {
        name: "Ab7",
        notes: [44, 51, 54, 60],
        descriptions: "Tritone substitution.",
      },
      {
        name: "G7#5",
        notes: [43, 51, 55, 59],
        descriptions: "Whole-tone dominant color.",
      },
      {
        name: "C9#11",
        notes: [48, 52, 58, 62, 66],
        descriptions: "Monk's signature ending chord.",
      },
    ],
  },
  {
    id: "path-12",
    title: "Path XII: Horace Silver - Hard Bop Minor",
    description:
      "Strong, bluesy minor progressions featuring descending parallel dominants and sharp-9 tensions.",
    steps: [
      {
        name: "Fm9",
        notes: [41, 53, 56, 60, 63],
        descriptions: "Deep minor groove.",
      },
      {
        name: "Eb9",
        notes: [51, 55, 61, 65],
        descriptions: "Parallel movement downwards.",
      },
      {
        name: "Db9",
        notes: [49, 53, 59, 63],
        descriptions: "Continued parallel descent.",
      },
      {
        name: "C7#9",
        notes: [48, 52, 58, 63],
        descriptions: "Searing altered dominant.",
      },
      {
        name: "Fm9",
        notes: [41, 53, 56, 60, 63],
        descriptions: "Resolution back to minor.",
      },
      {
        name: "Eb9",
        notes: [51, 55, 61, 65],
        descriptions: "Repeating the groove.",
      },
      { name: "Db9", notes: [49, 53, 59, 63], descriptions: "Down again." },
      {
        name: "C7#9",
        notes: [48, 52, 58, 63],
        descriptions: "Turnaround tension.",
      },
      {
        name: "Bbm9",
        notes: [46, 53, 56, 60, 65],
        descriptions: "iv minor chord.",
      },
      {
        name: "Eb9",
        notes: [51, 55, 61, 65],
        descriptions: "V of relative major.",
      },
      {
        name: "Abmaj7",
        notes: [44, 51, 55, 60],
        descriptions: "Relative major.",
      },
      {
        name: "Dbmaj7",
        notes: [49, 53, 56, 60],
        descriptions: "Lydian shift.",
      },
      { name: "Gm7b5", notes: [43, 46, 50, 53], descriptions: "ii of Fm." },
      {
        name: "C7#9",
        notes: [48, 52, 58, 63],
        descriptions: "V of Fm with a bluesy crunch.",
      },
      {
        name: "Fm6",
        notes: [41, 53, 56, 60, 62],
        descriptions: "Classic hard bop final minor chord.",
      },
    ],
  },
  {
    id: "path-13",
    title: "Path XIII: Woody Shaw - Quartal Modulations",
    mvpReady: true,
    description:
      "Post-bop harmonic ambiguity using chords built in fourths and triads over shifting bass notes.",
    steps: [
      {
        name: "Dmaj7#5",
        notes: [38, 50, 54, 58, 61],
        descriptions: "Floating augmented major.",
      },
      {
        name: "Fmaj7#5",
        notes: [41, 53, 57, 61, 64],
        descriptions: "Modulation up a minor third.",
      },
      {
        name: "Abmaj7#5",
        notes: [44, 56, 60, 64, 67],
        descriptions: "Continuing the minor third cycle.",
      },
      {
        name: "Bmaj7#5",
        notes: [47, 59, 63, 67, 70],
        descriptions: "Completing the symmetry.",
      },
      {
        name: "Dmaj7#5",
        notes: [38, 50, 54, 58, 61],
        descriptions: "Back to the start.",
      },
      {
        name: "Gm11",
        notes: [43, 53, 58, 63, 65],
        descriptions: "Strong quartal voicing.",
      },
      {
        name: "C7sus4",
        notes: [48, 53, 58, 65],
        descriptions: "Stack of fourths.",
      },
      {
        name: "Bmaj7",
        notes: [47, 51, 58, 63],
        descriptions: "Unexpected half-step resolution.",
      },
      {
        name: "Emaj7",
        notes: [40, 52, 56, 63],
        descriptions: "Moving through the cycle of fifths.",
      },
      {
        name: "Cm11",
        notes: [48, 58, 63, 68, 70],
        descriptions: "Quartal shift.",
      },
      {
        name: "F7sus4",
        notes: [53, 58, 63, 70],
        descriptions: "Dominant suspension.",
      },
      {
        name: "Emaj7",
        notes: [40, 52, 56, 63],
        descriptions: "Deceptive resolution.",
      },
      { name: "Amaj7", notes: [45, 52, 56, 61], descriptions: "Cycle." },
      {
        name: "Eb/D",
        notes: [50, 55, 58, 63],
        descriptions: "Slash chord tension.",
      },
      {
        name: "Dmaj9",
        notes: [38, 50, 54, 57, 64],
        descriptions: "Bright open conclusion.",
      },
      {
        name: "Cmaj9",
        notes: [48, 52, 55, 59, 64],
        descriptions: "Pickup to restart the cycle.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Phase 5: classical-persona paths (Scriabin, Rachmaninov, Brahms,
  // Tchaikovsky, Mahler). Each is a 4-bar, 4-step path the persona loads
  // by default. Notes are voiced for the persona's signature technique —
  // quartal stacks for Scriabin, open drop-3 for Rachmaninov, etc.
  // -------------------------------------------------------------------------
  {
    id: "mystic_prometheus",
    title: "Path XXXIII: The Mystic Chord",
    description:
      "Quartal stacks that never resolve. Color as destination, not decoration.",
    composer: "A. Scriabin",
    key: "C",
    feel: "mystic / non-functional",
    steps: [
      { name: "C quartal", notes: [48, 53, 58, 63], descriptions: "Stacked fourths on C." },
      { name: "Gb quartal", notes: [42, 47, 52, 57], descriptions: "Stacked fourths on Gb." },
      { name: "B quartal", notes: [47, 52, 57, 62], descriptions: "Stacked fourths on B." },
      { name: "E quartal", notes: [40, 45, 50, 55], descriptions: "Stacked fourths on E." },
    ],
  },
  {
    id: "bell_sonority",
    title: "Path XXXIV: The Bell",
    description:
      "Low root, wide gap, high chord. The Dies irae shadow hangs over every bar.",
    composer: "S. Rachmaninov",
    key: "C minor",
    feel: "mournful / pianistic",
    steps: [
      { name: "Cm", notes: [36, 48, 51, 55], descriptions: "Low root, wide gap, mid voicing." },
      { name: "AbM", notes: [44, 51, 56, 63], descriptions: "Tritone step, bell sonority." },
      { name: "Fm", notes: [41, 48, 53, 58], descriptions: "Subdominant minor, sparse." },
      { name: "C5", notes: [36, 48, 60], descriptions: "Open fifth, frozen bass." },
    ],
  },
  {
    id: "developing_variation",
    title: "Path XXXV: The Motif Grows",
    description:
      "One motif, four transformations. Track it across all four bars.",
    composer: "J. Brahms",
    key: "C minor",
    feel: "developing / contrapuntal",
    steps: [
      { name: "Cm", notes: [48, 51, 55, 58], descriptions: "Statement — close, dense." },
      { name: "Cm/Ab", notes: [44, 51, 55, 58], descriptions: "Inversion — bass above root." },
      { name: "AbM", notes: [44, 51, 56, 63], descriptions: "Augmentation — wide spread." },
      { name: "Cm", notes: [48, 51, 55, 58], descriptions: "Return, transformed." },
    ],
  },
  {
    id: "sequence_ascent",
    title: "Path XXXVI: The Ascent",
    description:
      "Same shape, stepped up by a second, three times. Climax on the fourth.",
    composer: "P. I. Tchaikovsky",
    key: "D minor",
    feel: "lyrical / sequential",
    sequenceStepper: true,
    sequenceInterval: 2,
    steps: [
      { name: "Dm", notes: [50, 53, 57, 60], descriptions: "Sequence 1." },
      { name: "Em", notes: [52, 55, 59, 62], descriptions: "Sequence 2 — up a 2nd." },
      { name: "F#m", notes: [54, 57, 61, 64], descriptions: "Sequence 3 — up a 2nd." },
      { name: "GM", notes: [55, 59, 62, 67], descriptions: "Climax — major resolution." },
    ],
  },
  {
    id: "progressive_tonality",
    title: "Path XXXVII: The Journey",
    description:
      "Start in one key, end in another. No return. The path itself is the point.",
    composer: "G. Mahler",
    key: "D minor → C major",
    feel: "orchestral / progressive",
    steps: [
      { name: "Dm", notes: [50, 53, 57, 62], descriptions: "Begin — D minor." },
      { name: "BbM", notes: [46, 53, 58, 62], descriptions: "Drift — third relation." },
      { name: "F#m", notes: [42, 49, 54, 59], descriptions: "Displacement — half-key away." },
      { name: "CM", notes: [48, 52, 55, 60], descriptions: "End — C major, foreign key." },
    ],
  },

  // -------------------------------------------------------------------------
  // Phase 1: persona signature paths (XXXVIII–LIV). One 4-bar study per
  // persona, demonstrating the technique the persona is known for. The
  // behavioral rules (sequenceStepper / sequenceInterval, key arrow,
  // bassIsolation, sliceAndRepeat, motifTracker) are wired so the
  // bar-strip markers fire in the UI. padPath() cycles each 4-step
  // source into the 24-bar audio loop automatically.
  // -------------------------------------------------------------------------
  {
    id: "prometheus_flame",
    title: "Path XXXVIII: The Flame",
    description:
      "Scriabin's quartal flame: stacked fourths burning in place while the bass shifts underneath.",
    composer: "A. Scriabin",
    key: "C",
    feel: "mystic / quartal",
    steps: [
      { name: "C quartal held", notes: [36, 41, 46, 51], descriptions: "C2 / F2 / Bb2 / Eb3 — the mystic stack." },
      { name: "C quartal (root rises)", notes: [41, 46, 51, 56], descriptions: "Bass lifts from C2 to F2; chord stays." },
      { name: "C quartal + 7", notes: [36, 41, 46, 51, 54], descriptions: "Add the leading 7th — flame grows brighter." },
      { name: "C quartal cluster", notes: [36, 41, 46, 51, 51], descriptions: "Cluster on Eb3 — heat." },
    ],
  },
  {
    id: "prelude_chord",
    title: "Path XXXIX: The Prelude Chord",
    description:
      "Rachmaninov's bell sonority: low root, frozen bass, wide voicing — the piano as orchestra.",
    composer: "S. Rachmaninov",
    key: "C# minor",
    feel: "mournful / pianistic",
    steps: [
      { name: "C#m low", notes: [37, 49, 52, 56], descriptions: "C#2 / C#3 / E3 / G#3 — the bell strikes." },
      { name: "C#m sustained bass", notes: [37, 53, 56, 61], descriptions: "Bass frozen; upper voices drift." },
      { name: "A maj bell", notes: [45, 52, 56, 64], descriptions: "Bass rises to A1 — bell two." },
      { name: "C#m9 resolve", notes: [37, 51, 54, 60, 64], descriptions: "Resolve to C#m9 — grief made harmony." },
    ],
  },
  {
    id: "symphony_theme",
    title: "Path XL: The Theme and Variations",
    description:
      "Brahms's developing variation: one motif, four guises. Listen for what stays the same.",
    composer: "J. Brahms",
    key: "F minor",
    feel: "developing / contrapuntal",
    steps: [
      { name: "Fm statement", notes: [41, 44, 48, 53], descriptions: "F2 / Ab2 / B2 / F3 — the theme." },
      { name: "Fm inversion", notes: [53, 56, 60, 65], descriptions: "Bass on F3 — motif turned upside down." },
      { name: "Ab maj (relative)", notes: [44, 48, 52, 56], descriptions: "Relative major — variation 3." },
      { name: "Fm return transformed", notes: [41, 48, 53, 58, 63], descriptions: "Return — but never the same." },
    ],
  },
  {
    id: "siren",
    title: "Path XLI: The Siren",
    description:
      "Tchaikovsky's descending sequence: same shape, stepped down by a whole step each bar.",
    composer: "P. I. Tchaikovsky",
    key: "D minor",
    feel: "lyrical / descending",
    sequenceStepper: true,
    sequenceInterval: -1,
    steps: [
      { name: "Am", notes: [45, 48, 52, 57], descriptions: "Bar 1 — sequence starts on A." },
      { name: "G", notes: [43, 47, 50, 55], descriptions: "Bar 2 — down a whole step to G." },
      { name: "F", notes: [41, 45, 48, 53], descriptions: "Bar 3 — down to F." },
      { name: "E", notes: [40, 44, 47, 52], descriptions: "Bar 4 — bottom of the descent, E." },
    ],
  },
  {
    id: "adagio",
    title: "Path XLII: The Adagio",
    description:
      "Mahler's slow key drift: F minor opens, Ab major answers. The key signature itself is the journey.",
    composer: "G. Mahler",
    key: "F minor → Ab major",
    feel: "orchestral / slow_drift",
    steps: [
      { name: "Fm", notes: [41, 44, 48, 53], descriptions: "Begin — F minor." },
      { name: "Gm", notes: [43, 46, 50, 55], descriptions: "Drift — neighbor minor." },
      { name: "Gm7", notes: [43, 46, 50, 55, 58], descriptions: "Seventh arrives." },
      { name: "AbM", notes: [44, 48, 52, 56], descriptions: "Resolution — Ab major, foreign key." },
    ],
  },
  {
    id: "giant_steps_cycle",
    title: "Path XLIII: The Cycle",
    description:
      "Coltrane's major-third cycle: B → G → Eb → B. Tonic returns, but everything between it has changed.",
    composer: "J. Coltrane",
    key: "B major (tonal center)",
    feel: "giant_steps / cycling",
    steps: [
      { name: "B", notes: [47, 50, 54, 59], descriptions: "B major — first tonal center." },
      { name: "G", notes: [43, 47, 50, 55], descriptions: "Down a major third — G." },
      { name: "Eb", notes: [39, 43, 46, 51], descriptions: "Down another major third — Eb." },
      { name: "B", notes: [47, 50, 54, 59], descriptions: "Return to B — sheets of sound in between." },
    ],
  },
  {
    id: "invention_1",
    title: "Path XLIV: The Invention",
    description:
      "Bach's two-part invention: subject, inversion, answer, dominant — counterpoint as conversation.",
    composer: "J.S. Bach",
    key: "C major",
    feel: "contrapuntal",
    steps: [
      { name: "C subject", notes: [48, 52, 55, 60], descriptions: "C / E / G / C — the subject." },
      { name: "C inversion", notes: [60, 64, 67, 72], descriptions: "Subject inverted — C5 / E5 / G5 / C6." },
      { name: "C answer", notes: [48, 52, 55, 60], descriptions: "Answer — back to the original shape." },
      { name: "G V7", notes: [43, 47, 50, 55, 59], descriptions: "Dominant G7 — drive to cadence." },
    ],
  },
  {
    id: "whole_tone_study",
    title: "Path XLV: The Whole-Tone Garden",
    description:
      "Debussy's planing: parallel whole-tone clusters drifting by half step. No gravity, only color.",
    composer: "C. Debussy",
    key: "C whole-tone",
    feel: "impressionist / planing",
    steps: [
      { name: "C WT", notes: [48, 50, 52, 54], descriptions: "C / D / E / F# — whole-tone stack on C." },
      { name: "Db WT", notes: [49, 51, 53, 55], descriptions: "Db / Eb / F / G — planed up a half step." },
      { name: "Eb WT", notes: [51, 53, 55, 57], descriptions: "Eb / F / G / A — planed again." },
      { name: "F WT", notes: [53, 55, 57, 59], descriptions: "F / G / A / B — floating." },
    ],
  },
  {
    id: "ambient_field",
    title: "Path XLVI: The Ambient Field",
    description:
      "Eno's drone: sustained low root, soft upper Lydian color. The chord changes, the field doesn't.",
    composer: "B. Eno",
    key: "C Lydian",
    feel: "ambient / drone",
    steps: [
      { name: "C drone", notes: [36, 48, 50, 54], descriptions: "C2 / C4 / D / F# — Lydian on low C." },
      { name: "F drone", notes: [41, 53, 55, 59], descriptions: "F2 / F4 / G / B — drone moves." },
      { name: "G drone", notes: [43, 55, 57, 61], descriptions: "G2 / G4 / A / C# — Lydian lift." },
      { name: "C drone", notes: [36, 48, 50, 54], descriptions: "Return to C — nothing happened." },
    ],
  },
  {
    id: "koyaanisqatsi_ostinato",
    title: "Path XLVII: The Koyaanisqatsi Ostinato",
    description:
      "Glass's additive ostinato: Dm and Dm7 in alternating pattern. Repetition as revelation.",
    composer: "P. Glass",
    key: "D minor",
    feel: "minimalist / additive",
    steps: [
      { name: "Dm", notes: [50, 53, 57], descriptions: "D / F / A — bare triad." },
      { name: "Dm + 7", notes: [50, 53, 57, 60], descriptions: "Add the minor 7th — C." },
      { name: "Dm", notes: [50, 53, 57], descriptions: "Back to triad." },
      { name: "Dm + 7", notes: [50, 53, 57, 60], descriptions: "And again — additive pulse." },
    ],
  },
  {
    id: "monk_stab",
    title: "Path XLVIII: The Monk Stab",
    description:
      "Monk's angular attack: stride bass, slash chord, tritone-related surprise, return.",
    composer: "T. Monk",
    key: "Bb minor",
    feel: "angular / dissonant",
    steps: [
      { name: "Bbm", notes: [46, 49, 53, 58], descriptions: "Bb / Db / F / Ab — the stab." },
      { name: "Bbm (slash)", notes: [58, 46, 49, 53], descriptions: "Slash chord — Ab first." },
      { name: "Gb maj7", notes: [42, 46, 49, 54, 58], descriptions: "Surprise move to Gb maj7 — tritone-related." },
      { name: "Bbm return", notes: [46, 49, 53, 58], descriptions: "Return to Bbm — but you've heard the tritone." },
    ],
  },
  {
    id: "so_what_vamp",
    title: "Path XLIX: So What Vamp",
    description:
      "Miles's modal restraint: Dm7 holds, Em7 answers, Dm7 returns. Bass rarely moves — the harmonic rhythm is the music.",
    composer: "M. Davis",
    key: "D Dorian",
    feel: "modal / cool",
    // bassIsolation mirrors the persona-side rule on the path so the
    // bar-strip marker / test introspection see a single source of truth.
    bassIsolation: true,
    steps: [
      { name: "Dm7 (D Dorian)", notes: [50, 53, 57, 60], descriptions: "D / F / A / C — D Dorian center." },
      { name: "Dm7 sustained", notes: [50, 53, 57, 60], descriptions: "Held — Miles says nothing." },
      { name: "Em7 (E Dorian)", notes: [52, 55, 59, 62], descriptions: "Lift to E Dorian — modal answer." },
      { name: "Dm7 return", notes: [50, 53, 57, 60], descriptions: "Return — restraint confirmed." },
    ],
  },
  {
    id: "my_funny_valentine",
    title: "Path L: My Funny Valentine",
    description:
      "Chet's ballad tone: sparse Cm, Ab maj7, G7. The space between chords is the music.",
    composer: "R. Rodgers / L. Hart",
    key: "C minor",
    feel: "ballad / sparse",
    steps: [
      { name: "Cm", notes: [48, 51, 55], descriptions: "C / Eb / G — sparse Cm." },
      { name: "Cm held", notes: [48, 51, 55], descriptions: "Held — breath." },
      { name: "Ab maj7", notes: [44, 48, 52, 55, 58], descriptions: "Ab / C / Eb / G / Bb — warmth." },
      { name: "G7", notes: [43, 47, 50, 55, 59], descriptions: "G / B / D / F / Ab — pull toward Cm." },
    ],
  },
  {
    id: "salt_peanuts_figure",
    title: "Path LI: Salt Peanuts Figure",
    description:
      "Dizzy's bebop angularity: Bb / G7 / Cm7 / F7 — major and minor ii-V chains at speed.",
    composer: "K. Clarke / T. Monk (attrib.)",
    key: "Bb major",
    feel: "bebop / angular",
    steps: [
      { name: "Bb", notes: [46, 50, 53, 58], descriptions: "Bb / D / F / Bb — tonic." },
      { name: "G7", notes: [43, 47, 50, 55, 59], descriptions: "G / B / D / F / Ab — V of Cm." },
      { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "C / Eb / G / Bb — minor ii answer." },
      { name: "F7", notes: [41, 45, 48, 53, 57], descriptions: "F / A / C / Eb / Gb — V of Bb." },
    ],
  },
  {
    id: "red_clay_changes",
    title: "Path LII: Red Clay Changes",
    description:
      "Hubbard's hard-bop line: Fm7 / Eb7alt / Abmaj7 / Db13 — bluesy minor changes with altered dominants.",
    composer: "F. Hubbard",
    key: "F minor",
    feel: "hard_bop / blues",
    steps: [
      { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "F / Ab / C / Eb — minor statement." },
      { name: "Eb7 alt", notes: [39, 43, 46, 49, 53], descriptions: "Eb / G / Bb / Db / F — altered with b9 + #11." },
      { name: "Ab maj7", notes: [44, 48, 52, 55, 58], descriptions: "Ab / C / Eb / G / Bb — relative major." },
      { name: "Db13", notes: [37, 41, 44, 50, 53, 57], descriptions: "Db / F / Ab / D / F / A — turnaround with the 13th." },
    ],
  },
  {
    id: "footprints_vamp",
    title: "Path LIII: Footprints Vamp",
    description:
      "Shorter's modal geometry: Cm / Ab / Db / Cm. Three-key vamp, cyclical, elliptical.",
    composer: "W. Shorter",
    key: "C minor (modal)",
    feel: "modal / vamp",
    steps: [
      { name: "Cm vamp", notes: [48, 51, 55, 58], descriptions: "C / Eb / G / Bb — modal Cm." },
      { name: "Ab vamp", notes: [44, 48, 51, 55], descriptions: "Ab / C / Eb / G — rotation to Ab." },
      { name: "Db vamp", notes: [49, 53, 56, 60], descriptions: "Db / F / Ab / C — further rotation." },
      { name: "Cm vamp", notes: [48, 51, 55, 58], descriptions: "Return to Cm — elliptical phrase closes." },
    ],
  },
  {
    id: "color_shape_study",
    title: "Path LIV: Color Shapes",
    description:
      "Kandinsky's color-form correspondence: triangle (major), circle (minor), darker triangle (dim), brighter triangle (aug).",
    composer: "W. Kandinsky (synth)",
    key: "C",
    feel: "synthesis / geometric",
    steps: [
      { name: "C major triad", notes: [48, 52, 55], descriptions: "C / E / G — yellow triangle." },
      { name: "C minor triad", notes: [48, 51, 55], descriptions: "C / Eb / G — blue circle." },
      { name: "C dim triad", notes: [48, 51, 54], descriptions: "C / Eb / Gb — darker triangle." },
      { name: "C aug triad", notes: [48, 52, 56], descriptions: "C / E / G# — brighter triangle." },
    ],
  },
];


// ---------------------------------------------------------------------------
// Study materials — generated by scripts/ingest_standards.py.
// 19 jazz standards from the Isaac Raz MasterClass, parsed into playable
// HarmonicPath entries with proper MIDI notes (audioEngine-renderable).
//
// These are NOT included in ALL_PATHS — they're surfaced separately
// through the Masterclass picker (src/components/PlaySessionRail.tsx),
// which prepends a picked song to the user's paths state on demand.
// Keeping them out of ALL_PATHS means the main path browser stays
// focused on curated educational concepts.
// ---------------------------------------------------------------------------
import { CONCEPT_PATHS } from "./conceptPaths";
import { STUDIES_PATHS as GENERATED_STUDIES_PATHS } from "./studies";

export const STUDIES_PATHS: HarmonicPath[] = GENERATED_STUDIES_PATHS.map(padPath);

/**
 * Curated PATHS exposed to consumers — already padded to the
 * [MIN_PATH_BARS, MAX_PATH_BARS] bar range and name-backfilled.
 *
 * Phase 3: spreads the educational CONCEPT_PATHS in alongside the
 * curated RAW_PATHS so the persona bar-strip markers fire on the
 * concept exercises too.
 */
export const PATHS: HarmonicPath[] = [...RAW_PATHS, ...CONCEPT_PATHS].map((p) => {
  const padded = padPath({
    ...p,
    name: p.name ?? p.title,
  });
  // Warn in dev if a raw path was over the cap and had to be trimmed.
  // (Under-length paths get padded silently — that's the intended
  // behavior.)
  if (p.steps.length > MAX_PATH_BARS * STEPS_PER_BAR && padded.steps.length < p.steps.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[paths] '${p.id}' was ${(p.steps.length / STEPS_PER_BAR).toFixed(1)} bars — ` +
        `trimmed to ${MAX_PATH_BARS} bars to fit policy. ` +
        `Consider splitting into multiple paths.`,
    );
  }
  return padded;
});

export const ALL_PATHS: HarmonicPath[] = PATHS;

/**
 * Look up a HarmonicPath across both curated PATHS and STUDIES_PATHS.
 * Use this anywhere a path id might come from a practice set, an
 * import, or the masterclass catalog — not just from the main
 * browser.
 */
export function findPathById(id: string): HarmonicPath | undefined {
  return ALL_PATHS.find((p) => p.id === id) ?? STUDIES_PATHS.find((p) => p.id === id);
}

// ─── Practice Sets ─────────────────────────────────────────────────────────────

export interface PracticeSetItem {
  pathId: string;
  /** 1-indexed bar number, inclusive. Omit to use the full path. */
  startBar?: number;
  /** 1-indexed bar number, inclusive. Omit to play to end. */
  endBar?: number;
}

export interface PracticeSet {
  id: string;
  title: string;
  description: string;
  focusTags: string[];
  items: PracticeSetItem[];
  /** Default BPM. User can override per session. */
  defaultTempo: number;
  /** Default repetitions of the full set. */
  defaultReps: number;
  /** Default transpose in semitones. */
  defaultTransposeSemitones: number;
  suggestedFrequency?: "daily" | "weekly" | "as-needed";
  /** Built-in seed set — cannot be deleted or edited by the user. */
  seed?: boolean;
}

export interface PracticeSession {
  setId: string;
  setTitle: string;
  completedAt: string; // ISO 8601
  reps: number;
  tempo: number;
  transposeSemitones: number;
  stepsCompleted: number;
  durationSeconds: number;
}
