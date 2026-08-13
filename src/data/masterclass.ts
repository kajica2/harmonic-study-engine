/**
 * Masterclass catalog — 33 working tunes + concept files from
 * the WCJA (Woody / Charlie / Jazz masterclass) curriculum,
 * MC 1–40 + PJ 1–4. Each entry has:
 *
 *   - id              matches the existing HarmonicPath id where
 *                     one exists; otherwise a new id we'll add to
 *                     paths.ts in a follow-up.
 *   - title           display name (the song, or "Solar diatonic solo" etc.)
 *   - classes         list of masterclass class refs (e.g. ["MC 1", "MC 2"])
 *   - mainExercise    one-sentence "what to do with this tune"
 *                     drawn from the class's main exercise
 *   - description     short human-readable summary
 *
 * The data here is reference + content. The picker UI lives in
 * `src/components/MasterclassPicker.tsx`. Picking a tune from the
 * catalog just sets the activePathIndex on the parent — we don't
 * need to invent new audio infrastructure.
 */

export interface MasterclassEntry {
  id: string;
  title: string;
  /** Class references, e.g. ["MC 1", "MC 2"] for *Star Eyes*. */
  classes: string[];
  /** One-sentence prompt from the class's main in-class exercise. */
  mainExercise: string;
  /** Short human-readable summary (composer / era / form). */
  description: string;
  /** If true, the tune is in the live path set. If false, the
   *  picker shows it as "Coming soon" — we'd add the path in a
   *  follow-up commit. */
  inApp: boolean;
}

export const MASTERCLASS_TUNES: MasterclassEntry[] = [
  // ----- PJ 1-4 (introductory mini-series) -----
  { id: "star-eyes", title: "Star Eyes", classes: ["MC 1", "MC 2", "PJ 1", "PJ 3"],
    mainExercise: "Up the chord, 3rd & 7th twice — and up the chord, down the scale. Sing the melody before playing.",
    description: "Foundational diatonic exercise; uses higher intervals of the chord as a melodic line.",
    inApp: true },
  { id: "is-you-is-or-is-you-aint", title: "Is You Is or Is You Ain't My Baby", classes: ["MC 3", "MC 5"],
    mainExercise: "3-to-9 chromatic Dorian arpeggios through the changes.",
    description: "Sing-along tune; learn the melody first, then 3-to-9 over each chord.",
    inApp: false },
  { id: "yardbird-suite", title: "Yardbird Suite", classes: ["MC 4", "MC 19"],
    mainExercise: "Bird Feathers — vary phrase length; long meter on the bridge.",
    description: "Phrase-length study; Bird's prosody is the teaching tradition.",
    inApp: false },
  { id: "sometimes-im-happy", title: "Sometimes I'm Happy", classes: ["MC 6", "MC 12", "MC 14-P1"],
    mainExercise: "Melody Game — wave in / wave out; sing the diminished and harmonic minor in the changes.",
    description: "Sing-along study tune; used as the canonical sing-along record across the series.",
    inApp: false },

  // ----- Solar studies -----
  { id: "solar", title: "Solar", classes: ["MC 6", "MC 7", "MC 8", "MC 11", "MC 14-P1", "MC 21"],
    mainExercise: "Diatonic Solar solo (and harmonic-minor / melodic-minor variations). Motif = Bach sequences.",
    description: "The flagship harmonic-minor study. Most heavy-rotated tune in the series.",
    inApp: false },

  // ----- Cherokee / What Is This Thing Called Love (the deep-dive block) -----
  { id: "what-is-this-thing-called-love", title: "What Is This Thing Called Love", classes: ["MC 7", "MC 9", "MC 10", "MC 11", "MC 14-P2"],
    mainExercise: "Three stages of singing a tune; scat *Hot House* against it; harmonic-minor on tension, melodic-minor on resolution.",
    description: "Rhythmic concept study; 2-5-1 voice-leading line.",
    inApp: false },
  { id: "cherokee", title: "Cherokee", classes: ["MC 13", "MC 15", "MC 16", "MC 20", "MC 21", "MC 34"],
    mainExercise: "Three diminished chords, one key per day; sing the changes including II–V–I through the bridge keys.",
    description: "Diminished-trail study. House-of-Harmony anchor (two keys a flatted-fifth apart).",
    inApp: false },
  { id: "i-got-rhythm", title: "I Got Rhythm", classes: ["MC 3", "MC 8", "MC 17", "MC 18"],
    mainExercise: "Twin-key syncopation; back door #1 (1 → 1m → 2-5 → 2-5 → 1) and #2 (half-diminished before the IV minor).",
    description: "Back-cycling study; the bridge is 3 minor-3rd related keys.",
    inApp: false },
  { id: "stella-by-starlight", title: "Stella by Starlight", classes: ["MC 18"],
    mainExercise: "F♯m7b5 → F minor 7 (the half-diminished back door before the IV minor).",
    description: "Back-cycling study; sing the function through the changes.",
    inApp: false },

  // ----- There Will Never Be Another You / Out of Nowhere (the paraphrase arc) -----
  { id: "there-will-never-be-another-you", title: "There Will Never Be Another You", classes: ["MC 23", "MC 24", "MC 32"],
    mainExercise: "Straight → syncopated → paraphrased; the 12 levels of paraphrase.",
    description: "The melody-obligation / paraphrase flagship. Best vocal record cited as a model for learning the tune.",
    inApp: false },
  { id: "out-of-nowhere", title: "Out of Nowhere", classes: ["MC 25", "MC 26", "MC 27", "MC 28"],
    mainExercise: "Sing with the great *Out of Nowhere* / Three-Stooges harmony game; 5-♯9 line cliché.",
    description: "Paraphrase + diminished-trail study; the 3-to-9 road map through the form.",
    inApp: false },
  { id: "nostalgia-in-october", title: "Nostalgia in October", classes: ["MC 29", "MC 30", "MC 31"],
    mainExercise: "Improvise on each event / 'the minimum'; 5-to-1 scale exercise / important minor.",
    description: "Small-combo study; voice-leading line through the blues.",
    inApp: false },
  { id: "ill-remember-april", title: "I'll Remember April", classes: ["MC 35", "MC 38", "MC 39"],
    mainExercise: "Learn the bridge by interval (3 minor-3rd keys); sing it in every key.",
    description: "Voice-leading line through *April*; diminished arpeggio at the V.",
    inApp: false },
  { id: "groovin-high", title: "Groovin' High", classes: ["MC 36"],
    mainExercise: "2-bar 2-5-1 diatonic phrase in every key (chromatic, then minor thirds, then other intervals).",
    description: "Phrase-by-phrase listening study.",
    inApp: false },
  { id: "hot-house", title: "Hot House", classes: ["MC 10", "MC 11", "MC 12"],
    mainExercise: "Scat *Hot House* against *What Is This Thing Called Love*; double-time pocket phrasing.",
    description: "Scat study; the canonical double-time / bebop pocket target.",
    inApp: false },
  { id: "confirmation", title: "Confirmation", classes: ["MC 34"],
    mainExercise: "Analyze the great *Confirmation* solo; every chord tone / non-chord tone.",
    description: "Play-by-ear / play-by-mind study; merge intuition and logic.",
    inApp: false },
  { id: "lester-leaps-in", title: "Lester Leaps In", classes: ["MC 21", "MC 25"],
    mainExercise: "Sing the melody with the recording, then listen for the 'two choruses' (head, then solo).",
    description: "Phrase-by-phrase listening study; identify 'proposal' and 'comment' in each phrase.",
    inApp: false },
  { id: "lady-be-good", title: "Lady Be Good", classes: ["MC 12", "MC 14-P1"],
    mainExercise: "3-5-3-1 triad exercise (alternating minor thirds).",
    description: "Harmonic-options-for-2-5-1 study.",
    inApp: false },

  // ----- MC 1 survey set -----
  { id: "shoe-shine-boy", title: "Shoe Shine Boy", classes: ["MC 1"],
    mainExercise: "Long-form 'current project' recording; work the whole tune end to end.",
    description: "MC 1 survey set; the first long-form solo study.",
    inApp: false },
  { id: "in-the-middle-of-a-kiss", title: "In the Middle of a Kiss", classes: ["MC 1"],
    mainExercise: "Sing the scale in numbers; up the chord, down the scale.",
    description: "MC 1 survey set.",
    inApp: false },
  { id: "mr-5-by-5", title: "Mr. 5 by 5", classes: ["MC 1"],
    mainExercise: "Sing the melody; use the higher intervals of the chord as a melodic line.",
    description: "MC 1 survey set; trumpet feature.",
    inApp: false },
  { id: "just-friends", title: "Just Friends", classes: ["MC 1", "MC 6"],
    mainExercise: "Melody Game — wave in / wave out; sing the changes.",
    description: "MC 1 survey set; ballad-tempo study.",
    inApp: false },
  { id: "sophisticated-lady", title: "Sophisticated Lady", classes: ["MC 1"],
    mainExercise: "Sing the melody; use the harmonic-minor on the ii-V-i.",
    description: "MC 1 survey set; ballad study.",
    inApp: false },
  { id: "teach-me-tonight", title: "Teach Me Tonight", classes: ["MC 1"],
    mainExercise: "Sing the lyrics; then the function; then the numbers.",
    description: "MC 1 survey set.",
    inApp: false },
  { id: "you-dont-know-what-love-is", title: "You Don't Know What Love Is", classes: ["MC 1"],
    mainExercise: "Sing the lyrics; then play with the lyric rhythm.",
    description: "MC 1 survey set; ballad.",
    inApp: false },
  { id: "if-you-were-no-one", title: "If You Were No One", classes: ["MC 7", "MC 10"],
    mainExercise: "Diminished-trail through the form; hear the diminished in time.",
    description: "Diminished-study anchor tune.",
    inApp: false },
  { id: "sweet-rosie-ogrady", title: "Sweet Rosie O'Grady", classes: ["MC 19"],
    mainExercise: "Long-meter prosody; pat your foot on 1 and 3 (1-3, 1-3).",
    description: "Phrase-length study; outside the standard jazz rep.",
    inApp: false },
  { id: "casba", title: "Casba", classes: ["MC 25"],
    mainExercise: "Unusual minor-key permutation (melodic minor in an exotic key).",
    description: "Paraphrase / exotic-key study.",
    inApp: false },
  { id: "puerto-rico", title: "Puerto Rico", classes: ["MC 26"],
    mainExercise: "Sing the function through the changes; ride the half-step key.",
    description: "Paraphrase study; outside the standard jazz rep.",
    inApp: false },
  { id: "apostrophe", title: "Apostrophe", classes: ["MC 30"],
    mainExercise: "Sing the lyrics; use the higher intervals (♭13, ♯5) as a melodic line.",
    description: "Voice-leading / blues; outside the standard jazz rep.",
    inApp: false },
  { id: "i-never-knew", title: "I Never Knew", classes: ["MC 25"],
    mainExercise: "Swung 8th notes / unusual minor-key permutation.",
    description: "Paraphrase / 8th-note phrasing study.",
    inApp: false },
  { id: "strange-dear-but-true-dear", title: "Strange Dear, But True Dear", classes: ["MC 16"],
    mainExercise: "Sing the function; place turnarounds in different parts of the form.",
    description: "Back-cycling study; rare reharmonization context.",
    inApp: false },
  { id: "how-much-do-i-love-you", title: "How Much Do I Love You", classes: ["MC 16"],
    mainExercise: "Sing the function through the changes; place turnarounds deliberately.",
    description: "Back-cycling study; rare reharmonization context.",
    inApp: false },

  // ----- Concept files (not tunes, but recurring masterclass artifacts) -----
  { id: "concept-solar-diatonic-solo", title: "Solar diatonic solo (concept)", classes: ["MC 8"],
    mainExercise: "Write a diatonic solo over *Solar*; then harmonic-minor; then melodic-minor variations.",
    description: "Concept file; the working artifact of the Solar study block.",
    inApp: false },
  { id: "concept-diminished-trail", title: "Diminished trail through changes", classes: ["MC 15"],
    mainExercise: "Find the diminished chords that go through the form; improvise just on those.",
    description: "Concept file; the masterclass's recurring diminished-pass study.",
    inApp: false },
  { id: "concept-house-of-harmony", title: "House of Harmony (graphic)", classes: ["MC 16", "MC 17", "MC 18"],
    mainExercise: "Take two keys a flatted-fifth apart, place them next to each other. Walk the secondary dominants.",
    description: "Concept file; the visual aid for keys a tritone apart.",
    inApp: false },
  { id: "concept-line-cliches", title: "Line cliches through the form", classes: ["MC 27", "MC 28"],
    mainExercise: "5 → ♯9 → 1 → 2 on any dominant 7 with a ♯9.",
    description: "Concept file; the single most useful line cliché in the series.",
    inApp: false },
  { id: "concept-three-to-nine", title: "3-to-9 / 9-to-3 through the form", classes: ["MC 28", "MC 29", "MC 40"],
    mainExercise: "For every minor-7 chord, play 3-5-7-9 ascending, then a half-step to the next chord.",
    description: "Concept file; the road-map through any tune.",
    inApp: false },
];

/** Helper: get the in-app subset of the catalog (already wired to
 *  HarmonicPath). Used by the MasterclassPicker to highlight the
 *  tunes the user can actually open right now. */
export function availableTunes(): MasterclassEntry[] {
  return MASTERCLASS_TUNES.filter((t) => t.inApp);
}

/** Helper: get a single tune by id. */
export function tuneById(id: string): MasterclassEntry | undefined {
  return MASTERCLASS_TUNES.find((t) => t.id === id);
}