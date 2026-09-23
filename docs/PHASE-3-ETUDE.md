# PRD-001 Phase 3 Design: Etude Mode (generators + pedagogy + slicing)

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation authority for @developer.
Scope of THIS pipeline: Slice 1 only (pure engine). Slices 2-3 are designed to API level so Slice 1's surface provably unblocks them.
Baseline (verified this round): `npm test` = 1237 passed / 1 skipped / 2 failed; the 2 failures are the pre-existing CSS-WIP component tests (FormPlanner.test.tsx, FormTemplatePicker.test.tsx) and are NOT this pipeline's concern. Do not touch the 11 dirty `src/components/*` files.

## 1. Headline audit findings (verified against code, 2026-09-23)

1. TWO notation engines do NOT exist. VexFlow is NOT installed (absent from package.json). abcjs (6.1 MB unpacked) is installed and is the ONLY staff renderer, live at 5 sites: `LiveScoreDisplay.tsx`, `ChordInspector.tsx`, `RecordingModal.tsx`, `leadSheet.ts`, `sheetMusicExport.ts` (abcjs SVG -> jsPDF -> printable sheet). `LiveScoreDisplay` renders treble+bass staves from the active path TODAY.
2. Tone.js (REQ-ETU-22 "play via Tone.js") is ALSO not actually used: `tone@15` sits in dependencies only as `@magenta/music`'s transitive; zero `Tone.` imports in `src/`. Playback is the hand-rolled Web Audio singleton `audioEngine` (`src/lib/audio.ts`, soundfont-player + oscillator fallback) driven per-step by `rhythmEngine`. REQ-ETU-22 is satisfied-in-fact by the existing stack; adding Tone would be dead weight.
3. A legacy "Etude Assistant" already lives on the Etude surface (`src/lib/etude.ts` + App.tsx `handleGenerateEtude`, ~line 1412): fibonacci / sacred_geometry / coltrane_fractal / trumpet_etude / magenta_rnn / gemini_* gimmick generators. They emit `HarmonicPath` (chord-per-step), use `Date.now()` in ids, ignore StyleProfiles/constraints/annotations, and load via `setPaths([{...newPath, name}, ...paths]); setActivePathIndex(0); setActiveStepIndex(0); resetTranspose...` - THAT is the existing generated-content load pipeline Slice 2 reuses. `src/lib/generator.ts` additionally has live `Math.random` sites (legacy src/, out of purity scope, but proof the new engine must NOT inherit it).
4. Step-count conventions coexist and the etude must sit on the RIGHT side of both: `paths.ts` labels one `HarmonicStep` as one BEAT (STEPS_PER_BAR=4, padPath cycles to MIN 96 / MAX 256 steps), while the W2 audio truth (`loopWav.ts`, `formPeriod.ts`) renders one step as one BAR. Generated etudes therefore emit ONE STEP PER BAR (8-bar etude = 8 steps); `padPath` cycles it to 96 steps; `detectFormPeriod` then returns the true form length so WAV export renders the etude exactly once. If a generated etude happens to contain an internally repeated phrase (e.g. two identical 4-bar halves), the detected period is the SHORTER true form (4) - musically correct, harmless for export. The test asserts period divides bars; one golden seed pins period === 8 exactly.
5. Practice mechanics audit (REQ-PRAC P0s): metronome EXISTS as a bare on/off toggle (`PracticeHeader` button -> `rhythmEngine.setMetronomeEnabled`, App.tsx ~1245). MISSING: independent metronome volume (REQ-PRAC-2), sound preset, per-beat accents, subdivision (REQ-PRAC-1 partial), count-in entirely (REQ-PRAC-10/11 - zero "countIn" code in src). Section looping EXISTS (`loopStartBar`/`loopEndBar`/`isLooping`/`setLoopBar` on `PlaySessionRail` + PracticeHeader) -> REQ-PRAC-20 is SHIPPED. No `@media print` rules anywhere (`src/index.css`) -> REQ-ETU-32 greenfield.
6. Export audit: MIDI export SHIPPED (`midiExport.ts` `exportMidiWithVariation`, honors session transpose since Phase 2) -> REQ-ETU-30 done. MusicXML EXISTS (`scoreExport.ts` `toMusicXml`) but is CHORDS-ONLY (no melody voice; `grep melody` in that file: zero hits) -> REQ-ETU-31 = extend, not build. Sheet PDF exists via `sheetMusicExport.ts` (abcjs pipeline, path-shaped input).
7. Count pins are SAFE by construction: `tunesCount()` (`scripts/count-tunes.mjs`) reads only `inApp:` lines in `src/data/masterclass.ts`; `curatedBriefingCount()` reads `src/lib/pathBriefing.ts` catalog data. Generated etudes are runtime artifacts that never enter those files. `assets/check-links.cjs` counts `it(` ONLY in `tests/*.test.ts` - engine tests (and `src/lib/*.test.ts`) are invisible to the drift gate. Engine tests stay colocated in `engine/`; `tests/` remains OFF-LIMITS.
8. `melodyMarkov.ts`: deterministic (mulberry32 direct), order-2 Markov over chord-tone pc sets, one bar at a time, single octave anchor (MIDI 60), no range/syncopation/chromaticism/difficulty control. PARTIAL - superseded by `engine/etude/melody.ts` (REQ-ETU-11 asks for weighted interval selection, which is simpler and profile-driven). Keep the file (its consumers/tests are untouched); do not import it from engine.
9. `coCompose.ts` `proposeAlternative`: per-bar substitution proposer (tritone sub, modal mixture, secondary dominant, passing dim, axis, Coltrane change) with hand-written technique + explanation strings. Not an etude generator; HARVEST its prose voice and its substitution taxonomy for `engine/pedagogy/` (the technique names map 1:1 onto 4 of the 8 required concepts).
10. Inherited engine assets are directly sufficient: `createRng` facade (never raw seeds past the boundary), `deriveCanonicalId("etu", seed, constraints)` + `makeInstanceId(nowMs, seq)` (clock is a PARAMETER - ADR-005), `Versioned`, `engine/core/spelling.ts` `spellTonic(pc, mode, literal)` for chord names + titles, `StyleProfile` with `harmony.vocabulary` (weighted numerals), `harmony.progressions` (templates), the five scaled biases, full `MelodyProfile`, `scaleProbability(base, difficulty)`, and `engine/core/idea.ts` as the copyable template for a Versioned + branded-ids artifact type.
11. Engine purity: 14 non-test sources today vs `MIN_SCANNED_FILES = 12` (floor is already stale-but-passing; bump it in the SAME commit as the first new engine file, to the final count - see D20).
12. `src/lib/rhythm.ts`, `src/lib/audio.ts`, `src/lib/scoreExport.ts`, `src/hooks/useGeneratorPanel.ts`, `src/App.tsx` are all CLEAN (not in the dirty-11) - Slice 2/3 may edit them; `PlaySessionRail.tsx` and `LiveScoreDisplay.tsx` are DIRTY - Slice 3 documents their existing behavior and plans NEW components instead of editing them.

## 2. Decisions

### D16 (resolves PRD Q2): Staff notation = abcjs. VexFlow is dropped from the stack entirely.

Decision: REQ-ETU-21 ("staff notation via VexFlow", P1) is satisfied by abcjs, the notation engine already shipped and battle-tested at 5 call sites. VexFlow is NOT added. This is a documented PRD deviation (PRD Appendix E lists VexFlow; section 14 Phase 3 says "staff notation").

Rationale:
- Two notation engines = a second Bravura-class font pipeline, a second layout engine, split maintenance, and real bundle weight on a Vercel-served SPA whose main chunk is already 563 KB.
- The print/PDF pipeline (`sheetMusicExport.ts`: abcjs -> SVG -> jsPDF via svg2pdf) is exactly what REQ-ETU-32 needs; VexFlow would force a parallel PDF path.
- PRD sec 7.2 explicitly excludes full notation EDITING (defer to MuseScore); the in-app staff view is read-only display, which abcjs already does (`LiveScoreDisplay`).
- REQ-ETU-31 (MusicXML export) is a serialization task on the Etude data model - no rendering engine involved.
- abcjs handles chord symbols + multi-voice staves + playback-less rendering, which covers the etude view (melody staff + chord symbols).

Rejected: (b) VexFlow for etude only + abcjs for live score - permanent two-engine split for one P1 view; (c) VexFlow + migrate live score - largest scope, no user-visible gain, churns a DIRTY file (`LiveScoreDisplay`).
Confidence: HIGH. If a future phase needs features abcjs lacks (e.g. per-note editing), that is a new ADR, not a Phase 3 concern.

### D17 (resolves PRD Q7): Concept registry = hand-curated, authored in-repo from existing prose precedents.

Decision: the 8 concepts (REQ-PED-10) are hand-authored as plain data in `engine/pedagogy/concepts.ts`. No LLM-assisted pipeline, no hybrid.

Rationale:
- The corpus is tiny and canonical: ii-V-I, tritone sub, secondary dominant, modal interchange, voice leading, drop 2, cadence, axis progression. Textbook-stable content; there is no long tail where LLM leverage pays.
- The repo already contains reviewed, correct, in-voice prose for 4 of the 8 (coCompose technique explanations) plus `src/lib/conceptPaths.ts` per-bar descriptions and `docs/HARMONIC-WORKBOOK.md` - authoring is harvest-and-compress, not generation.
- LLM-assisted text needs a fact-checking review bar anyway (harmony hallucinations are plausible and damaging in a PEDAGOGY product); hand-authoring removes the pipeline AND the review ceremony in one move.
- Review bar (replaces the LLM gate): every concept passes `conceptShapeValid` (all REQ-PED-11 fields non-empty, id kebab-case, category in enum, related ids resolve to real concepts) - pinned by `engine/pedagogy/concepts.test.ts`. Musical examples inside `body` must be consistent with the shipped numeral grammar; the `annotate.test.ts` truthfulness suite is the second gate (a concept is only ever linked from an annotation whose pattern really fires).

File format: TypeScript data (not JSON) - same precedent as `engine/styles/profiles/*` (validator-backed, typed, zero parsing at runtime, JSON round-trip pinned by test).
Confidence: HIGH.

### D18 (Q10-adjacent): Annotation type + emission contract.

`Annotation` follows PRD 11.1 exactly: `{ id, target, label, text, conceptId?, confidence? }`, Versioned. `target` is a discriminated union covering the six REQ-PED-2 kinds, but Slice 1 generators emit ONLY: `{kind:"chord", bar}`, `{kind:"progression", fromBar, toBar}`, `{kind:"melody"}`. Ids are deterministic ordinals from the detector (`ann-<detector>-<bar>`), never rng, never clock. Generators return `{ etude, annotations }` (REQ-PED-1); `etude.annotations` is the SAME array (single source, one serialization). `conceptId` is non-null whenever a detector recognized a registry pattern (REQ-PED-3) and the truthfulness test asserts every emitted `conceptId` resolves in the registry. Ear-training scoring (Q10 proper) is Phase 6 - untouched here.
Confidence: HIGH.

### D19: Phase slicing - three shippable pipelines.

- Slice 1 (THIS pipeline) - Pure engine: `engine/etude/` (constraints, harmony, melody, assembly) + `engine/pedagogy/` (concepts, annotation detection) + purity floor bump. Zero UI, zero src/ changes, zero new deps. Ships the determinism guarantees everything else leans on. Meets every REQ-ETU-1x and REQ-PED-1x that is about DATA.
- Slice 2 - Etude UI wiring: constraint panel on the Etude surface (REQ-ETU-1/2/4), adapter `src/lib/etudeEngine.ts` (clock + HarmonicPath conversion), load via the existing `setPaths` generate pipeline (finding 3), piano roll view (REQ-ETU-20), abcjs staff view (REQ-ETU-21 per D16), MusicXML melody voice (REQ-ETU-31), URL constraint persistence (REQ-ETU-3), seed randomize button.
- Slice 3 - Practice + pedagogy surfaces: metronome volume/preset/accents/subdivision (REQ-PRAC-1/2 gaps; toggle + loop already exist per finding 5), count-in (REQ-PRAC-10/11), annotation display surfaces + concept drawer (REQ-PED-4/5/7), print stylesheet (REQ-ETU-32).
Ordering rationale: Slice 1 is risk-free additive pure code; Slice 2 depends on its API; Slice 3 depends on Slice 2's loaded-etude surface but its pedagogy half depends only on Slice 1's registry. REQ-ETU-22/23/24/30 are already shipped (findings 2, 6 + Phase 2 transposition) - they appear in NO slice. Ear training (REQ-PED-20..25), SRS, progress logging stay in PRD Phase 6 - NOT Phase 3.
Confidence: HIGH.

### D20: Purity floor bump.

`engine/purity.test.ts` `MIN_SCANNED_FILES: 12 -> 21` (14 existing + 7 new sources), changed in the SAME commit that adds the first new engine source. No other guard changes: the guard auto-walks `engine/`, and all new files are relative-import, clock-free, rng-injected by construction.
Confidence: HIGH.

## 3. Slice map (what each pipeline ships)

| Slice | Ships | PRD reqs closed | Est. |
|---|---|---|---|
| 1 (NOW) | engine/etude + engine/pedagogy, full determinism test matrix | REQ-ETU-10..15 (data), REQ-PED-1/2/3/10/11 (data), REQ-FND-6 usage | 3-5 dev-days |
| 2 | Constraint panel, etudeEngine adapter, generated-etude load pipeline, piano roll, abcjs staff view, MusicXML w/ melody, URL constraints | REQ-ETU-1/2/3/4/20/21/31 | 1-1.5 wk |
| 3 | Metronome volume/preset/accents/subdivision, count-in, annotation surfaces + concept drawer, print stylesheet | REQ-PRAC-1/2/10/11, REQ-PED-4/5/7, REQ-ETU-32 | ~1 wk |

Slice 1 API -> Slice 2/3 unblock proof: `generateEtude(constraints, {nowMs, seq})` gives the panel a pure call; `Etude.constraints` is the URL-serialization payload (REQ-ETU-3); `etudeToSteps(etude)` returns the `HarmonicStep`-shaped array the existing `setPaths` pipeline + `padPath` + `detectFormPeriod` consume unchanged (finding 4); `etude.melody` (slot grid) is the piano-roll data source; `annotations` + `getConcept()` feed Slice 3's drawer; `EtudeNote.strongBeat` lets Slice 2's MusicXML writer and Slice 3's print layout keep accent semantics without re-deriving.

## 4. Slice 1 - file tree

```
engine/
  etude/
    types.ts        EtudeConstraints + Etude + validation (D18 types re-exported)
    harmony.ts      generateProgression + numeral grammar (exported for tests)
    melody.ts       generateMelody (weighted interval selection, chord-tone bias)
    assemble.ts     generateEtude + etudeToSteps + title generation
    harmony.test.ts
    melody.test.ts
    assemble.test.ts
    determinism.test.ts   (3 styles x 5 difficulties x 8/16/24 bars matrix)
  pedagogy/
    types.ts        Concept + Annotation (D18)
    concepts.ts     8 hand-authored concepts + lookup API
    annotate.ts     truthful concept detection over generated chords/melody
    concepts.test.ts
    annotate.test.ts
  purity.test.ts    (ONE-LINE edit: MIN_SCANNED_FILES = 21)
```

Rules for every new file: ASCII only; no `console.*`; no `Math.random` / `Date.now` / `new Date` / `performance.now`; relative imports only (NO `tonal`, even though it is installed - it stays out of engine); no `any`, no `@ts-ignore`; all randomness through the injected `Rng`; `nowMs`/`seq` only ever as parameters.

## 5. Slice 1 - type definitions (copyable)

### engine/pedagogy/types.ts

```ts
import type { Versioned } from "../core/versioned";

/** REQ-PED-11 categories. */
export type ConceptCategory =
  | "harmony"
  | "voice-leading"
  | "melody"
  | "form"
  | "rhythm";

/** REQ-PED-11. Plain data; JSON round-trip safe (pinned by test). */
export interface Concept extends Versioned {
  readonly id: string; // kebab-case, registry-unique: "ii-v-i"
  readonly title: string;
  readonly category: ConceptCategory;
  /** One-sentence hook, <= 160 chars (drawer header, tooltips). */
  readonly definition: string;
  /** Longer body, 1-3 paragraphs, \n\n separated. ASCII. */
  readonly body: string;
  /** External references ("label - URL"); null when none. */
  readonly references: readonly string[] | null;
  /** Other concept ids; null when none. Must resolve (test-pinned). */
  readonly related: readonly string[] | null;
  /** Numeral tokens illustrating the concept in the D21 grammar
   * (Slice 3 "Hear an example" feeds these to the generator). */
  readonly exampleNumerals: readonly string[] | null;
}

/** REQ-PED-2 target kinds. Slice 1 EMITS only chord/progression/melody;
 * the rest exist so Slice 2/3 never need a breaking union change. */
export type AnnotationTarget =
  | { readonly kind: "chord"; readonly bar: number }
  | { readonly kind: "progression"; readonly fromBar: number; readonly toBar: number }
  | { readonly kind: "note"; readonly slot: number }
  | { readonly kind: "melody" }
  | { readonly kind: "voicing"; readonly bar: number }
  | { readonly kind: "scale" };

/** REQ-PED-1/2/3. */
export interface Annotation extends Versioned {
  readonly id: string; // deterministic: "ann-<detector>-<bar>"
  readonly target: AnnotationTarget;
  readonly label: string; // short chip text, <= 40 chars
  readonly text: string; // 1-3 sentences
  readonly conceptId: string | null; // resolves in the registry when non-null
  /** 0..1; detectors emit 1 (pattern present is decidable). null = editorial. */
  readonly confidence: number | null;
}
```

### engine/etude/types.ts

```ts
import type { Versioned } from "../core/versioned";
import type { CanonicalId, InstanceId } from "../core/ids";
import type { Seed } from "../core/rng";
import type { StyleId } from "../styles/types";
import type { Difficulty } from "../styles/difficulty";
import type { Annotation } from "../pedagogy/types";

/** PRD 11.1 "mode" = tonal mode. Named to never collide with app Mode. */
export type EtudeMode = "major" | "minor";

/** Bars: integer 4..32. v1 meter is 4/4 only (documented simplification;
 * StyleProfile.meters stays unused for etudes until a later phase). */

export interface HarmonyConstraints {
  /** null = unrestricted. Tokens are chord quality symbols:
   * "maj7" | "7" | "m7" | "m7b5" | "maj9" | "9" | "sus4" | "6". */
  readonly allowedQualities: readonly string[] | null;
  /** null = unrestricted. Numeral tokens in the D21 grammar. */
  readonly allowedNumerals: readonly string[] | null;
  readonly startOn: string | null; // numeral token, bar 0 forced
  readonly endOn: string | null;   // numeral token, last bar substituted (REQ-ETU-13)
  readonly requireChromaticism: boolean; // >= 1 non-diatonic chord guaranteed
}

export interface MelodyConstraints {
  readonly maxIntervalSemitones: number | null; // 1..24; null = profile value
  readonly chordTonesOnStrongBeats: boolean; // forces P = 1.0
  readonly range: readonly [number, number] | null; // MIDI; null = profile range
}

export interface RhythmConstraints {
  readonly straightRhythmsOnly: boolean; // syncopation forced to 0
}

/** REQ-ETU-1/2. The FULL generation input; also the REQ-ETU-3 URL payload. */
export interface EtudeConstraints extends Versioned {
  readonly styleId: StyleId;
  readonly key: number; // tonic pitch class 0..11
  readonly mode: EtudeMode;
  readonly difficulty: Difficulty; // 1..5
  readonly bars: number; // int 4..32
  readonly tempo: number | null; // null = profile.defaultTempo
  readonly seed: Seed; // uint32
  readonly harmony: HarmonyConstraints;
  readonly melody: MelodyConstraints;
  readonly rhythm: RhythmConstraints;
}

export interface EtudeChord {
  readonly bar: number; // 0-based
  readonly numeral: string; // grammar token, e.g. "ii7", "bII7", "V7alt"
  readonly rootPc: number; // 0..11
  readonly qualitySymbol: string; // "m7" | "dom7" | "maj7" | "halfdim" | "maj9" | "dom9" | "sus4" | "maj6"
  readonly name: string; // display, spelled via engine/core/spelling: "Dm7"
  readonly notes: readonly number[]; // MIDI ascending; drop2-spread when profile says so
}

/** Melody grid: absolute eighth-note slots; 8 slots per 4/4 bar.
 * slot % 4 === 0 -> beat 1/3 (strong), slot % 2 === 0 -> beat (metric). */
export interface EtudeNote {
  readonly slot: number; // 0-based absolute slot
  readonly midi: number; // 0..127
  readonly durationSlots: number; // >= 1, no overlap (test-pinned)
  readonly velocity: number; // 0..1, derived: strong 0.85 / weak 0.65 / sync 0.75
  readonly strongBeat: boolean; // slot % 2 === 0
  readonly syncopated: boolean; // onset off the beat grid (slot % 2 !== 0)
}

/** REQ-ETU-10..15 artifact. PRD 11.1 Etude. */
export interface Etude extends Versioned {
  readonly canonicalId: CanonicalId; // deriveCanonicalId("etu", seed, constraints)
  readonly instanceId: InstanceId; // makeInstanceId(nowMs, seq) - injected
  readonly title: string; // deterministic from the rng stream (harmony -> melody -> title)
  readonly tempo: number;
  readonly styleId: StyleId;
  readonly key: number;
  readonly mode: EtudeMode;
  readonly bars: number;
  readonly difficulty: Difficulty;
  readonly seed: Seed;
  readonly chords: readonly EtudeChord[]; // length === bars
  readonly melody: readonly EtudeNote[]; // ascending by slot, no overlaps
  readonly annotations: readonly Annotation[];
  readonly constraints: EtudeConstraints;
}

/** REQ-PED-1 result envelope. `annotations` IS `etude.annotations` (same array). */
export interface EtudeResult {
  readonly etude: Etude;
  readonly annotations: readonly Annotation[];
}

/** Structurally compatible with src/lib/paths.ts HarmonicStep (one step =
 * one BAR for generated etudes - finding 4). The adapter casts; engine
 * never imports src/. */
export interface EtudeBarStep {
  readonly name: string;
  readonly notes: readonly number[];
  readonly descriptions: string;
}

export interface EtudeValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export function validateEtudeConstraints(candidate: unknown): EtudeValidation;
// Hand-rolled validator (precedent: validateStyleProfile). Checks every
// bound above; prefixes error paths ("c.bars", "c.harmony.endOn").
// Numeral tokens (allowedNumerals/startOn/endOn) must parseNumeral cleanly.
// styleId must be one of shippedStyleIds() (import from ../styles/index).
```

### D21: Numeral grammar (shared by harmony.ts + annotate.ts + concepts.exampleNumerals)

`parseNumeral(token, mode) -> { rootOffsetSemitones, qualitySymbol, intervals } | null`

- Optional accidental prefix `b`/`#` on the degree root (flat-root = borrowed/sub).
- Degree `I..VII`, case-significant: uppercase = major family, lowercase = minor family, trailing `o` = diminished.
- Suffixes: `maj7`, `7`, `m7`, `7(b5)`, `alt`, `sus4`, `add9`, bare (triad).
- Quality resolution table (dominant = uppercase + `7`; minor7 = lowercase + `7`; halfdim = lowercase + `7(b5)`; alt = dom7 + b13; add9 = quality + 14 semitones).
- Degree -> scale offset via the mode table: major [0,2,4,5,7,9,11], natural minor [0,2,3,5,7,8,10]; `b` prefix = table value - 1, `#` = + 1.
- ASCII only; the grammar is a strict superset of every token currently present in the three shipped profiles' vocabularies (test-pinned: every `profile.harmony.vocabulary[].numeral` and every progression token parses).
- `NumeralRealization` = `{ rootOffsetSemitones: number; qualitySymbol: string; intervals: readonly number[] }` (exported from harmony.ts).

### engine/etude/harmony.ts

```ts
import type { Rng } from "../core/rng";
import type { StyleProfile } from "../styles/types";
import type { EtudeChord, EtudeConstraints } from "./types";

export interface HarmonyInput {
  readonly profile: StyleProfile;
  readonly constraints: EtudeConstraints;
  readonly rng: Rng; // ONE handle per generation; documented draw order
}

export function generateProgression(input: HarmonyInput): readonly EtudeChord[];
export function parseNumeral(token: string, mode: EtudeMode): NumeralRealization | null;
export function spellChordName(rootPc: number, qualitySymbol: string, keyTonicPc: number, mode: EtudeMode): string;
```

Algorithm (every random choice through `rng`; call order fixed = determinism):
1. Filter `profile.harmony.progressions` to templates whose tokens pass `allowedNumerals`/`allowedQualities`; empty filter -> fall back to single-token template pool from the filtered vocabulary (never throw on user over-constraint; UI shows the warning string returned via annotations... NO - keep it simple: when the filter empties out, `generateProgression` throws `RangeError("constraints exclude all profile material")`; the adapter validates first and the panel disables impossible combos. Documented programmer-vs-user contract: user input goes through `validateEtudeConstraints` + a `feasibilityOf(constraints)` helper returning `string | null` (warning text) that Slice 2 renders).
2. `rng.pick` a template; repeat/crop it to exactly `bars`.
3. Bar 0 override when `startOn` set; last-bar substitution when `endOn` set (REQ-ETU-13).
4. Per-bar chromatic passes, each gated by `rng.bool(scaleProbability(base, difficulty))`:
   secondaryDominantRate -> replace a diatonic non-I chord X with its V7 (uppercase degree token + "7");
   modalInterchangeRate -> swap to bVI/bVII/iv family token;
   tritone pass (rate = `reharmonizationRate`): V7 -> bII7.
5. Extension pass: `rng.bool(scaleProbability(extensionBias, difficulty))` -> upgrade m7/maj7/dom7 to their add9 forms (qualitySymbol maj9/dom9/maj7+9 -> "maj9"/"9"); alteration pass (`alterationBias`) -> V7 -> V7alt. Difficulty 5 measurably produces more 9ths/alt dominants than 1 (monotonicity test).
6. `requireChromaticism` -> if pass 4 produced zero non-diatonic chords, force one deterministic substitution (bII7 before the final tonic-family chord, else bVII7 after bar 0); if constraints make it impossible -> RangeError.
7. Realize: numeral -> rootPc (key + mode table), intervals -> MIDI close voicing inside `profile.voicing.registers.chords`; when `profile.voicing.style === "drop2"`, spread tetrad voices (2nd-from-top down an octave) so the drop-2 concept is REAL and detectable; `spellChordName` via `engine/core/spelling` tables (flats for flat-side keys, ties flat - same D11 rules).

### engine/etude/melody.ts

```ts
export interface MelodyInput {
  readonly profile: StyleProfile;
  readonly constraints: EtudeConstraints;
  readonly chords: readonly EtudeChord[];
  readonly rng: Rng;
}
export function generateMelody(input: MelodyInput): readonly EtudeNote[];
```

- Grid: 8 eighth slots/bar (`SLOTS_PER_BAR = 8`), total `bars * 8`.
- Rhythm: onset per slot; strong-beat onsets near-certain, weak-beat onsets gated by `scaleProbability(syncopation, difficulty)` (forced 0 when `straightRhythmsOnly`); `rng.bool(repeatNoteRate)` sustains the previous note; rests = gaps.
- Pitch walk from a chord tone of bar 0: candidate intervals weighted by `contour` (stepwise favors [1,2], mixed both, leapy favors [3,4,5,7]); cap `min(profile.maxLeapSemitones, constraints.maxIntervalSemitones ?? 24)`; chromatic (non-scale) candidates gated by `scaleProbability(chromaticism, difficulty)`; on `strongBeat` onsets, P(land on chord tone) = `chordToneStrongBeat` (forced 1.0 by constraint); octave-shift to stay in `constraints.range ?? profile.melody.range` intersected with `voicing.registers.melody`; final note of the last bar = chord tone of the final chord (cadential).
- Velocity/strongBeat/syncopated fields derived per D-types above (no extra rng draws - keeps the stream short).

### engine/etude/assemble.ts

```ts
export interface EtudeClock {
  readonly nowMs: number; // caller-supplied epoch ms (ADR-005)
  readonly seq: number;   // per-process counter
}
export function generateEtude(constraints: EtudeConstraints, clock: EtudeClock): EtudeResult;
export function etudeToSteps(etude: Etude): readonly EtudeBarStep[];
export function feasibilityOf(constraints: EtudeConstraints): string | null;
```

1. `validateEtudeConstraints` must pass (throws RangeError otherwise - adapters validate first).
2. `getStyleProfile(styleId)` (throwing contract OK - programmer error).
3. ONE `rng = createRng(constraints.seed)`; draw order: harmony (all bars) -> melody (all bars) -> title. Order is part of the reproducibility contract; tests pin it.
4. `annotations = annotateEtude(chords, melody, profile, constraints)` (pedagogy).
5. Title: `"<Word A> <Word B> in <KeyLabel> <Mode>"` - Word A from a shared mood list, Word B from a per-style list (jazz: Changes/Swing/Ballad/Frame/Route; pop: Anthem/Hook/Loop/Path/Motion; classical: Study/Invention/Minuet/Etude/Canon); KeyLabel via `spellTonic(key, mode)`; optional `"No. <n>"` suffix when `rng.bool(0.5)`, `n = rng.range(1, 88)`.
6. `canonicalId = deriveCanonicalId("etu", constraints.seed, constraints)`; `instanceId = makeInstanceId(clock.nowMs, clock.seq)`; `tempo = constraints.tempo ?? profile.defaultTempo`; `version: 1` everywhere.
7. `etudeToSteps`: one step per bar, `{ name: chord.name, notes: [...chord.notes], descriptions: annotations for that bar joined by " | " (or chord numeral gloss) }` - structurally `HarmonicStep` (finding 4); the adapter layer casts.

### engine/pedagogy/concepts.ts

```ts
export const CONCEPT_IDS: readonly string[]; // the 8, ordered as REQ-PED-10 lists them
export function getConcept(id: string): Concept | null; // null, never throws
export function allConcepts(): readonly Concept[];
```

8 hand-authored `Concept` objects (ids: `ii-v-i`, `tritone-sub`, `secondary-dominant`, `modal-interchange`, `voice-leading`, `drop-2`, `cadence`, `axis-progression`), each with title/category/definition/body/references(null ok)/related/exampleNumerals. Prose harvested from coCompose explanations + conceptPaths descriptions + HARMONIC-WORKBOOK; 150-400 word bodies; every example uses D21 tokens.

### engine/pedagogy/annotate.ts

```ts
export function annotateEtude(
  chords: readonly EtudeChord[],
  melody: readonly EtudeNote[],
  profile: StyleProfile,
  constraints: EtudeConstraints,
): readonly Annotation[];
```

Truthful detectors (REQ-PED-2/3) - each emits ONLY when the pattern is present:
- `iiv i`: consecutive `ii* -> V* -> I*` (numeral regex on quality families) -> progression annotation, conceptId `ii-v-i`.
- `tritone-sub`: `bII7` resolving down a semitone to an `I`-family chord -> conceptId `tritone-sub`.
- `secondary-dominant`: uppercase non-V degree + `7` whose rootPc + 5 mod 12 equals the NEXT chord's rootPc -> conceptId `secondary-dominant`.
- `modal-interchange`: chord whose rootPc is outside the mode's diatonic pcs AND not explained by the two rules above -> conceptId `modal-interchange`.
- `cadence`: final-bar `V* -> I*` (authentic) or `iv -> I` (plagal) -> conceptId `cadence`.
- `voice-leading`: mean nearest-tone semitone motion between consecutive chords <= 4 -> chord annotation on the smoothest transition -> conceptId `voice-leading`.
- `drop-2`: tetrad whose 2nd-from-top voice sits > 7 semitones below the top with the lower three within an octave (the D-harmony spread shape) -> conceptId `drop-2`.
- `axis-progression`: 3+ consecutive chords with rootPc motion constant-mod-4 (major-third cycle) or exact tritone pair alternation -> conceptId `axis-progression`.
- melody editorial: chromatic-approach count > 0 -> one `{kind:"melody"}` annotation, conceptId null, confidence null (label "Chromatic approach notes").
Every emitted `conceptId` must resolve (test asserts); detectors are pure scans over the data the generator actually produced - no speculative prose.

## 6. Slice 1 - test plan (all colocated `engine/**/*.test.ts`, node env, invisible to the drift gate)

1. `harmony.test.ts` - parseNumeral covers EVERY vocabulary/progression token of all 3 profiles; endOn honored at every difficulty; startOn honored; allowedNumerals filter respected or RangeError; requireChromaticism produces >= 1 non-diatonic chord; drop2 spread present for jazz, close for pop/classical.
2. `melody.test.ts` - range respected (constraint + profile); maxInterval respected; chordTonesOnStrongBeats -> 100% strong-beat chord tones; straightRhythmsOnly -> zero syncopated onsets; no overlapping notes; durationSlots >= 1; final note is a chord tone of the last chord.
3. `assemble.test.ts` - validateEtudeConstraints accept/reject table (bad key 12, bars 33, difficulty 0, unparseable endOn token, unshipped styleId "lofi"); Etude JSON round-trips through JSON.stringify/parse losslessly (Versioned + plain data); canonicalId stable across {nowMs, seq} changes and across key-order permutations of constraints (canonicalize); instanceId differs when clock differs; etudeToSteps length === bars and structurally HarmonicStep-shaped.
4. `determinism.test.ts` - TABLE-DRIVEN matrix: 3 styles x 5 difficulties x bars {8,16,24} = 75 cases x 2 runs: `JSON.stringify(etudeA) === JSON.stringify(etudeB)` byte-identical (clock excluded via same {nowMs, seq}); difficulty monotonicity: for fixed seed lists per style, measured (extensions + alterations + chromatic melody notes) at d5 >= d1 and at d1 <= d3 (exact integer counts, no flaky stats); formPeriod compat: for each style/difficulty at bars=8, `etudeToSteps` -> cycle to 96 steps -> `detectFormPeriod` (import from `../../src/lib/formPeriod` - test-only src import, precedent: rng.golden.test.ts imports src/magenta/noise) returns p with `8 % p === 0` AND `96 % p === 0`, plus one golden seed asserting `p === 8` exactly.
   - Errata (shipped): the matrix is 3x5x3 = 45 cases, not 75; see determinism.test.ts.
5. `concepts.test.ts` - 8 concepts present with REQ-PED-10 coverage; shape valid (all fields, ASCII-only regex, definition <= 160 chars, body non-empty); ids unique; related/exampleNumerals resolve/parse; JSON round-trip.
6. `annotate.test.ts` - truthfulness both ways: hand-built chord sequences that DO contain each pattern -> annotation emitted with correct conceptId; sequences that DON'T -> zero false positives; every emitted conceptId resolves via getConcept; annotation ids deterministic.
7. `purity.test.ts` - one-line floor bump to 21 (D20). The guard auto-scans all new sources; no other change.

## 7. Ordered implementation checklist (@developer)

1. [ ] `engine/pedagogy/types.ts` (no deps beyond core) - then `engine/pedagogy/concepts.ts` + `concepts.test.ts`. Run `npx vitest run engine`.
2. [ ] `engine/etude/types.ts` (types + `validateEtudeConstraints` + `feasibilityOf` lives in assemble per section 5 - types file is data-shape + validator only).
3. [ ] `engine/etude/harmony.ts` (grammar + generator) + `harmony.test.ts`.
4. [ ] `engine/etude/melody.ts` + `melody.test.ts`.
5. [ ] `engine/pedagogy/annotate.ts` + `annotate.test.ts`.
6. [ ] `engine/etude/assemble.ts` + `assemble.test.ts`.
7. [ ] `engine/etude/determinism.test.ts` (matrix).
8. [ ] `engine/purity.test.ts`: `MIN_SCANNED_FILES = 21`.
9. [ ] Gates: `npm run lint` -> `npm test` (expect 1237 + new engine tests passing; the 2 CSS-WIP failures unchanged) -> `npm run build` (both) -> `npm run check:paths` (36/36) -> `node assets/check-links.cjs` (green - engine tests invisible).
10. [ ] Commit style: `feat(phase-3): slice 1 etude engine - harmony/melody/assemble generators + pedagogy registry + truthfulness annotator`.

## 8. DO NOT build in this pipeline (Slice 2/3 territory)

- NO UI: no constraint panel, no piano roll, no staff view, no concept drawer, no Etude Assistant changes in App.tsx.
- NO src/ edits at all except the one purity-floor line (which is in engine/ anyway - so: ZERO src/ edits).
- NO stores, no zustand slices, no URL serialization (Slice 2 consumes `Etude.constraints` for it).
- NO exports: don't touch midiExport.ts / scoreExport.ts / sheetMusicExport.ts (Slice 2 extends MusicXML with the melody voice).
- NO metronome/count-in/print-CSS changes (Slice 3).
- NO new npm dependencies (VexFlow stays out per D16; `tonal` stays OUT of engine/).
- NO edits to: `tests/`, the 11 dirty `src/components/*`, `src/lib/studies.ts`, README.md, SPEC.md, `.kai/`, AGENTS.md, `src/data/masterclass.ts`.
- NO touching the legacy `src/lib/etude.ts` / `generator.ts` (they keep serving the current Etude Assistant until Slice 2 ships; deletion is a Slice 2 product decision).
- NO count-in / ear-training / SRS / progress-logging code (PRD Phases 6-7).

## 9. Slice 2 sketch (API-level, proves unblocking)

- `src/lib/etudeEngine.ts` (adapter, console.warn/error only): `buildConstraints(panelState): EtudeConstraints` (validation + user errors surfaced, never thrown from UI), `runGeneration(constraints): { etude, path: HarmonicPath }` - reads `Date.now()` + module `seq`, casts `etudeToSteps` output to `HarmonicStep[]`, builds `HarmonicPath { id: "etu-" + canonicalId, title, description, steps }`; memoizes by canonicalId (same seed+constraints = same work, REQ-ETU-15).
- `src/components/EtudeConstraintPanel.tsx` (+ `.test.tsx` registered in `JSDOM_FILES` in vitest.config.ts - MANDATORY per AGENTS.md): style/key/mode/difficulty/bars/tempo/seed + Generate + Randomize seed (REQ-ETU-1/4); advanced section (REQ-ETU-2) collapsible; `feasibilityOf` warning line.
- Load via the existing generate pipeline: `setPaths([{...path, name: path.title}, ...paths]); setActivePathIndex(0); setActiveStepIndex(0)` + transpose reset (same 5-reset-site behavior as `handleGenerateEtude`); generation does NOT set dirty (path replacement, not an accept-mutation - matches legacy semantics; dirty stays CoCompose-accept-only).
- Playback: zero work - the loaded path flows through the existing audioEngine/rhythmEngine chain (finding 2).
- Piano roll: new `EtudePianoRoll.tsx` rendering `etude.melody` slots x MIDI grid (divs, not canvas; melodyByStep untouched).
- Staff: new `EtudeStaffView.tsx` - etude -> ABC via `scoreGenerator.midiToABCName` + chord symbols; abcjs.renderAbc (D16). LiveScoreDisplay untouched (dirty).
- MusicXML: extend `toMusicXml` with optional `melody?: readonly EtudeNote[]` second voice (scoreExport.ts is clean; new tests in `src/lib/scoreExport.etude.test.ts` - src/lib tests are node-project and drift-gate-invisible).
- URL: REQ-ETU-3 compact params mirroring `EtudeConstraints` (reuse the Phase 1/2 URL-sync pattern).

## 10. Slice 3 sketch

- Metronome upgrades in `src/lib/rhythm.ts` + `src/lib/audio.ts` (both clean): independent click gain (REQ-PRAC-2), preset selection (side-stick/woodblock/beep - oscillator recipes already in audioEngine), per-beat accent (bar-down louder), subdivision 1/2/4. UI chips in PracticeHeader (clean file).
- Count-in (REQ-PRAC-10/11): N bars (0/1/2) of clicks scheduled BEFORE transport start in the rhythmEngine start path; visible countdown overlay.
- Annotation surfaces: margin notes under the bar strip + "About this etude" panel + `ConceptDrawer.tsx` (registry-backed, `getConcept`); toggle REQ-PED-7; click-to-open REQ-PED-5.
- Print stylesheet: `@media print` block in `src/index.css` + print button hitting the existing abcjs -> jsPDF path (`sheetMusicExport.ts` accepts the etude's HarmonicPath - zero new renderer).

## 11. Risks & mitigations

| Risk | P | I | Mitigation |
|---|---|---|---|
| Numeral grammar drifts from profile vocabulary (generator emits tokens annotate.ts can't classify) | M | H | D21 is the single grammar; test 1 parses EVERY shipped-profile token; annotate consumes EtudeChord.numeral, never re-parses prose |
| Melody/chord register collision (melody dips under chord voicing) | M | M | melody range intersected with `voicing.registers.melody`; chords stay in `registers.chords` (48-72) - disjoint by profile data; test asserts melody.min > chords.max - 12 tolerance |
| Determinism broken by accidental iteration order (object keys) | L | H | Rule: selection only from ARRAYS; `canonicalize` handles identity; byte-equality matrix (75 cases x 2) catches any slip at the gate |
| formPeriod detects a shorter internal period (repeated phrase) -> WAV renders less than `bars` | M | L | Musically correct (identical repetition); test asserts divisibility; golden seed pins p === 8 |
| Over-constrained input empties the material pool | M | L | `feasibilityOf` returns a UI warning string; RangeError path documented + tested; panel (Slice 2) disables impossible combos |
| Purity floor bumped before files land (or vice versa) | L | L | D20: same commit; guard fails loudly either way |
| Developer scope-creeps into UI (phase is "Etude mode") | M | M | Section 8 explicit DO-NOT list; gates don't test UI, review checks file manifest |
| Snapshot discipline regression (git checkout during test iteration) | L | H | PHASE-2-02 rule stands: fresh per-round FILE-COPY snapshots, never `git checkout --`/`reset` |

## 12. Traceability

REQ-ETU-10 (harmony templates+filter+fit) -> harmony.ts 1-3 | REQ-ETU-11 (weighted intervals + chord-tone bias) -> melody.ts | REQ-ETU-12 (difficulty scaling) -> scaleProbability call sites in both + monotonicity test | REQ-ETU-13 (endOn) -> harmony.ts step 3 | REQ-ETU-14/REQ-PED-1/2/3 -> annotate.ts + EtudeResult | REQ-ETU-15 (determinism) -> single-Rng + stream order + matrix test | REQ-ETU-2 advanced fields -> Melody/Rhythm/HarmonyConstraints (optional-by-null) | REQ-PED-10/11 -> concepts.ts + D17 | REQ-FND-3/6 -> seed + canonicalId/instanceId usage | REQ-NFR-7 -> purity guard + D20.
Deferred to Slice 2: REQ-ETU-1/2(UI)/3/4/20/21/31. Deferred to Slice 3: REQ-PRAC-1/2/10/11 gaps, REQ-PED-4/5/7, REQ-ETU-32. Already shipped: REQ-ETU-22/23/24/30 (findings 2, 6; Phase 2 transposition). Out of Phase 3: REQ-PED-20..42 (PRD Phase 6).

**End of design.**
