/**
 * engine/pedagogy/concepts.ts - PRD-001 Phase 3 Slice 1 (D17 / REQ-PED-10/11).
 *
 * The concept registry: 8 hand-curated Concepts, authored in-repo as
 * plain TypeScript data (precedent: engine/styles/profiles/*). No LLM
 * pipeline (D17): the corpus is tiny and canonical, and the prose was
 * harvested from reviewed in-repo sources - the coCompose.ts technique
 * explanations (tritone substitution, modal mixture, secondary
 * dominant, axis modulation) and the conceptPaths.ts per-bar
 * descriptions (ii-V-I, voice leading) - then compressed.
 *
 * Review bar (replaces the LLM gate, D17): every concept passes the
 * shape checks pinned in concepts.test.ts (all REQ-PED-11 fields
 * non-empty, kebab-case ids, category in enum, related ids resolve,
 * exampleNumerals parse in the D21 grammar). The annotate.test.ts
 * truthfulness suite is the second gate: a concept is only ever linked
 * from an annotation whose pattern really fires.
 */

import type { Concept } from "./types";

/** REQ-PED-10, in the order the PRD lists them. */
export const CONCEPT_IDS: readonly string[] = [
  "ii-v-i",
  "tritone-sub",
  "secondary-dominant",
  "modal-interchange",
  "voice-leading",
  "drop-2",
  "cadence",
  "axis-progression",
];

const II_V_I: Concept = {
  version: 1,
  id: "ii-v-i",
  title: "The ii-V-I Progression",
  category: "harmony",
  definition:
    "The backbone of jazz harmony: a minor seventh (ii) feeds a dominant seventh (V) that resolves to the tonic (I).",
  body:
    "The ii-V-I is the most common harmonic motion in the jazz repertoire. The ii chord (a minor seventh) sets up the V chord (a dominant seventh), and the tritone inside V pulls by half step to the third and seventh of I. Adding ii in front of V softens the arrival and gives the soloist a four-bar glide path into the tonic.\n\n" +
    "Because the shape is identical in every key, players practice it through the circle of fifths until the fingerings and guide tones are automatic. The same walk works in minor, where ii becomes a half-diminished chord (ii7(b5)) and V often carries alterations (V7alt) to sharpen the pull.\n\n" +
    "Listen for the guide tones: the seventh of ii falls by half step to the third of V, then resolves again into the tonic. That descending chain - 7th to 3rd of the next chord - is what makes the progression feel like it is falling forward.",
  references: null,
  related: ["cadence", "tritone-sub", "voice-leading"],
  exampleNumerals: ["ii7", "V7", "Imaj7", "ii7(b5)", "V7alt"],
};

const TRITONE_SUB: Concept = {
  version: 1,
  id: "tritone-sub",
  title: "Tritone Substitution",
  category: "harmony",
  definition:
    "Replacing a dominant seventh chord with the dominant a tritone away (V7 becomes bII7), keeping its guide tones intact.",
  body:
    "A dominant seventh chord is defined by the tritone between its third and seventh. The dominant a tritone away shares that same tritone - it just swaps which note is the third and which is the seventh. That is why bII7 can stand in for V7: the two chords carry identical magnetic cores.\n\n" +
    "Both chords still resolve to the same target, but the bass moves down by half step (Db to C) instead of dropping a fifth (G to C). The result is a smooth chromatic descent, the signature sound of bebop and post-bop ballads. Common in jazz to add chromatic motion to a plain V-I.\n\n" +
    "Watch for it when a bII7 chord lands right before the tonic. If the bII7 resolves down a semitone to an I-family chord, you are hearing a tritone substitution, not a borrowed chord out of nowhere.",
  references: null,
  related: ["ii-v-i", "modal-interchange", "axis-progression"],
  exampleNumerals: ["V7", "bII7", "Imaj7"],
};

const SECONDARY_DOMINANT: Concept = {
  version: 1,
  id: "secondary-dominant",
  title: "Secondary Dominants",
  category: "harmony",
  definition:
    "A dominant seventh chord that resolves somewhere other than the tonic - V of ii, V of V - briefly tonicizing another scale degree.",
  body:
    "Any diatonic chord can borrow its own dominant. The V of the second degree (V/ii, written II7 in major) pulls hard to ii for a moment, as if ii were the tonic. The chord itself is usually a dominant seventh whose root sits a fifth above the target, so the test is mechanical: root plus five semitones equals the next chord's root.\n\n" +
    "Secondary dominants are how music leans on a key without leaving it. A III7 reaching over to vi, a VI7 reaching to ii, a II7 reaching to V - each creates a mini cadence inside the larger phrase. They are the most common source of accidentals in tonal music: the third of the secondary dominant is a chromatic raised note relative to the home key.\n\n" +
    "In a generated etude, spot the pattern by looking for an uppercase-degree dominant seventh (not V7) whose root is a fifth above the chord that follows it.",
  references: null,
  related: ["ii-v-i", "cadence", "modal-interchange"],
  exampleNumerals: ["II7", "V7", "III7", "VI7", "vi7"],
};

const MODAL_INTERCHANGE: Concept = {
  version: 1,
  id: "modal-interchange",
  title: "Modal Interchange",
  category: "harmony",
  definition:
    "Borrowing chords from a parallel mode - bVI, bVII, or a minor iv in a major key - to color the harmony without modulating.",
  body:
    "Every key has siblings: the parallel minor of a major key, the parallel major of a minor key, and the other church modes on the same tonic. Chords from those siblings can be lifted into the home key whole-cloth, keeping their quality and function. In C major, an Abmaj7 (bVI), a Bb7 (bVII7), or an Fm7 (iv7) all come from C minor - none of them modulate, they just tint.\n\n" +
    "The tell is the root: a chord whose root pitch class is not one of the seven diatonic roots of the mode, yet is not functioning as a secondary dominant or a tritone substitution, has almost certainly been borrowed. Film music, radiohead-era pop, and minor-key jazz lean on interchange constantly; the Beatles' use of bVII in major keys is the gateway drug.\n\n" +
    "Because borrowed chords arrive with their own quality, they darken or brighten a progression by exactly one axis at a time - the flat submediant for gravity, the flat seventh for rock propulsion, the minor iv for the classic 'heartbreak' cadence.",
  references: null,
  related: ["tritone-sub", "axis-progression", "cadence"],
  exampleNumerals: ["bVI", "bVII7", "iv7"],
};

const VOICE_LEADING: Concept = {
  version: 1,
  id: "voice-leading",
  title: "Voice Leading",
  category: "voice-leading",
  definition:
    "The horizontal art: moving each individual voice as little as possible between chords, so harmony flows instead of jumping.",
  body:
    "Chords are not just vertical objects; they are four (or five) separate lines that happen to agree at a moment in time. Good voice leading keeps each line close to its previous note: common tones are held, the rest move by step, and no voice lurches around the keyboard. The classic ii-V-I in four voices moves the guide tones down by half steps while the other voices shift by whole steps - the total motion is tiny, yet the harmony clearly advances.\n\n" +
    "Measure it by summing, for each voice of one chord, the distance to the nearest pitch of the next chord, then averaging over the progression. An average of four semitones or less per transition means the voicings are genuinely smooth - the chords share most of their pitch material and nothing has to leap.\n\n" +
    "Voice leading is why pianists learn inversions: the same four notes, rearranged, can cut the motion to the next chord in half. When you practice an etude, take each chord one voice at a time and sing that line; the harmony becomes melody.",
  references: null,
  related: ["ii-v-i", "drop-2", "cadence"],
  exampleNumerals: ["ii7", "V7", "Imaj7"],
};

const DROP_2: Concept = {
  version: 1,
  id: "drop-2",
  title: "Drop 2 Voicings",
  category: "harmony",
  definition:
    "Taking a close four-voice chord and dropping the second-highest note an octave - the standard guitar and small-combo voicing shape.",
  body:
    "Start with any seventh chord stacked as closely as possible: root, third, fifth, seventh within an octave. Now take the second voice from the top and move it down twelve semitones. The result spans a tenth, with a characteristic gap between the melody note and the voice directly beneath it while the lower three voices stay packed inside an octave - that open sound is the drop 2.\n\n" +
    "Drop 2 is the workhorse voicing of jazz guitar (every Charlie Christian solo lives in these shapes) and of four-way horn writing, because the spread keeps each voice audible: no two notes crowd within a minor second, and the melody note on top always rings clear. A drop 2 tetrad is easy to spot: the second voice from the top sits at least a perfect fifth below the melody note, while the bottom three voices still fit inside an octave.\n\n" +
    "The same recipe generalizes - drop 3, drop 2 and 4 - but drop 2 is the one that became the default texture for comping and writing. When the etude's chords look unusually wide, you are looking at drop 2 by design.",
  references: null,
  related: ["voice-leading", "ii-v-i"],
  exampleNumerals: ["ii7", "V7", "Imaj7"],
};

const CADENCE: Concept = {
  version: 1,
  id: "cadence",
  title: "Cadences",
  category: "form",
  definition:
    "The punctuation of harmonic phrases: V to I is the full stop (authentic), iv to I the amen close (plagal).",
  body:
    "A cadence is a chord motion that tells the listener a phrase has ended - or paused. The strongest is the authentic cadence, V to I (or V to i in minor, where the raised leading tone turns the v into a true dominant): the dominant's tritone resolves outward or inward into the tonic's third and seventh, and the bass leap of a fifth stamps the ending. When the melody also lands on the tonic note, the cadence is perfect; anything weaker is a comma, not a period.\n\n" +
    "The plagal cadence, iv to I, is its gentler cousin - the 'Amen' ending, the minor borrowed subdominant sighing into the tonic. Pop music leans on the deceptive cadence, V to vi, which sets up resolution and then refuses it, keeping the loop spinning.\n\n" +
    "In an etude, the final two bars are the cadence check: if the last chord is the tonic and the bar before it is its dominant, the form closes with an authentic cadence; a minor iv before the tonic is the plagal variant. Everything before the cadence is the sentence; the cadence is the period.",
  references: null,
  related: ["ii-v-i", "secondary-dominant", "voice-leading"],
  exampleNumerals: ["V7", "Imaj7", "iv7", "I"],
};

const AXIS_PROGRESSION: Concept = {
  version: 1,
  id: "axis-progression",
  title: "Axis and Major-Third Progressions",
  category: "harmony",
  definition:
    "Harmony that moves by major thirds or tritones instead of fifths - the symmetric axis of Bartok and the Coltrane cycle.",
  body:
    "Fifths divide the octave unevenly, which is why functional harmony has a direction. Major thirds and tritones divide it evenly, and symmetric motion feels like floating between key centers rather than walking to one. Bartok's axis system pairs a tonic with the three keys a minor third apart (A - C - Eb - F#): related by symmetry, not by dominant, so the motion is color, not grammar.\n\n" +
    "Dividing the octave by major thirds is the same kind of symmetry, and Coltrane made that one famous: Giant Steps cycles tonic areas by major third (B - G - Eb - B), each new center approached by its own dominant. The ear loses and regains the ground on purpose - three tonics split the octave evenly, so each modulation lands a major third away instead of the fifth the listener expects.\n\n" +
    "Spot the pattern in three consecutive chords whose roots move by the same interval of four (or eight) semitones, or in an exact tritone alternation. Because the cycle closes after three or two chords, axis motion tends to appear in short, striking bursts rather than whole forms.",
  references: null,
  related: ["tritone-sub", "modal-interchange", "secondary-dominant"],
  exampleNumerals: ["Imaj7", "III7", "bVI", "bII7"],
};

const REGISTRY: ReadonlyMap<string, Concept> = new Map<string, Concept>(
  [
    II_V_I,
    TRITONE_SUB,
    SECONDARY_DOMINANT,
    MODAL_INTERCHANGE,
    VOICE_LEADING,
    DROP_2,
    CADENCE,
    AXIS_PROGRESSION,
  ].map((c) => [c.id, c]),
);

/** Null when unknown, never throws (UI-facing lookup, REQ-PED-5). */
export function getConcept(id: string): Concept | null {
  return REGISTRY.get(id) ?? null;
}

/** Registry order = CONCEPT_IDS order. */
export function allConcepts(): readonly Concept[] {
  return CONCEPT_IDS.map((id) => REGISTRY.get(id) as Concept);
}
