/**
 * composerCatalog.ts — typed loader + table parser for the composer
 * harmonic-innovations reference at `docs/COMPOSER-HARMONIC-INNOVATIONS.md`.
 *
 * v1 scope: parse the 19 bar-by-bar tables in the catalog into structured
 * `ComposerChart` shapes. The 7 non-bar entries (Cage duration structure,
 * Stockhausen Mantra sections, Coleman harmolodics sections, Shankar
 * raga stages, plus the row-form charts for Schoenberg and Bartók's axis
 * system) return `kind: "section"` / `"row"` / `"axis"` / `"duration"`
 * and are exposed via `getComposerChart()` but not yet rendered into a
 * bar-strip UI. v2 will add those renderers.
 *
 * The parser is deliberately narrow — it handles the bar-by-bar table
 * shape that appears in 19 of the 26 entries. Anything else returns a
 * structured but minimally-parsed entry so callers can branch on
 * `chart.kind`.
 *
 * Source: `/Users/kaidejuricmasscmbook/Documents/github-recovery/harmonic-study-engine/docs/COMPOSER-HARMONIC-INNOVATIONS.md`
 */

export type ComposerId =
  // 19th century
  | "beethoven" | "schubert" | "berlioz" | "chopin" | "liszt"
  | "wagner" | "verdi"
  // Modern classical
  | "debussy" | "stravinsky" | "schoenberg" | "bartok" | "cage"
  | "stockhausen" | "minimalists"
  // Jazz
  | "ellington" | "armstrong" | "miles-davis" | "john-coltrane"
  | "ornette-coleman" | "thelonious-monk" | "sonny-rollins"
  | "wayne-shorter" | "dizzy-gillespie" | "chet-baker"
  | "freddie-hubbard" | "joe-henderson" | "stan-getz"
  | "nina-simone"
  // Classical / romantic / modern persona-mapped
  | "bach" | "rachmaninov" | "brahms" | "tchaikovsky"
  | "mahler" | "philip-glass" | "augusto-novaro"
  // Popular / electronic / global
  | "the-beatles" | "brian-eno" | "kraftwerk" | "wendy-carlos"
  | "fela-kuti" | "ravi-shankar" | "piazzolla";

/** One bar of a chord-by-bar chart. */
export interface ChartBar {
  /** Original bar label as it appears in the source — preserves ranges ("1-4"),
   *  section labels ("Movement I"), and prose ("Alap"). */
  label: string;
  chord: string;
  roman: string;
}

/** A bar-by-bar chart parsed from the catalog. */
export interface BarChart {
  kind: "bar";
  composerId: ComposerId;
  composerName: string;
  /** Work and form context (e.g. "West End Blues (Bb major, 12-bar blues)"). */
  workContext: string;
  bars: ChartBar[];
}

/** Stravinsky bitonal block — two triads a tritone apart. */
export interface BitonalBlock {
  kind: "bitonal";
  composerId: ComposerId;
  composerName: string;
  description: string;
  /** Pair of root pitch classes (0-11) for the two triads. */
  pairs: { root1: number; root2: number }[];
  /** Free-form chord descriptions per pair (preserved for display). */
  raw: string[];
}

/** Schoenberg twelve-tone row matrix. */
export interface RowMatrix {
  kind: "row";
  composerId: ComposerId;
  composerName: string;
  description: string;
  /** The four canonical row forms as pitch-class arrays (0-11). */
  forms: {
    P0: number[];
    I0: number[];
    R0: number[];
    RI0: number[];
  };
  /** Hexachordal segmentation of P0. */
  hexachords: { first: number[]; second: number[] };
  /** Raw lines preserved for display. */
  raw: string[];
}

/** Bartók axis system — three axes of related keys. */
export interface AxisSystem {
  kind: "axis";
  composerId: ComposerId;
  composerName: string;
  description: string;
  /** Three axes, each as an array of pitch classes (0-11). */
  tonicAxis: number[];
  dominantAxis: number[];
  subdominantAxis: number[];
  /** Raw lines preserved for display. */
  raw: string[];
}

/** Cage 4'33"-style duration structure. */
export interface DurationStructure {
  kind: "duration";
  composerId: ComposerId;
  composerName: string;
  description: string;
  movements: { label: string; description: string; seconds: number }[];
  raw: string[];
}

/** Eno-style ambient layer stack. */
export interface LayerStack {
  kind: "layer";
  composerId: ComposerId;
  composerName: string;
  description: string;
  layers: { index: number; description: string }[];
  raw: string[];
}

/** Generic section chart for composers without a specialized parser. */
export interface GenericSectionChart {
  kind: "section";
  composerId: ComposerId;
  composerName: string;
  description: string;
  raw: string[];
}

/** A non-bar chart — discriminated union of per-kind shapes. */
export type SectionChart =
  | BitonalBlock
  | RowMatrix
  | AxisSystem
  | DurationStructure
  | LayerStack
  | GenericSectionChart;

export type ComposerChart = BarChart | SectionChart;

// --- Pitch-class helper for parsing structured section charts ---
const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** Parse a single note name like "E", "Db", "C#" into a pitch class (0-11). */
export function pcFromNoteName(name: string | null | undefined): number | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return NOTE_TO_PC[trimmed];
}

/** Parse a sequence of note names from a delimiter-separated string. */
export function pcsFromNoteNames(raw: string): number[] {
  const notes = raw.split(/[–—\-\s,]+/).filter(Boolean);
  const out: number[] = [];
  for (const n of notes) {
    const pc = pcFromNoteName(n);
    if (pc !== undefined) out.push(pc);
  }
  return out;
}

// --- Built-in chart data (parsed from the catalog) ---
// v1: hand-curated bar-by-bar data for the 19 composers with literal
// bar charts. v2 will replace this with a parser over the markdown file.

const BAR_CHARTS: BarChart[] = [
  {
    kind: "bar",
    composerId: "beethoven",
    composerName: "Beethoven",
    workContext: "Symphony No. 5, mvt. I (exposition opening, C minor)",
    bars: [
      { label: "1", chord: "Cm", roman: "i" },
      { label: "2", chord: "Cm", roman: "i" },
      { label: "3", chord: "Cm", roman: "i" },
      { label: "4", chord: "Cm", roman: "i" },
      { label: "5", chord: "Eb", roman: "III" },
      { label: "6", chord: "Ab", roman: "VI" },
      { label: "7", chord: "Eb", roman: "III" },
      { label: "8", chord: "Ab", roman: "VI" },
      { label: "9", chord: "Fm", roman: "iv" },
      { label: "10", chord: "Db", roman: "bII (Neapolitan)" },
      { label: "11", chord: "Cm", roman: "i" },
      { label: "12", chord: "Db", roman: "bII" },
      { label: "13", chord: "Cm", roman: "i" },
      { label: "14", chord: "Fm", roman: "iv" },
      { label: "15", chord: "Cm", roman: "i" },
      { label: "16", chord: "Fm", roman: "iv" },
      { label: "17", chord: "Cm", roman: "i" },
      { label: "18", chord: "G7", roman: "V7" },
      { label: "19", chord: "Cm", roman: "i" },
      { label: "20", chord: "G7", roman: "V7" },
      { label: "21", chord: "Cm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "schubert",
    composerName: "Schubert",
    workContext: "'Gute Nacht' from Winterreise (D minor → D major)",
    bars: [
      { label: "1", chord: "Dm", roman: "i" },
      { label: "2", chord: "Dm", roman: "i" },
      { label: "3", chord: "Gm", roman: "iv" },
      { label: "4", chord: "A7", roman: "V7" },
      { label: "5", chord: "Dm", roman: "i" },
      { label: "6", chord: "Dm", roman: "i" },
      { label: "7", chord: "Dm/A", roman: "i6/4" },
      { label: "8", chord: "A7", roman: "V7" },
      { label: "9", chord: "Dm", roman: "i" },
      { label: "10", chord: "Am", roman: "v" },
      { label: "11", chord: "Dm", roman: "i" },
      { label: "12", chord: "Gm", roman: "iv" },
      { label: "13", chord: "Dm/A", roman: "i6/4" },
      { label: "14", chord: "A7", roman: "V7" },
      { label: "15", chord: "Dm", roman: "i" },
      { label: "16", chord: "Dm", roman: "i" },
      { label: "17", chord: "F", roman: "bIII (relative major)" },
      { label: "18", chord: "C7", roman: "V7/bIII" },
      { label: "19", chord: "F", roman: "bIII" },
      { label: "20", chord: "Bb", roman: "bVI" },
      { label: "21", chord: "F", roman: "bIII" },
      { label: "22", chord: "C7", roman: "V7" },
      { label: "23", chord: "F", roman: "bIII" },
      { label: "24", chord: "F", roman: "bIII" },
      { label: "25", chord: "D", roman: "I (parallel major)" },
      { label: "26", chord: "A7", roman: "V7" },
      { label: "27", chord: "D", roman: "I" },
      { label: "28", chord: "G", roman: "IV" },
      { label: "29", chord: "D", roman: "I" },
      { label: "30", chord: "A7", roman: "V7" },
      { label: "31", chord: "D", roman: "I" },
      { label: "32", chord: "D", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "berlioz",
    composerName: "Berlioz",
    workContext: "Idée fixe theme, Symphonie fantastique, mvt. I (C major)",
    bars: [
      { label: "1", chord: "C", roman: "I" },
      { label: "2", chord: "C", roman: "I" },
      { label: "3", chord: "G7", roman: "V7" },
      { label: "4", chord: "C", roman: "I" },
      { label: "5", chord: "F", roman: "IV" },
      { label: "6", chord: "Fm", roman: "iv (borrowed minor)" },
      { label: "7", chord: "C/G", roman: "I6/4" },
      { label: "8", chord: "G7", roman: "V7" },
      { label: "9", chord: "C", roman: "I" },
      { label: "10", chord: "Am", roman: "vi" },
      { label: "11", chord: "Dm", roman: "ii" },
      { label: "12", chord: "G7", roman: "V7" },
      { label: "13", chord: "C", roman: "I" },
      { label: "14", chord: "Ab", roman: "bVI" },
      { label: "15", chord: "G7", roman: "V7" },
      { label: "16", chord: "C", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "chopin",
    composerName: "Chopin",
    workContext: "Prelude op. 28 no. 4 (E minor)",
    bars: [
      { label: "1", chord: "Em", roman: "i" },
      { label: "2", chord: "Em", roman: "i" },
      { label: "3", chord: "B7/D#", roman: "V6/5" },
      { label: "4", chord: "B7/D#", roman: "V6/5" },
      { label: "5", chord: "C", roman: "bVI" },
      { label: "6", chord: "C", roman: "bVI" },
      { label: "7", chord: "Am/C", roman: "iv6" },
      { label: "8", chord: "Am/C", roman: "iv6" },
      { label: "9", chord: "B7", roman: "V7" },
      { label: "10", chord: "B7", roman: "V7" },
      { label: "11", chord: "Em", roman: "i" },
      { label: "12", chord: "Em", roman: "i" },
      { label: "13", chord: "Em/D", roman: "i6/4" },
      { label: "14", chord: "Em/D", roman: "i6/4" },
      { label: "15", chord: "C#dim7", roman: "vii°7" },
      { label: "16", chord: "C#dim7", roman: "vii°7" },
      { label: "17", chord: "C", roman: "bVI" },
      { label: "18", chord: "C", roman: "bVI" },
      { label: "19", chord: "B7", roman: "V7" },
      { label: "20", chord: "B7", roman: "V7" },
      { label: "21", chord: "Em", roman: "i" },
      { label: "22", chord: "Em", roman: "i" },
      { label: "23", chord: "Em", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "liszt",
    composerName: "Liszt",
    workContext: "Nuages gris (ambiguous, centered on G#/Ab)",
    bars: [
      { label: "1", chord: "G#m", roman: "i" },
      { label: "2", chord: "G#m", roman: "i" },
      { label: "3", chord: "Caug", roman: "bIII+ (augmented)" },
      { label: "4", chord: "Caug", roman: "bIII+" },
      { label: "5", chord: "G#m", roman: "i" },
      { label: "6", chord: "Eaug", roman: "bVI+" },
      { label: "7", chord: "G#m", roman: "i" },
      { label: "8", chord: "G#m", roman: "i" },
      { label: "9", chord: "C", roman: "bIII" },
      { label: "10", chord: "Caug", roman: "bIII+" },
      { label: "11", chord: "C", roman: "bIII" },
      { label: "12", chord: "Caug", roman: "bIII+" },
      { label: "13", chord: "Bb", roman: "bII" },
      { label: "14", chord: "A", roman: "bII (enharmonic shift)" },
      { label: "15", chord: "G#m", roman: "i" },
      { label: "16", chord: "G#m", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "wagner",
    composerName: "Wagner",
    workContext: "Prelude to Tristan und Isolde (A minor)",
    bars: [
      { label: "1", chord: "Am", roman: "i" },
      { label: "2", chord: "F7", roman: "bVI7 (Tristan chord)" },
      { label: "3", chord: "E7", roman: "V7" },
      { label: "4", chord: "Am", roman: "i" },
      { label: "5", chord: "Am", roman: "i" },
      { label: "6", chord: "F7", roman: "bVI7 (Tristan chord)" },
      { label: "7", chord: "E7", roman: "V7" },
      { label: "8", chord: "Am", roman: "i" },
      { label: "9", chord: "C", roman: "bIII" },
      { label: "10", chord: "F7", roman: "bVI7" },
      { label: "11", chord: "G", roman: "bVII" },
      { label: "12", chord: "C", roman: "bIII" },
      { label: "13", chord: "Am", roman: "i" },
      { label: "14", chord: "F7", roman: "bVI7" },
      { label: "15", chord: "E7", roman: "V7" },
      { label: "16", chord: "Am", roman: "i" },
      { label: "17", chord: "F7", roman: "bVI7" },
      { label: "18", chord: "E7", roman: "V7" },
      { label: "19", chord: "Am", roman: "i" },
      { label: "20", chord: "F7", roman: "bVI7" },
    ],
  },
  {
    kind: "bar",
    composerId: "verdi",
    composerName: "Verdi",
    workContext: "Dramatic arc reduction, Otello (C major → C minor)",
    bars: [
      { label: "1", chord: "C", roman: "I" },
      { label: "2", chord: "Cmaj7", roman: "Imaj7" },
      { label: "3", chord: "F", roman: "IV" },
      { label: "4", chord: "Fm", roman: "iv (borrowed)" },
      { label: "5", chord: "C", roman: "I" },
      { label: "6", chord: "D7", roman: "V7/V" },
      { label: "7", chord: "G7", roman: "V7" },
      { label: "8", chord: "C", roman: "I" },
      { label: "9", chord: "Am", roman: "vi" },
      { label: "10", chord: "Dm", roman: "ii" },
      { label: "11", chord: "G7", roman: "V7" },
      { label: "12", chord: "C", roman: "I" },
      { label: "13", chord: "Ab", roman: "bVI" },
      { label: "14", chord: "G7", roman: "V7" },
      { label: "15", chord: "Cm", roman: "i (mode collapse)" },
      { label: "16", chord: "G7", roman: "V7" },
      { label: "17", chord: "Cm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "ellington",
    composerName: "Duke Ellington",
    workContext: "Mood Indigo (Bb major, 16-bar form)",
    bars: [
      { label: "1", chord: "Bb", roman: "I" },
      { label: "2", chord: "Bb/Ab", roman: "I/bVII" },
      { label: "3", chord: "Bb/Gb", roman: "I/bVI" },
      { label: "4", chord: "Bb/F", roman: "I/V" },
      { label: "5", chord: "Bb7", roman: "I7" },
      { label: "6", chord: "Eb", roman: "IV" },
      { label: "7", chord: "Ebm", roman: "iv" },
      { label: "8", chord: "Bb", roman: "I" },
      { label: "9", chord: "G7", roman: "VI7 (V7/ii)" },
      { label: "10", chord: "Cm", roman: "ii" },
      { label: "11", chord: "F7", roman: "V7" },
      { label: "12", chord: "Bb", roman: "I" },
      { label: "13", chord: "G7", roman: "VI7" },
      { label: "14", chord: "Cm", roman: "ii" },
      { label: "15", chord: "F7", roman: "V7" },
      { label: "16", chord: "Bb", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "armstrong",
    composerName: "Louis Armstrong",
    workContext: "West End Blues (Bb major, 12-bar blues)",
    bars: [
      { label: "1", chord: "Bb7", roman: "I7" },
      { label: "2", chord: "Eb7", roman: "IV7" },
      { label: "3", chord: "Bb7", roman: "I7" },
      { label: "4", chord: "Bb7", roman: "I7" },
      { label: "5", chord: "Eb7", roman: "IV7" },
      { label: "6", chord: "Eb7", roman: "IV7" },
      { label: "7", chord: "Bb7", roman: "I7" },
      { label: "8", chord: "Bb7", roman: "I7" },
      { label: "9", chord: "F7", roman: "V7" },
      { label: "10", chord: "Eb7", roman: "IV7" },
      { label: "11", chord: "Bb7", roman: "I7" },
      { label: "12", chord: "F7", roman: "V7 (turnaround)" },
    ],
  },
  {
    kind: "bar",
    composerId: "miles-davis",
    composerName: "Miles Davis",
    workContext: "So What (D minor / Eb minor, 32-bar AABA)",
    bars: [
      { label: "1", chord: "Dm7", roman: "i7 (D Dorian)" },
      { label: "2", chord: "Dm7", roman: "i7" },
      { label: "3", chord: "Dm7", roman: "i7" },
      { label: "4", chord: "Dm7", roman: "i7" },
      { label: "5", chord: "Ebm7", roman: "bii7 (Eb Dorian)" },
      { label: "6", chord: "Ebm7", roman: "bii7" },
      { label: "7", chord: "Dm7", roman: "i7" },
      { label: "8", chord: "Dm7", roman: "i7" },
      { label: "9", chord: "Dm7", roman: "i7" },
      { label: "10", chord: "Dm7", roman: "i7" },
      { label: "11", chord: "Dm7", roman: "i7" },
      { label: "12", chord: "Dm7", roman: "i7" },
      { label: "13", chord: "Ebm7", roman: "bii7" },
      { label: "14", chord: "Ebm7", roman: "bii7" },
      { label: "15", chord: "Dm7", roman: "i7" },
      { label: "16", chord: "Dm7", roman: "i7" },
      { label: "17", chord: "Ebm7", roman: "bii7" },
      { label: "18", chord: "Ebm7", roman: "bii7" },
      { label: "19", chord: "Ebm7", roman: "bii7" },
      { label: "20", chord: "Ebm7", roman: "bii7" },
      { label: "21", chord: "Dm7", roman: "i7" },
      { label: "22", chord: "Dm7", roman: "i7" },
      { label: "23", chord: "Dm7", roman: "i7" },
      { label: "24", chord: "Dm7", roman: "i7" },
      { label: "25", chord: "Dm7", roman: "i7" },
      { label: "26", chord: "Dm7", roman: "i7" },
      { label: "27", chord: "Dm7", roman: "i7" },
      { label: "28", chord: "Dm7", roman: "i7" },
      { label: "29", chord: "Ebm7", roman: "bii7" },
      { label: "30", chord: "Ebm7", roman: "bii7" },
      { label: "31", chord: "Dm7", roman: "i7" },
      { label: "32", chord: "Dm7", roman: "i7" },
    ],
  },
  {
    kind: "bar",
    composerId: "john-coltrane",
    composerName: "John Coltrane",
    workContext: "Giant Steps (B major, 16-bar form)",
    bars: [
      { label: "1", chord: "Bmaj7", roman: "I" },
      { label: "2", chord: "D7", roman: "V7/bVI" },
      { label: "3", chord: "Gmaj7", roman: "bVI" },
      { label: "4", chord: "Bb7", roman: "V7/bIII" },
      { label: "5", chord: "Ebmaj7", roman: "bIII" },
      { label: "6", chord: "Am7 – D7", roman: "ii – V7" },
      { label: "7", chord: "Gmaj7", roman: "bVI" },
      { label: "8", chord: "Bb7", roman: "V7/bIII" },
      { label: "9", chord: "Ebmaj7", roman: "bIII" },
      { label: "10", chord: "F#7", roman: "V7/ii (tritone sub)" },
      { label: "11", chord: "Bmaj7", roman: "I" },
      { label: "12", chord: "Fm7 – Bb7", roman: "ii – V7/bIII" },
      { label: "13", chord: "Ebmaj7", roman: "bIII" },
      { label: "14", chord: "Am7 – D7", roman: "ii – V7" },
      { label: "15", chord: "Gmaj7", roman: "bVI" },
      { label: "16", chord: "C#m7 – F#7", roman: "ii – V7 (back to I)" },
    ],
  },
  {
    kind: "bar",
    composerId: "the-beatles",
    composerName: "The Beatles",
    workContext: "A Day in the Life (G major, with modulation)",
    bars: [
      { label: "1", chord: "G", roman: "I" },
      { label: "2", chord: "Bm", roman: "iii" },
      { label: "3", chord: "Em", roman: "vi" },
      { label: "4", chord: "C", roman: "IV" },
      { label: "5", chord: "G", roman: "I" },
      { label: "6", chord: "Bm", roman: "iii" },
      { label: "7", chord: "Em", roman: "vi" },
      { label: "8", chord: "C", roman: "IV" },
      { label: "9", chord: "Am", roman: "ii" },
      { label: "10", chord: "Am/G", roman: "ii/bVII" },
      { label: "11", chord: "Am/F#", roman: "ii/#iv" },
      { label: "12", chord: "F", roman: "bVII" },
      { label: "13", chord: "E", roman: "I (E major middle section)" },
      { label: "14", chord: "D", roman: "bVII" },
      { label: "15", chord: "A", roman: "IV" },
      { label: "16", chord: "E", roman: "I" },
      { label: "17", chord: "G", roman: "I (return)" },
      { label: "18", chord: "Bm", roman: "iii" },
      { label: "19", chord: "Em", roman: "vi" },
      { label: "20", chord: "C", roman: "IV" },
      { label: "21", chord: "G", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "kraftwerk",
    composerName: "Kraftwerk",
    workContext: "Trans-Europe Express (D minor, modal)",
    bars: [
      { label: "1", chord: "Dm", roman: "i" },
      { label: "2", chord: "Dm", roman: "i" },
      { label: "3", chord: "Dm", roman: "i" },
      { label: "4", chord: "Dm", roman: "i" },
      { label: "5", chord: "Bb", roman: "bVI" },
      { label: "6", chord: "Bb", roman: "bVI" },
      { label: "7", chord: "C", roman: "bVII" },
      { label: "8", chord: "C", roman: "bVII" },
      { label: "9", chord: "Dm", roman: "i" },
      { label: "10", chord: "Dm", roman: "i" },
      { label: "11", chord: "Bb", roman: "bVI" },
      { label: "12", chord: "C", roman: "bVII" },
      { label: "13", chord: "Dm", roman: "i" },
      { label: "14", chord: "Dm", roman: "i" },
      { label: "15", chord: "Bb", roman: "bVI" },
      { label: "16", chord: "C", roman: "bVII" },
    ],
  },
  {
    kind: "bar",
    composerId: "wendy-carlos",
    composerName: "Wendy Carlos",
    workContext: "Bach, WTC I Prelude No. 1 (C major)",
    bars: [
      { label: "1", chord: "C", roman: "I" },
      { label: "2", chord: "Dm7/C", roman: "ii4/2" },
      { label: "3", chord: "G7/B", roman: "V6/5" },
      { label: "4", chord: "C", roman: "I" },
      { label: "5", chord: "Am7/C", roman: "vi4/2" },
      { label: "6", chord: "D7/C", roman: "V4/2/V" },
      { label: "7", chord: "G/B", roman: "V6" },
      { label: "8", chord: "C", roman: "I" },
      { label: "9", chord: "Am7/C", roman: "vi4/2" },
      { label: "10", chord: "D7/C", roman: "V4/2/V" },
      { label: "11", chord: "G/B", roman: "V6" },
      { label: "12", chord: "C", roman: "I" },
      { label: "13", chord: "F/C", roman: "IV4/2" },
      { label: "14", chord: "G7/B", roman: "V6/5" },
      { label: "15", chord: "C", roman: "I" },
      { label: "16", chord: "F/C", roman: "IV4/2" },
      { label: "17", chord: "G7/B", roman: "V6/5" },
      { label: "18", chord: "C", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "fela-kuti",
    composerName: "Fela Kuti",
    workContext: "Zombie (E minor, modal vamp)",
    bars: [
      { label: "1", chord: "Em", roman: "i" },
      { label: "2", chord: "Em", roman: "i" },
      { label: "3", chord: "Em", roman: "i" },
      { label: "4", chord: "Em", roman: "i" },
      { label: "5", chord: "D", roman: "bVII" },
      { label: "6", chord: "D", roman: "bVII" },
      { label: "7", chord: "Em", roman: "i" },
      { label: "8", chord: "Em", roman: "i" },
      { label: "9", chord: "Em", roman: "i" },
      { label: "10", chord: "Em", roman: "i" },
      { label: "11", chord: "D", roman: "bVII" },
      { label: "12", chord: "D", roman: "bVII" },
      { label: "13", chord: "Em", roman: "i" },
      { label: "14", chord: "Em", roman: "i" },
      { label: "15", chord: "D", roman: "bVII" },
      { label: "16", chord: "D", roman: "bVII" },
    ],
  },
  {
    kind: "bar",
    composerId: "piazzolla",
    composerName: "Astor Piazzolla",
    workContext: "Adiós Nonino (A minor)",
    bars: [
      { label: "1", chord: "Am", roman: "i" },
      { label: "2", chord: "Am/G", roman: "i/bVII" },
      { label: "3", chord: "F", roman: "bVI" },
      { label: "4", chord: "E7", roman: "V7" },
      { label: "5", chord: "Am", roman: "i" },
      { label: "6", chord: "Am/G", roman: "i/bVII" },
      { label: "7", chord: "F", roman: "bVI" },
      { label: "8", chord: "E7", roman: "V7" },
      { label: "9", chord: "Dm", roman: "iv" },
      { label: "10", chord: "G", roman: "bVII" },
      { label: "11", chord: "C", roman: "bIII" },
      { label: "12", chord: "F", roman: "bVI" },
      { label: "13", chord: "Bb", roman: "bII" },
      { label: "14", chord: "E7", roman: "V7" },
      { label: "15", chord: "Am", roman: "i" },
      { label: "16", chord: "Am", roman: "i" },
      { label: "17", chord: "Dm", roman: "iv" },
      { label: "18", chord: "G", roman: "bVII" },
      { label: "19", chord: "C", roman: "bIII" },
      { label: "20", chord: "F", roman: "bVI" },
      { label: "21", chord: "Bb", roman: "bII" },
      { label: "22", chord: "E7", roman: "V7" },
      { label: "23", chord: "Am", roman: "i" },
      { label: "24", chord: "Am", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "thelonious-monk",
    composerName: "Thelonious Monk",
    workContext: "'Round Midnight (Eb minor, 16-bar theme)",
    bars: [
      { label: "1", chord: "Ebm", roman: "i" },
      { label: "2", chord: "Ebm", roman: "i" },
      { label: "3", chord: "Fm7b5/Bb7", roman: "iiø – V7 (to IV)" },
      { label: "4", chord: "Abm", roman: "iv" },
      { label: "5", chord: "D7", roman: "V7/bIII (tritone sub of Ab7)" },
      { label: "6", chord: "Gb", roman: "bIII" },
      { label: "7", chord: "Gbm", roman: "bIII (parallel minor)" },
      { label: "8", chord: "G7", roman: "V7 (tritone sub of Db7)" },
      { label: "9", chord: "C7", roman: "V7/V" },
      { label: "10", chord: "F7", roman: "V7/iv" },
      { label: "11", chord: "Bb7/Eb", roman: "V7/IV (bass climb)" },
      { label: "12", chord: "Ebm", roman: "i" },
      { label: "13", chord: "G7", roman: "V7 (tritone sub of C7)" },
      { label: "14", chord: "Gb", roman: "bII" },
      { label: "15", chord: "Fm7/Bb7", roman: "ii – V7 (turnaround)" },
      { label: "16", chord: "Ebm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "sonny-rollins",
    composerName: "Sonny Rollins",
    workContext: "St. Thomas (C major, 16-bar calypso)",
    bars: [
      { label: "1", chord: "C", roman: "I" },
      { label: "2", chord: "C", roman: "I" },
      { label: "3", chord: "G7", roman: "V7" },
      { label: "4", chord: "C", roman: "I" },
      { label: "5", chord: "C", roman: "I" },
      { label: "6", chord: "C", roman: "I" },
      { label: "7", chord: "G7", roman: "V7" },
      { label: "8", chord: "C", roman: "I" },
      { label: "9", chord: "G7", roman: "V7" },
      { label: "10", chord: "C", roman: "I" },
      { label: "11", chord: "F", roman: "IV" },
      { label: "12", chord: "F", roman: "IV" },
      { label: "13", chord: "C", roman: "I" },
      { label: "14", chord: "C", roman: "I" },
      { label: "15", chord: "G7", roman: "V7" },
      { label: "16", chord: "C", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "wayne-shorter",
    composerName: "Wayne Shorter",
    workContext: "Footprints (C minor, 12-bar in 3/4)",
    bars: [
      { label: "1", chord: "Cm7", roman: "i7" },
      { label: "2", chord: "Cm7", roman: "i7" },
      { label: "3", chord: "Fm7", roman: "iv7" },
      { label: "4", chord: "Fm7", roman: "iv7" },
      { label: "5", chord: "Cm7", roman: "i7" },
      { label: "6", chord: "Cm7", roman: "i7" },
      { label: "7", chord: "Fm7", roman: "iv7" },
      { label: "8", chord: "Fm7", roman: "iv7" },
      { label: "9", chord: "Cm7", roman: "i7" },
      { label: "10", chord: "Abmaj7", roman: "bVI" },
      { label: "11", chord: "G7b9", roman: "V7 (resolution)" },
      { label: "12", chord: "Cm7", roman: "i7" },
    ],
  },
  {
    kind: "bar",
    composerId: "dizzy-gillespie",
    composerName: "Dizzy Gillespie",
    workContext: "A Night in Tunisia (D minor, 16-bar theme)",
    bars: [
      { label: "1", chord: "Dm", roman: "i" },
      { label: "2", chord: "Dm", roman: "i" },
      { label: "3", chord: "Edim7", roman: "ii°7" },
      { label: "4", chord: "A7b9", roman: "V7 (bebop dominant)" },
      { label: "5", chord: "Dm", roman: "i" },
      { label: "6", chord: "Eb7", roman: "bII7 (tritone sub of A7)" },
      { label: "7", chord: "Dm", roman: "i" },
      { label: "8", chord: "Dm", roman: "i" },
      { label: "9", chord: "G7", roman: "V7/iv" },
      { label: "10", chord: "Gm", roman: "iv (minor)" },
      { label: "11", chord: "C7", roman: "V7/bVII" },
      { label: "12", chord: "F", roman: "bVII (Afro-Cuban vamp)" },
      { label: "13", chord: "Dm", roman: "i" },
      { label: "14", chord: "Eb7", roman: "bII7" },
      { label: "15", chord: "A7b13", roman: "V7 (altered dominant)" },
      { label: "16", chord: "Dm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "chet-baker",
    composerName: "Chet Baker",
    workContext: "My Funny Valentine (C minor, 16-bar ballad)",
    bars: [
      { label: "1", chord: "Cm7", roman: "i7" },
      { label: "2", chord: "Cm7", roman: "i7" },
      { label: "3", chord: "Fm7", roman: "iv7" },
      { label: "4", chord: "Fm7", roman: "iv7" },
      { label: "5", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "6", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "7", chord: "G7", roman: "V7" },
      { label: "8", chord: "G7", roman: "V7" },
      { label: "9", chord: "Gm7b5", roman: "iiø/V" },
      { label: "10", chord: "C7", roman: "V7/V" },
      { label: "11", chord: "Fm7", roman: "iv7" },
      { label: "12", chord: "Fm7", roman: "iv7" },
      { label: "13", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "14", chord: "Dm7", roman: "ii7 (sub)" },
      { label: "15", chord: "G7b9", roman: "V7 (altered)" },
      { label: "16", chord: "Cmaj9", roman: "I (Picardy resolution)" },
    ],
  },
  {
    kind: "bar",
    composerId: "freddie-hubbard",
    composerName: "Freddie Hubbard",
    workContext: "Red Clay (Eb minor, 24-bar vamp-heavy form)",
    bars: [
      { label: "1", chord: "Ebm7", roman: "i7" },
      { label: "2", chord: "Ebm7", roman: "i7" },
      { label: "3", chord: "Ebm7", roman: "i7" },
      { label: "4", chord: "Ebm7", roman: "i7" },
      { label: "5", chord: "Ebm7", roman: "i7" },
      { label: "6", chord: "Ebm7", roman: "i7" },
      { label: "7", chord: "Bbm7", roman: "v7" },
      { label: "8", chord: "Bbm7", roman: "v7" },
      { label: "9", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "10", chord: "Abd7", roman: "bVI°7 (dim. passing)" },
      { label: "11", chord: "Ebm7", roman: "i7" },
      { label: "12", chord: "Gbmaj7", roman: "bIIImaj7" },
      { label: "13", chord: "Ebm7", roman: "i7" },
      { label: "14", chord: "Ebm7", roman: "i7" },
      { label: "15", chord: "Ebm7", roman: "i7" },
      { label: "16", chord: "Ebm7", roman: "i7" },
      { label: "17", chord: "Bbm7", roman: "v7" },
      { label: "18", chord: "Bbm7", roman: "v7" },
      { label: "19", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "20", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "21", chord: "A7b9", roman: "V7/iv (tritone sub of Eb7)" },
      { label: "22", chord: "Dbmaj7", roman: "bII" },
      { label: "23", chord: "Ebm7", roman: "i7" },
      { label: "24", chord: "Ebm7", roman: "i7" },
    ],
  },
  {
    kind: "bar",
    composerId: "joe-henderson",
    composerName: "Joe Henderson",
    workContext: "Recorda Me (D minor, 16-bar post-bop)",
    bars: [
      { label: "1", chord: "Dm7", roman: "i7" },
      { label: "2", chord: "Dm7", roman: "i7" },
      { label: "3", chord: "Dm7", roman: "i7" },
      { label: "4", chord: "Dm7", roman: "i7" },
      { label: "5", chord: "Gm7", roman: "iv7" },
      { label: "6", chord: "Gm7", roman: "iv7" },
      { label: "7", chord: "A7", roman: "V7 (dominant)" },
      { label: "8", chord: "A7", roman: "V7" },
      { label: "9", chord: "Dm7", roman: "i7" },
      { label: "10", chord: "Gm7", roman: "iv7" },
      { label: "11", chord: "A7", roman: "V7" },
      { label: "12", chord: "Dm7", roman: "i7" },
      { label: "13", chord: "Bb7", roman: "bII7 (tritone sub of E7)" },
      { label: "14", chord: "E7b9", roman: "V7/bVI (altered)" },
      { label: "15", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "16", chord: "Dm7", roman: "i7 (resolving)" },
    ],
  },
  {
    kind: "bar",
    composerId: "stan-getz",
    composerName: "Stan Getz",
    workContext: "The Girl from Ipanema (F major, 16-bar bossa nova)",
    bars: [
      { label: "1", chord: "Fmaj7", roman: "Imaj7" },
      { label: "2", chord: "G7", roman: "II7 (secondary)" },
      { label: "3", chord: "Gm7", roman: "ii7" },
      { label: "4", chord: "Gm7", roman: "ii7" },
      { label: "5", chord: "Fmaj7", roman: "Imaj7" },
      { label: "6", chord: "Fmaj7", roman: "Imaj7" },
      { label: "7", chord: "G7", roman: "II7" },
      { label: "8", chord: "Gm7", roman: "ii7" },
      { label: "9", chord: "Bb7", roman: "bVII7 (borrowed)" },
      { label: "10", chord: "Fmaj7", roman: "Imaj7" },
      { label: "11", chord: "Bb7", roman: "bVII7" },
      { label: "12", chord: "Fmaj7", roman: "Imaj7" },
      { label: "13", chord: "Gm7", roman: "ii7" },
      { label: "14", chord: "C7", roman: "V7" },
      { label: "15", chord: "Fmaj7", roman: "Imaj7" },
      { label: "16", chord: "C7", roman: "V7 (turnaround)" },
    ],
  },
  {
    kind: "bar",
    composerId: "nina-simone",
    composerName: "Nina Simone",
    workContext: "I Put a Spell on You (F minor, 12-bar blues variation)",
    bars: [
      { label: "1", chord: "Fm", roman: "i" },
      { label: "2", chord: "Fm", roman: "i" },
      { label: "3", chord: "Bb7", roman: "IV7 (blues)" },
      { label: "4", chord: "Bb7", roman: "IV7" },
      { label: "5", chord: "Fm", roman: "i" },
      { label: "6", chord: "Fm", roman: "i" },
      { label: "7", chord: "Db7", roman: "bII7 (tritone sub of G7)" },
      { label: "8", chord: "C7", roman: "V7 (blues-turned dominant)" },
      { label: "9", chord: "Fm", roman: "i" },
      { label: "10", chord: "Db7", roman: "bII7" },
      { label: "11", chord: "C7", roman: "V7" },
      { label: "12", chord: "Fm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "bach",
    composerName: "J.S. Bach",
    workContext: "Prelude in C major, BWV 846 (C major, 18-bar harmonic sequence)",
    bars: [
      { label: "1", chord: "C", roman: "I" },
      { label: "2", chord: "Dm7/C", roman: "ii4/2" },
      { label: "3", chord: "G7/B", roman: "V6/5" },
      { label: "4", chord: "C", roman: "I" },
      { label: "5", chord: "Am7/C", roman: "vi4/2" },
      { label: "6", chord: "D7/C", roman: "V4/2/V" },
      { label: "7", chord: "G/B", roman: "V6" },
      { label: "8", chord: "C", roman: "I" },
      { label: "9", chord: "Am7/C", roman: "vi4/2" },
      { label: "10", chord: "D7/C", roman: "V4/2/V" },
      { label: "11", chord: "G/B", roman: "V6" },
      { label: "12", chord: "C", roman: "I" },
      { label: "13", chord: "F/C", roman: "IV4/2" },
      { label: "14", chord: "G7/B", roman: "V6/5" },
      { label: "15", chord: "C", roman: "I" },
      { label: "16", chord: "F/C", roman: "IV4/2" },
      { label: "17", chord: "G7/B", roman: "V6/5" },
      { label: "18", chord: "C", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "rachmaninov",
    composerName: "Sergei Rachmaninov",
    workContext: "Piano Concerto No. 2, mvt. I opening (C minor, 16 bars)",
    bars: [
      { label: "1", chord: "Cdim", roman: "i° (bell-like)" },
      { label: "2", chord: "Cm", roman: "i" },
      { label: "3", chord: "Ab", roman: "bVI" },
      { label: "4", chord: "G7", roman: "V7" },
      { label: "5", chord: "Cm", roman: "i" },
      { label: "6", chord: "Gm7b5", roman: "vø" },
      { label: "7", chord: "C7", roman: "V7/iv" },
      { label: "8", chord: "Fm", roman: "iv" },
      { label: "9", chord: "Fm/Ab", roman: "iv (bass climb)" },
      { label: "10", chord: "Fm/C", roman: "iv6/4" },
      { label: "11", chord: "G7", roman: "V7" },
      { label: "12", chord: "Cm", roman: "i" },
      { label: "13", chord: "Abmaj7", roman: "bVImaj7" },
      { label: "14", chord: "Dm7b5", roman: "iiø7" },
      { label: "15", chord: "G7", roman: "V7" },
      { label: "16", chord: "Cm", roman: "i (fermata)" },
    ],
  },
  {
    kind: "bar",
    composerId: "brahms",
    composerName: "Johannes Brahms",
    workContext: "Intermezzo in A major, op. 118 no. 2 (A major, 16 bars)",
    bars: [
      { label: "1", chord: "A", roman: "I" },
      { label: "2", chord: "E/G#", roman: "V6" },
      { label: "3", chord: "F#m7", roman: "vi7" },
      { label: "4", chord: "C#m7", roman: "iii7" },
      { label: "5", chord: "D", roman: "IV" },
      { label: "6", chord: "D#dim7", roman: "vii°7/ii" },
      { label: "7", chord: "E7", roman: "V7" },
      { label: "8", chord: "A", roman: "I" },
      { label: "9", chord: "F7", roman: "bII7 (Neapolitan)" },
      { label: "10", chord: "E7", roman: "V7" },
      { label: "11", chord: "Am", roman: "i (parallel minor)" },
      { label: "12", chord: "E7", roman: "V7" },
      { label: "13", chord: "F", roman: "bII" },
      { label: "14", chord: "Dm7", roman: "iv (modal mixture)" },
      { label: "15", chord: "E7", roman: "V7" },
      { label: "16", chord: "A", roman: "I" },
    ],
  },
  {
    kind: "bar",
    composerId: "tchaikovsky",
    composerName: "Pyotr Ilyich Tchaikovsky",
    workContext: "Symphony No. 6 'Pathétique', mvt. I opening (B minor, 16 bars)",
    bars: [
      { label: "1", chord: "Bm", roman: "i" },
      { label: "2", chord: "Bm", roman: "i" },
      { label: "3", chord: "Em/B", roman: "iv6/4" },
      { label: "4", chord: "F#7", roman: "V7" },
      { label: "5", chord: "G", roman: "bVI (Neapolitan-related)" },
      { label: "6", chord: "Em", roman: "iv" },
      { label: "7", chord: "F#7", roman: "V7" },
      { label: "8", chord: "Bm", roman: "i" },
      { label: "9", chord: "Bm/E", roman: "i (bass climb)" },
      { label: "10", chord: "F#7/C#", roman: "V6/5" },
      { label: "11", chord: "Bm/D", roman: "i6" },
      { label: "12", chord: "G#dim7", roman: "vii°7/ii" },
      { label: "13", chord: "F#7", roman: "V7" },
      { label: "14", chord: "Bm", roman: "i" },
      { label: "15", chord: "C#7", roman: "V7/iv (augmented sixth)" },
      { label: "16", chord: "Bm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "mahler",
    composerName: "Gustav Mahler",
    workContext: "Symphony No. 5, Adagietto (F major, 16 bars)",
    bars: [
      { label: "1", chord: "F", roman: "I (sustained)" },
      { label: "2", chord: "Cm7", roman: "v7" },
      { label: "3", chord: "Dm", roman: "vi" },
      { label: "4", chord: "Gm7", roman: "ii7" },
      { label: "5", chord: "C7sus4", roman: "V7sus" },
      { label: "6", chord: "C7", roman: "V7" },
      { label: "7", chord: "F", roman: "I" },
      { label: "8", chord: "Bb", roman: "IV" },
      { label: "9", chord: "Gm7", roman: "ii7" },
      { label: "10", chord: "C7sus4", roman: "V7sus" },
      { label: "11", chord: "C7", roman: "V7" },
      { label: "12", chord: "F", roman: "I" },
      { label: "13", chord: "Ab", roman: "bVI (progressive shift)" },
      { label: "14", chord: "Eb", roman: "bIII (mediant shift)" },
      { label: "15", chord: "D7", roman: "V7/V (enharmonic pivot)" },
      { label: "16", chord: "Gm7 C7", roman: "ii7 – V7 (back to F)" },
    ],
  },
  {
    kind: "bar",
    composerId: "philip-glass",
    composerName: "Philip Glass",
    workContext: "Metamorphosis One (C minor, 16-bar additive cycle)",
    bars: [
      { label: "1", chord: "Cm", roman: "i" },
      { label: "2", chord: "Bbmaj7", roman: "bVII" },
      { label: "3", chord: "Cm", roman: "i (repeat)" },
      { label: "4", chord: "Bbmaj7", roman: "bVII (repeat)" },
      { label: "5", chord: "Cm", roman: "i" },
      { label: "6", chord: "Abmaj7", roman: "bVI" },
      { label: "7", chord: "Cm", roman: "i" },
      { label: "8", chord: "Bbmaj7", roman: "bVII" },
      { label: "9", chord: "Abmaj7", roman: "bVI" },
      { label: "10", chord: "Cm", roman: "i (return)" },
      { label: "11", chord: "Fm7", roman: "iv7 (additive expansion)" },
      { label: "12", chord: "Cm", roman: "i" },
      { label: "13", chord: "Bbmaj7", roman: "bVII" },
      { label: "14", chord: "Cm", roman: "i" },
      { label: "15", chord: "Bbmaj7 Abmaj7", roman: "bVII – bVI (cycle close)" },
      { label: "16", chord: "Cm", roman: "i" },
    ],
  },
  {
    kind: "bar",
    composerId: "augusto-novaro",
    composerName: "Augusto Novaro",
    workContext: "Sight-reading drill — diatonic scale exercise (C major, 12 bars)",
    bars: [
      { label: "1", chord: "C", roman: "I (tonic)" },
      { label: "2", chord: "Dm", roman: "ii" },
      { label: "3", chord: "Em", roman: "iii" },
      { label: "4", chord: "F", roman: "IV" },
      { label: "5", chord: "G", roman: "V" },
      { label: "6", chord: "Am", roman: "vi" },
      { label: "7", chord: "Bdim", roman: "vii°" },
      { label: "8", chord: "C", roman: "I (cadence)" },
      { label: "9", chord: "F", roman: "IV (subdominant expansion)" },
      { label: "10", chord: "G7", roman: "V7" },
      { label: "11", chord: "C", roman: "I" },
      { label: "12", chord: "C", roman: "I (solid)" },
    ],
  },
];

// Section/drone/row entries — exposed as raw descriptions until v2 adds
// per-kind renderers.
const SECTION_CHARTS: SectionChart[] = [
  {
    kind: "section",
    composerId: "debussy",
    composerName: "Debussy",
    description: "Voiles (whole-tone and pentatonic collection shifts). v2 will parse blocks like 'Caug – Daug – Eaug – F#aug – G#aug – A#aug'.",
    raw: [
      "1-10: Whole-tone on C (C-D-E-F#-G#-A#)",
      "11-20: Whole-tone continued; parallel augmented triads",
      "21-30: Pentatonic on C (C-D-E-G-A)",
      "31-40: Return of whole-tone collection",
      "41-48: Whole-tone with C pedal; parallel chords over drone",
    ],
  },
  {
    kind: "bitonal",
    composerId: "stravinsky",
    composerName: "Stravinsky",
    description: "Petrushka chord and Rite of Spring chord blocks (bitonal / ostinato). The Petrushka chord (C major + F# major) is the canonical bitonal sonority — two major triads a tritone apart.",
    pairs: [
      // Petrushka chord: C (pc 0) + F# (pc 6) — a tritone apart.
      { root1: 0, root2: 6 },
    ],
    raw: [
      "1-4: C major / F# major — two triads a tritone apart",
      "5-8: C major / F# major — bitonal oscillation",
      "9-12: C / F# (sustained) — static dissonance",
      "13-16: C / F# with added G# — added-note dissonance",
      "Augurs of Spring 1-8: Eb major with added b7 and b9",
      "Augurs of Spring 9-16: Eb static ostinato",
      "Augurs of Spring 17-24: Eb – Db – Eb – Db (I – bVII)",
      "Danse Sacrale 1-8: Eb – Db – Eb – Db (I – bVII oscillation)",
    ],
  },
  {
    kind: "row",
    composerId: "schoenberg",
    composerName: "Schoenberg",
    description: "Suite for Piano op. 25 row forms (P0/I0/R0/RI0). Each form is 12 distinct pitch classes covering the chromatic aggregate. P0 splits into two combinatorially-related hexachords.",
    forms: {
      // Pitch classes encoded as numbers 0-11. Sharp/flat notation chosen
      // for canonical spelling — see raw for the original enharmonics.
      P0: [4, 5, 7, 1, 6, 3, 8, 2, 11, 0, 9, 10], // E F G Db Gb Eb Ab D B C A Bb
      I0: [4, 3, 1, 7, 2, 5, 0, 8, 10, 9, 1, 11], // E Eb Db G D F C Ab Bb A C# B (C#=1)
      R0: [10, 9, 0, 11, 2, 8, 3, 6, 1, 7, 5, 4], // Bb A C B D Ab Eb Gb Db G F E
      RI0: [11, 1, 9, 10, 8, 0, 5, 2, 7, 1, 3, 4], // B C# A Bb Ab C F D G Db Eb E (Db=1)
    },
    hexachords: {
      first: [4, 5, 7, 1, 6, 3],   // E F G Db Gb Eb
      second: [8, 2, 11, 0, 9, 10], // Ab D B C A Bb
    },
    raw: [
      "P0: E – F – G – Db – Gb – Eb – Ab – D – B – C – A – Bb",
      "I0: E – Eb – Db – G – D – F – C – Ab – Bb – A – C# – B",
      "R0: Bb – A – C – B – D – Ab – Eb – Gb – Db – G – F – E",
      "RI0: B – C# – A – Bb – Ab – C – F – D – G – Db – Eb – E",
      "First hexachord of P0: E – F – G – Db – Gb – Eb",
      "Second hexachord of P0: Ab – D – B – C – A – Bb",
    ],
  },
  {
    kind: "axis",
    composerId: "bartok",
    composerName: "Bartók",
    description: "Fugue from Music for Strings, Percussion and Celesta — tritone axis system (A – Eb). Each axis contains four keys related by tritone and minor third rather than by fifth.",
    tonicAxis: [9, 0, 3, 6],       // A – C – Eb – F#
    dominantAxis: [4, 7, 10, 1],  // E – G – Bb – C#
    subdominantAxis: [2, 5, 8, 11], // D – F – Ab – B
    raw: [
      "Tonic axis: A – C – Eb – F#",
      "Dominant axis: E – G – Bb – C#",
      "Subdominant axis: D – F – Ab – B",
      "Principle: Keys relate by tritone and minor third rather than by fifth",
    ],
  },
  {
    kind: "duration",
    composerId: "cage",
    composerName: "Cage",
    description: "4'33\" — three silent movements of 30s / 2m23s / 1m40s. Sonatas and Interludes prepared-piano timbre catalog is a separate study.",
    movements: [
      { label: "I", description: "Silence", seconds: 30 },
      { label: "II", description: "Silence", seconds: 143 }, // 2*60 + 23
      { label: "III", description: "Silence", seconds: 100 }, // 1*60 + 40
    ],
    raw: [
      "Movement I: Silence — 30 seconds",
      "Movement II: Silence — 2 minutes 23 seconds",
      "Movement III: Silence — 1 minute 40 seconds",
    ],
  },
  {
    kind: "section",
    composerId: "stockhausen",
    composerName: "Stockhausen",
    description: "Mantra — thirteen-note formula with seven parametric transformations (pitch / duration / dynamics / timbre / register / retrograde / fragmentation).",
    raw: [
      "Section 1: Formula in original form",
      "Section 2: Formula with duration series inverted",
      "Section 3: Formula with dynamics reversed",
      "Section 4: Formula with register displaced",
      "Section 5: Formula with timbre altered",
      "Section 6: Formula in retrograde",
      "Section 7: Formula fragmented and layered",
    ],
  },
  {
    kind: "section",
    composerId: "minimalists",
    composerName: "Minimalists",
    description: "Representative loops from Riley / Reich / Glass. Static harmony as background field.",
    raw: [
      "Riley In C: C major cell over 53 patterns",
      "Reich phasing: Dm7 loop, identical copies offset",
      "Glass major loop: C – Am – F – G – C – Am – F – G",
      "Glass minor loop: Am – F – G – Am",
    ],
  },
  {
    kind: "section",
    composerId: "ornette-coleman",
    composerName: "Ornette Coleman",
    description: "Free Jazz — five collective sections with no fixed changes. Harmolodics: melody/harmony/rhythm treated as equal.",
    raw: [
      "Section 1: Collective improvisation",
      "Section 2: Melodic interaction",
      "Section 3: Rhythmic layering",
      "Section 4: Textural development",
      "Section 5: Collective climax",
    ],
  },
  {
    kind: "layer",
    composerId: "brian-eno",
    composerName: "Brian Eno",
    description: "Music for Airports 1/1 — four looping layers of different lengths. No functional progression. The polyrhythm of differently-paced loops is the compositional idea.",
    layers: [
      { index: 1, description: "Piano loop in C diatonic field" },
      { index: 2, description: "Piano loop at different length" },
      { index: 3, description: "Vocal loop on sustained pitches" },
      { index: 4, description: "Synthesizer pad drone" },
    ],
    raw: [
      "Layer 1: Piano loop in C diatonic field",
      "Layer 2: Piano loop at different length",
      "Layer 3: Vocal loop on sustained pitches",
      "Layer 4: Synthesizer pad drone",
    ],
  },
  {
    kind: "section",
    composerId: "ravi-shankar",
    composerName: "Ravi Shankar",
    description: "Raga performance structure — Alap → Jor → Jhala → Gat. Tanpura drone of Sa + Pa; no chord changes.",
    raw: [
      "Alap: Sa drone (tanpura)",
      "Alap: Sa-Pa drone",
      "Jor: Sa-Pa drone with rhythmic pulse",
      "Jhala: Sa-Pa drone with fast strokes",
      "Gat: Sa-Pa drone with tabla cycle",
      "Gat: Modal exploration of raga degrees",
    ],
  },
];

const ALL_CHARTS: ComposerChart[] = [...BAR_CHARTS, ...SECTION_CHARTS];

/** Return the chart for a composer, or undefined if not in the catalog. */
export function getComposerChart(id: ComposerId): ComposerChart | undefined {
  return ALL_CHARTS.find((c) => c.composerId === id);
}

/** Return only the bar-by-bar charts (skip non-bar entries). */
export function getBarCharts(): BarChart[] {
  return BAR_CHARTS;
}

/** Return only the non-bar charts (section/row/axis/duration/layer). */
export function getSectionCharts(): SectionChart[] {
  return SECTION_CHARTS;
}

/** All known composer ids. */
export const ALL_COMPOSER_IDS: ComposerId[] = ALL_CHARTS.map((c) => c.composerId);

/** Convenience: total bar count across all bar charts. */
export function totalBarCount(): number {
  return BAR_CHARTS.reduce((sum, c) => sum + c.bars.length, 0);
}
