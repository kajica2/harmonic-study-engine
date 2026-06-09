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
}

export const PATHS: HarmonicPath[] = [
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
    ],
  },
];
