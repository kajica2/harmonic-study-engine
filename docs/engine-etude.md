# Etude Engine (PRD-001 Phase 3, Slice 1)

Phase 3 slice 1 ships the pure generation core for Etude mode:
`engine/etude/` (constraints, harmony/melody generators, assembly) and
`engine/pedagogy/` (concept registry, truthfulness annotator). Nothing
here is user-facing yet: there is no constraint panel, no adapter, no
staff or piano-roll view, and zero `src/` changes. Slice 2 wires the UI
(load path: `etudeToSteps` -> `setPaths`); slice 3 adds practice +
pedagogy surfaces. Requirements trace to PRD-001 section 8.3 (REQ-ETU),
section 8.5 (REQ-PED), and the approved design `docs/PHASE-3-ETUDE.md`
(decisions D16-D21). The Phase 0 foundations this stands on are
documented in [engine-foundations.md](engine-foundations.md).

## Layout

| Path | Responsibility |
|---|---|
| `engine/etude/types.ts` | `EtudeConstraints` + artifact shapes + `validateEtudeConstraints` (hand-rolled, precedent: `validateStyleProfile`). |
| `engine/etude/harmony.ts` | D21 numeral grammar (`parseNumeral`, `numeralInfo`, `spellChordName`) + `generateProgression` + the constraint filter (`tokenAllowed`, `filterTemplates`). |
| `engine/etude/melody.ts` | `generateMelody`: weighted interval walk over an 8-slot-per-bar eighth-note grid. |
| `engine/etude/assemble.ts` | `generateEtude` (the pipeline), `etudeToSteps` (slice 2 adapter surface), `feasibilityOf` (panel warning), title generation. |
| `engine/pedagogy/types.ts` | `Concept` + `Annotation` + `AnnotationTarget` (REQ-PED-11/1/2/3). |
| `engine/pedagogy/concepts.ts` | The 8-concept registry (REQ-PED-10) + `getConcept` / `allConcepts`. |
| `engine/pedagogy/annotate.ts` | `annotateEtude`: nine truthful detectors over generated chords/melody. |
| `engine/etude/*.test.ts`, `engine/pedagogy/*.test.ts` | Colocated node-env tests (invisible to the README drift gate, same precedent as Phase 0). |

No barrel file; consumers deep-import (`src/lib/etudeEngine.ts` in
slice 2 will import from `engine/etude/assemble` and `engine/etude/types`).

## `generateEtude` - the entry point (REQ-ETU-10..15)

```ts
// engine/etude/assemble.ts
interface EtudeClock {
  readonly nowMs: number; // caller-supplied epoch ms (ADR-005)
  readonly seq: number;   // per-process counter
}
declare function generateEtude(
  constraints: EtudeConstraints,
  clock: EtudeClock,
): EtudeResult; // { etude, annotations } - SAME array (D18, pinned)
```

The pipeline: `validateEtudeConstraints` (throws `RangeError` on
invalid input - adapters validate first) -> `getStyleProfile` (throwing
contract OK, programmer error) -> ONE `createRng(seed)` handle shared by
every generator -> harmony -> melody -> annotations -> title ->
deterministic ids (`deriveCanonicalId("etu", seed, constraints)`,
`makeInstanceId(clock.nowMs, clock.seq)`). The clock is a PARAMETER:
the engine never reads `Date` (purity guard enforces), so
`canonicalId` is clock-independent while `instanceId` is not
(both pinned by `assemble.test.ts`). `etude.constraints` is carried
verbatim, and the whole artifact is `Versioned` plain data that JSON
round-trips losslessly.

## Draw-order reproducibility contract (REQ-ETU-15)

Same seed + same constraints => byte-identical etude, any device,
forever. The rng stream has ONE fixed consumption order:

1. **harmony, all bars** (`generateProgression`): template pick ->
   per-bar chromatic passes, bars ascending (secondary dominant ->
   modal interchange -> tritone) -> per-bar extension/alteration
   passes, bars ascending.
2. **melody, all bars** (`generateMelody`), per-slot order fixed:
   onset bool (only off beats 1/3) -> repeat bool (consumed for every
   onset after the first, even where its effect is suppressed) ->
   direction bool -> weighted interval -> chromatic gate bool (+
   optional re-pick draw) -> chord-tone gate bool (only on beat slots).
3. **title, last** (`generateTitle`): mood pick -> style-noun pick ->
   suffix bool -> optional number draw (2 or 4 draws, fixed shape).

`annotateEtude` runs between melody and title but consumes **zero**
draws (pure scan), so it cannot shift the stream. The order is part of
the contract: reordering steps 1-3 changes every downstream etude.
Pinned by `determinism.test.ts`: a 45-case matrix (3 styles x 5
difficulties x bars {8,16,24}) generated twice and compared via
`JSON.stringify` byte equality, exact measured difficulty-monotonicity
counts on a fixed 24-seed list, and `detectFormPeriod` compatibility
(one golden seed pins period === 8 for an 8-bar etude).

## `EtudeConstraints` - null means unrestricted (REQ-ETU-1/2)

```ts
interface EtudeConstraints extends Versioned {
  styleId: StyleId; key: number;      // tonic pc 0..11
  mode: EtudeMode;                    // "major" | "minor" (tonal mode, NOT app Mode)
  difficulty: Difficulty;             // 1..5 (Phase 0 scaling)
  bars: number;                       // int 4..32; v1 meter is 4/4 only
  tempo: number | null;               // null = profile.defaultTempo
  seed: Seed;                         // uint32
  harmony: HarmonyConstraints; melody: MelodyConstraints; rhythm: RhythmConstraints;
}
```

Every nullable field means "unrestricted / profile decides"; the
booleans are never null (`false` = no forcing, the profile probability
applies):

| Field | `null` means | non-null means |
|---|---|---|
| `harmony.allowedQualities` | any quality the grammar can produce | only listed tokens survive |
| `harmony.allowedNumerals` | any numeral token | only listed tokens (full token or bare degree match) |
| `harmony.startOn` / `endOn` | no override | bar 0 forced / last bar substituted (REQ-ETU-13) |
| `melody.maxIntervalSemitones` | `profile.melody.maxLeapSemitones` | cap `min(profile, constraint)` |
| `melody.range` | profile range intersected with melody register | explicit override; if disjoint from the profile, the CONSTRAINT wins (documented user override) |
| `tempo` | `profile.defaultTempo` | exact BPM in (0, 400) |

`null` is not `[]`: an empty list is a filter that excludes everything,
which `feasibilityOf` warns about. Checked bounds (`validateEtudeConstraints`,
error paths prefixed `c.`): version === 1, `styleId` in
`shippedStyleIds()`, key 0..11, integer bars 4..32, uint32 seed,
numeral tokens must `parseNumeral` cleanly in the candidate's mode
(no cascaded errors when the mode itself is invalid).

Documented deviation: `QUALITY_TOKENS` is a 14-token SUPERSET of the
design's 8-token list (it adds the triad/alt tokens `maj`, `min`,
`dim`, `dim7`, `7alt`, `m9`) because pop/classical triads need
representation in the filter. See `docs/PHASE-3-ETUDE.md` section 5 vs
`engine/etude/types.ts`.

## validate -> feasibilityOf -> generate (the adapter flow)

```ts
declare function validateEtudeConstraints(candidate: unknown): EtudeValidation
declare function feasibilityOf(constraints: EtudeConstraints): string | null
```

`generateEtude` throws `RangeError` on two last-resort conditions:
invalid constraints, and constraints that exclude every profile
template ("constraints exclude all profile material") or make
`requireChromaticism` unsatisfiable (the guaranteed fallback token
`bVII7` filtered out; the `bII7` branch is seed-dependent - it only
applies before a tonic-family close - so `feasibilityOf` mirrors
conservatively and warns whenever `bVII7` is excluded). Slice 2's panel never lets a user reach these:
it calls `validateEtudeConstraints` for field errors, then
`feasibilityOf` - a NON-throwing mirror of the generator's failure
paths returning warning text (or `null` when generation would succeed
for EVERY seed; the invariant is pinned by a 300-seed property sweep) -
and disables impossible combos. The throw paths stay as programmer
guards and are tested directly.

## Harmony generator (REQ-ETU-10/12/13, D21)

The D21 numeral grammar (`parseNumeral(token, mode)`) is shared by the
generator, the annotator, and `Concept.exampleNumerals`: optional
`b`/`#` accidental, case-significant degree (`I..VII` upper = major
family, lower = minor, trailing `o` = diminished), suffix
`maj7` / `7` / `m7` / `7(b5)` / `alt` / `7alt` / `sus4` / `add9` /
`6` / bare. It is a strict superset
of every token in the three shipped profiles' vocabularies and
progressions (pinned: `harmony.test.ts` parses EVERY profile token in
both modes). Contradictory case+suffix (`vimaj7`, `Im7`) returns null.

`generateProgression` fills `bars` by cycling a picked template, then
applies difficulty-scaled passes (`scaleProbability(base, difficulty)`
- Phase 0 scaling, REQ-ETU-12): secondary dominants
(`secondaryDominantRate`), modal interchange (`modalInterchangeRate`,
pools major: `bVI`/`bVII7`/`iv7`, minor: `bII7`/`III7`), tritone
substitution (`reharmonizationRate`, `V7 -> bII7`), 9th extensions
(`extensionBias`), and `V7alt` alterations (`alterationBias`).
`startOn`/`endOn` bars are PROTECTED from every random pass
(REQ-ETU-13: endOn honored at every difficulty). Realization places
close voicings inside `voicing.registers.chords` and applies the drop-2
spread (2nd-from-top voice down an octave) when
`profile.voicing.style === "drop2"` - so the drop-2 pedagogy concept is
REAL in the data, not claimed in prose. Chord names use the D11
spelling rules via `spellChordName`/`spellTonic`.

## Melody generator (REQ-ETU-11/12)

Weighted interval walk over `SLOTS_PER_BAR = 8` absolute eighth-note
slots. Onsets on beats 1/3 are certain; everything else is gated by
`scaleProbability(syncopation, difficulty)` (forced 0 by
`rhythm.straightRhythmsOnly`). Interval candidates come from the
profile contour (stepwise favors [1,2], leapy favors [3,4,5,7], mixed
weights both), capped at `min(profile.maxLeapSemitones, constraint ??
24)`. Chromatic targets are gated by `chromaticism`; on-beat landings
snap to chord tones at probability `chordToneStrongBeat` (forced 1.0 by
`melody.chordTonesOnStrongBeats`). Range-boundary steps mirror
direction instead of clamping, so the interval cap survives edges; the
final note cadentially snaps to a chord tone of the last chord.
`velocity`/`strongBeat`/`syncopated` are DERIVED from the slot
(0.85 beats 1/3, 0.65 other beats, 0.75 off-beat; `strongBeat` =
`slot % 2 === 0`), never drawn. Notes are ascending by slot,
non-overlapping, `durationSlots >= 1` (all pinned by `melody.test.ts`).

## `etudeToSteps` - one step per BAR (finding 4)

```ts
interface EtudeBarStep { name: string; notes: readonly number[]; descriptions: string }
declare function etudeToSteps(etude: Etude): readonly EtudeBarStep[]
```

`paths.ts` labels one `HarmonicStep` as one BEAT
(`STEPS_PER_BAR = 4`), while the W2 audio truth (`loopWav.ts`,
`formPeriod.ts`) renders one step as one BAR. Generated etudes sit on
the audio side: **one step per bar** (an 8-bar etude = 8 steps). The
type is structurally identical to `HarmonicStep`
(`{ name, notes, descriptions }`), and the SLICE 2 ADAPTER CASTS it -
`src/lib/etudeEngine.ts` will feed the array into the existing
`setPaths`/`padPath`/`detectFormPeriod` pipeline (the engine's
`notes` are `readonly`, `HarmonicStep.notes` is mutable, so the cast
is explicit at the boundary); the engine never
imports `src/` (purity guard). `padPath` cycles the 8 steps to the 96
minimum and `detectFormPeriod` recovers the true form (pinned by the
determinism suite). `descriptions` joins that bar's annotations as
`"label: text | label: text"`, falling back to `"numeral - name"`.

## engine/pedagogy - concepts + annotations (REQ-PED-1/2/3/10/11)

`Concept` (REQ-PED-11) is Versioned plain data: `id` (kebab-case),
`title`, `category`, `definition` (<= 160 chars), `body` (1-3 ASCII
paragraphs), `references`, `related` (must resolve), `exampleNumerals`
(D21 tokens, parse in BOTH modes - pinned by `concepts.test.ts`). The
registry ships exactly the 8 concepts REQ-PED-10 enumerates, in PRD
order (`CONCEPT_IDS`):

| id | category | id | category |
|---|---|---|---|
| `ii-v-i` | harmony | `voice-leading` | voice-leading |
| `tritone-sub` | harmony | `drop-2` | harmony |
| `secondary-dominant` | harmony | `cadence` | form |
| `modal-interchange` | harmony | `axis-progression` | harmony |

(`melody` and `rhythm` exist in the category enum; no shipped concept
uses them yet.) `getConcept(id)` returns `null` for unknown ids and
never throws (UI-facing lookup, REQ-PED-5). Hand-curated per D17 - no
LLM pipeline; the review bar is the shape test + the truthfulness suite.

`Annotation` (REQ-PED-1/2/3): `{ id, target, label, text, conceptId,
confidence }`. `AnnotationTarget` declares all six REQ-PED-2 kinds, but
slice 1 EMITS ONLY `chord` / `progression` / `melody` - the other three
(`note`, `voicing`, `scale`) exist so slices 2/3 never need a breaking
union change (D18). Ids are deterministic ordinals
(`"ann-<detector>-<bar>"`), never rng, never clock. Detector
confidence is `1` (pattern presence is decidable); the one editorial
melody annotation carries `conceptId: null, confidence: null`.

## The truthfulness principle (D18, REQ-PED-3)

`annotateEtude(chords, melody, profile, constraints)` runs nine
detectors in fixed order (ii-V-I, tritone sub, secondary dominant,
modal interchange, cadence, voice leading, drop 2, axis, melody
editorial). A concept is linked ONLY when its pattern actually fires
in the realized data - detectors read the grammar tokens and computed
roots/voices, never prose, and there is no speculative "this style
usually has X" text. `annotate.test.ts` pins truthfulness BOTH ways:
hand-built sequences that contain each pattern emit it, and plain
diatonic material emits zero false positives (the only thing that may
fire there is voice-leading, and only because the close voicings
genuinely are smooth).

Prevention of double-claiming: a bar claimed by the tritone-sub or
secondary-dominant rule is excluded from the modal-interchange rule,
so the most specific true explanation wins - an UNRESOLVED `bII7`
(not followed by an I-family chord) correctly falls through to
modal-interchange instead.

Worked example from the slice 1 dev report: bar A9 carried a
secondary-dominant token, but a later harmony pass had re-harmonized
its target, so the realized next chord's root was no longer a fifth
below. The detector checked the DATA (`rootPc + 5 === next.rootPc`),
found the pattern absent, and emitted nothing - A9 refused its
secondary-dominant claim. The annotation layer never outlives the
generator's realized output.

Two documented threshold deviations from the design wording (both
conservative, listed in `annotate.ts`'s header): the drop-2 gap
threshold is `>= 7` (the design's `> 7` would miss the design's own
drop-2 realization, which produces exactly 7 for maj7/m7/halfdim
tetrads), and voice-leading averages nearest-tone motion PER VOICE (a
per-chord sum would sit near the threshold for every etude and prove
nothing).

## Documented PRD deviations (this phase)

Recorded here and in `CHANGELOG.md`; authority: `docs/PHASE-3-ETUDE.md`
(findings 1-2, D16).

1. **Q2 RESOLVED - VexFlow dropped** (D16). PRD REQ-ETU-21 says
   "staff notation via VexFlow"; VexFlow was never installed and is
   NOT added. abcjs (already live at 5 call sites, incl. the
   abcjs -> SVG -> jsPDF print pipeline) is retained for ALL staff
   rendering; REQ-ETU-21 is satisfied via abcjs at slice 2 (new
   `EtudeStaffView`; `LiveScoreDisplay` untouched).
2. **Tone.js premise corrected** (finding 2). PRD REQ-ETU-22 says
   "play via Tone.js"; `tone` is only a transitive dep of
   `@magenta/music` (zero `Tone.` imports in `src/`). Playback is the
   hand-rolled `audioEngine` (`src/lib/audio.ts`) driven by
   `rhythmEngine`, so REQ-ETU-22 is satisfied-in-fact by the existing
   stack; adding Tone would be dead weight.

## Purity + tests

`engine/purity.test.ts` scans every non-test source under `engine/`
(no `Math.random`/`Date.now`/`new Date`/`performance.now`/`console.`,
no boundary-crossing or UI/audio package imports). Slice 1 added
7 sources (4 etude + 3 pedagogy); the sanity floor `MIN_SCANNED_FILES`
moved 12 -> 21 in the same commit (D20) and the tree now holds exactly
21. Tests are colocated (`engine/etude/*.test.ts`,
`engine/pedagogy/*.test.ts`), run in the node env, and are invisible
to the README drift gate (which counts `it(` only in `tests/`).

## What slice 1 deliberately does NOT include

- **No UI.** No constraint panel, no piano roll, no staff view, no
  concept drawer - nothing is user-facing yet (slices 2/3, PRD
  14). The legacy `src/lib/etude.ts` Etude Assistant is untouched and
  still the only generation surface users can reach.
- **No adapter.** `etudeToSteps`'s output is not cast anywhere yet;
  `src/lib/etudeEngine.ts` arrives in slice 2.
- **No persistence/URL.** `EtudeConstraints` is the designed REQ-ETU-3
  URL payload, but no serialization ships yet.
- **No exports, no playback wiring, no practice mechanics**
  (metronome/count-in/print = slice 3; MusicXML melody voice = slice 2).
- **No new npm dependencies** (VexFlow stays out per D16; `tonal`
  stays out of `engine/`).
