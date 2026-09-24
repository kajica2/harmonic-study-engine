# PRD-001 Phase 5 Design: Explore Mode (seeded ideas + honest transforms + crossover)

Status: APPROVED DESIGN (from @architect research packet, 2026-09-24).
Implementation authority for @developer. Parent: `docs/PHASE-4-COMPOSE.md`
sketched nothing for Explore; PRD sec 8.4 + sec 8.5 + REQ-IDEA-3 are the
authority. This doc is the full Phase 5 design (engine + surface +
crossover + e2e). Read ALL of sec 1-2 before touching code.

Scope: REQ-EXP-1/2 (P0 seeds + preset chips), REQ-EXP-10 (P0
reharmonize), REQ-EXP-11 (P0 substitute), REQ-EXP-12 (P1 expand),
REQ-EXP-13 (P1 vary), REQ-EXP-14 (P2 modulate - DEFERRED, D94),
REQ-EXP-15 (P2 voice-lead - INCLUDED as a re-skin, D95), REQ-EXP-20/21/22
(P0 idea cards + Hear/Send/Save + concept-linked rationales),
REQ-IDEA-3 crossover completion (Send-to-Compose via the ChordGrid seam,
Send-to-Etude via constraints-carry, IdeaBar Send-action audit + fix).
Concepts registry has 10 ids (8 slice-1 + walking-bass/comping) - every
non-null rationale conceptId must resolve (test-pinned, D99).

Baseline (verified this round at HEAD c86258e): S4 merged, CI green.
Suite 2157 passed / 1 skipped / 2 failed (the 2 = pre-existing CSS-WIP
FormPlanner.test.tsx + FormTemplatePicker.test.tsx - do NOT fix).
`tests/` it( = 362 FROZEN. Purity floor MIN_SCANNED_FILES = 35.
check:paths 36/36. count-tunes pin 40, curatedBriefing pin 12 -
untouched by Phase 5 (Explore artifacts are runtime data, never catalog
files). engine/explore/ does NOT exist (greenfield). e2e has 6 specs
(app, compose-upload, compose-accompaniment, compose-mixer-export,
count-in, etude-composer).

Rules for every new/edited file (inherited, standing): ASCII only; no
`console.*` except warn/error (engine: fully silent); no `any`, no
`@ts-ignore`; relative imports; engine/ purity absolute (allowlist:
relative-only, no packages, no node:*, no clock, no Math.random); new
component tests auto-register via the `src/components/**/*.test.tsx`
glob in vitest.config.ts JSDOM_FILES (NO config edit); src/lib + engine
tests are node-project and drift-gate-invisible; `tests/`,
`src/lib/studies.ts`, `src/lib/theory.ts` (FROZEN, D47),
`src/lib/paths.ts`, README/SPEC/AGENTS/.kai OFF-LIMITS; the 11 dirty
components OFF-LIMITS (READ-only - sec 6 names the two that appear
inside the explore surface); App.tsx edits ONLY if ModeGate slot wiring
requires - IT DOES NOT (D98); PHASE-2-01 live-gate rule and PHASE-3-03
StrictMode one-shot rule apply to every new effect; snapshot discipline:
FILE-COPY snapshots, never `git checkout --` (PHASE-2-02); honesty rule
(PHASE-3-01 + ADR-013 + ADR-017 lineage): a technique label must
describe what was ACTUALLY computed (sec 2, D99); determinism: seeded
ops byte-identical (property-pinned, D100).

---

## 1. Re-audit (anchors verified at HEAD c86258e; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| ExploreSurface stub | src/components/ExploreSurface.tsx (120 lines, CLEAN) | Phase 1 stub, three-state in one section: (1) "Explore a seed" card with 3 chips drawn by `drawThree()` from a fixed pool of 12 (`PRESET_SEEDS`: Cmaj7, ii-V-I in C, D dorian, Fmaj7, C blues, 12-bar in A, C lydian, Dm9, Bbmaj7-A7alt, G mixolydian, Cm-Eb-Gm progression, Phrygian in E); chip click toggles `activeChip` (visual only, `aria-pressed`); honesty footer "Phase 1 ships read-only chips. Reharmonize / substitute / expand operations land in Phase 5." (2) `<FormTemplatePicker activeId={null} onPick={no-op}>` (3) `<FormPlanner plan={aaba mid-range plan}>`. Randomness (`Math.random` + mount-salt) lives in the component (adapter layer, legal). Rendered by ModeGate: `if (mode === "explore") return <ExploreSurface />` (no props). HARD CONSTRAINT: the file imports the two DIRTY components - they stay IMPORTED and RENDERED (sec 6); their files are never edited. |
| ModeGate explore slot | src/components/ModeGate.tsx, search `mode === "explore"` | Zero-prop slot (`<ExploreSurface />`). The real surface (sec 5) reads stores + singletons directly, so NO ModeGate edit and NO App.tsx edit are required (D98). AppMain slot (etude) untouched. |
| IdeaBar Send-to actions | src/components/IdeaBar.tsx, search `SEND_OPTIONS` / `handleSend` | DECORATIVE today (the audit question is answered: stubs, not wired). `SEND_OPTIONS`: compose disabled + hint "Phase 4 wires the upload surface", etude ENABLED, explore disabled + hint "Phase 5 wires idea cards". Disabled options render with " (coming soon)". `handleSend`: compose/explore arms are `console.warn` one-liners, then unconditional `requestMode(target)`. Save writes `hse.ideas` (cap 100); Share builds `?idea=<base64>` (Phase 8 note). Mint-from-step (`ideaFromChord`, transpose-aware) is the only real path. VERDICT: Phase 1 shipped the chip; S2/S3/S4 never extended it (sessionStore `DirtyMap.compose/explore` are still the literal `"none"`). D98 completes it. |
| Substitution primitives (src, NOT reusable) | src/lib/coCompose.ts, search `TECHNIQUES` | "What if?" proposer: tritone_substitution, modal_mixture, secondary_dominant, passing_diminished (+ axis_modulation, coltrane_change). Imports `theory.ts` + `PERSONAS` + `mulberry32` - engine-ILLEGAL on all three counts. Technique selection is picker-weighted, explanations are canned strings, root detection rides the DEAD-CODE `analyzeChord` path (D47 audit). VERDICT: harvest the TECHNIQUE LIST only; algorithms are clean-roomed in engine/explore/substitute.ts under the honesty predicates (D99). Do NOT import, port, or wrap coCompose.ts. |
| Chord/voicing assets (engine, reusable) | engine/core/chords.ts | `QUALITY_INTERVALS` (17 qualities), `NAME_SUFFIX`, `keyUsesFlats`, `spellChordName`, `chordQualities`, `qualityIntervals`. THE interval truth for expand (superset checks) + substitute (dominant-family membership) + seeds (grammar validation). |
| Numeral grammar (engine, reusable) | engine/etude/harmony.ts, search `parseNumeral` / `numeralInfo` | D21 grammar (`[b|#] + degree + [o] + suffix`), `MODE_OFFSETS`, `filterTemplates`, `tokenAllowed`, `generateProgression` passes 4a/4b/4c (secondary-dominant, modal-interchange, tritone V7->bII7) + pass 5 (extensions m7/maj7/dom7 -> 9ths, V7 -> V7alt). THE transform semantics Explore grounds itself in: every progression-level op in sec 4 is defined OVER this grammar + the ChordCell tables, never over prose. Draw-order precedent (harmony -> melody -> title) is the model for D100. |
| Progression templates (engine, reusable) | engine/styles/profiles/jazz.ts etc. | Per-style `harmony.progressions` (jazz: 6 templates incl. ii-V-I, rhythm changes bridges), `secondaryDominantRate`, `modalInterchangeRate`, `reharmonizationRate`, `extensionBias`, `alterationBias`. Explore does NOT consume rates directly (no style-driven generation in Phase 5 scope) but reharmonize's candidate POOL mirrors the pass-4a/4b/4c technique set so cards and etudes speak one language. |
| Voicing engine (engine, reusable as-is) | engine/compose/voicing.ts, search `voiceSequence` / `TONE_MAP` | Sequential voice-lead over `ChordCell[][]`: 5 styles (close/drop2/quartal/spread/block), rootless draws via injected Rng, register containment, `firstDrop2Bar` annotation gate. D68 draw-order contract (chords pass -> pad pass -> bass pass). VERDICT for REQ-EXP-15 (D95): RE-SKIN, not new work. Explore calls `voiceSequence` once per style with the card grid; zero new voice-leading math. |
| Chord grammar (engine, reusable) | engine/compose/chordsym.ts, search `parseChordSymbol` | `parseChordSymbol` (root + 17 suffixes + aliases, REJECT-anything-the-grid-cannot-hold), `buildCellFromSymbol(p, key)` (confidence 1, spelled via D11), `suggestChordSymbols`. THE seed tokenizer (D93) + the chart-text builder (D97): every chord string Explore touches round-trips through here or it does not ship. |
| ChordGrid shape (Phase 5 seam) | engine/compose/types.ts, search `interface ChordGrid`; engine/compose/chordchart.ts, search `THE Phase 5 seam` | `{slotsPerBar, bars: BarRegions[]}`, per-bar `slots.length` VARIES (D60/TD-043). `parseChordChart` returns THIS shape; `buildChartSession` wraps it into a synthetic NormalizedProject + ComposeAnalysis; `generateAccompaniment` consumes it unchanged. VERIFIED IDENTITY: the Explore->Compose handoff feeds the SAME shape with NO adapter (D97 dogfoods `parseChordChart` + `buildChartSession` directly). |
| Handoff shapes | engine/core/idea.ts; engine/etude/types.ts | `Idea` discriminated union (chord/progression/scale/melody/seed, exactly one slot, CanonicalId + InstanceId, `isIdea` guard, `ideaFromChord`). Etude side: `EtudeConstraints` (styleId/key/mode/difficulty/bars/tempo/seed/harmony/melody/rhythm) + `validateEtudeConstraints` + `generateEtude` (harmony -> melody -> title draw order). MISMATCH FOUND (shapes the D97 decision): Explore progressions are CHORD SYMBOLS ("Dm7"), Etude progressions are NUMERALS ("ii7"). No literal transplant exists; Send-to-Etude is a constraints-carry (key/mode/bars/seed), honestly labeled. |
| Concepts registry | engine/pedagogy/concepts.ts, search `CONCEPT_IDS` | 10 ids in order: ii-v-i, tritone-sub, secondary-dominant, modal-interchange, voice-leading, drop-2, cadence, axis-progression, walking-bass, comping. `getConcept(id)` null-safe; `related` resolve pinned; `exampleNumerals` parse in D21. REQ-EXP-22 "where possible" = null is legal; non-null MUST resolve (D99 pins it). |
| Truthfulness precedent | engine/pedagogy/annotate.ts | 9 truthful detectors over DATA (never prose): ii-V-I triples, tritone bII7-down-semitone-to-tonic, secondary-dominant root+5==next, modal-interchange residual, cadence, voice-leading mean<=4, drop-2 gap>=7, axis thirds/tritone-pair. D99 reuses THESE predicates (ported to ChordCell with an equivalence test, D47 pattern) - the honesty lineage is mechanical, not aspirational. |
| Audio: compose recipes + preview singleton | src/lib/composeVoices.ts (`VOICE_RECIPES`, `scheduleComposeNote`, `voiceEnvelopeTimes`); src/lib/composePreview.ts (`renderAccompaniment`, `composePreviewPlayer` singleton, `mapOriginalTracks`, `computeGroupGains`) | Recipes are `BaseAudioContext`-typed (offline AND live). The player is a MODULE SINGLETON (idle->rendering->playing, StrictMode-safe, jsdom-pure math tested, render path browser-pinned). Etude-side playback is practice-rail `audioEngine.playNote` (single voice, melodyBus) + scalePlayer/rhythmDrill sequencing precedent. VERDICT for Hear (D96): reuse, no fork - Hear renders the card progression through `renderAccompaniment` + the EXISTING singleton (transient synthetic project+result, chords role only). No new AudioContext, no new transport, no audioEngine coupling (single-voice bus would arpeggiate block chords - rejected with reason). |
| Melody vary primitives | engine/etude/melody.ts (`SLOTS_PER_BAR`, interval candidates, chord-tone gates) | Weighted interval walk over the 8-slot grid - a GENERATOR, not a transformer. REQ-EXP-13 needs TRANSFORMS over an existing line (displacement/inversion/retrograde/ornamentation). Nothing reusable except the range/contour tables; vary is new pure integer math in engine/explore/vary.ts (D93). Idea.melody is pitch-only (`readonly number[]`), so displacement is honestly a rotation (documented limitation + TD, not a label lie). |
| e2e convention | e2e/compose-mixer-export.spec.ts (D92); e2e/compose-accompaniment.spec.ts | In-spec fixture bytes via createRequire (@tonejs/midi + midi-file), served dist on :4173 (`npm run build` first), NODE-side assertions, discriminative legs (each fails if its mechanism is removed), download via `waitForEvent("download")` with documented fallback, existing specs survive UNEDITED. Explore earns ONE spec (sec 7): seed -> cards -> Send-to-Compose lands in the chart grid (the browser leg), plus Hear state-machine + Send-to-Etude constraint landing + a truthfulness spot. |
| Dirty-11 collision map | git status (verified this round) | Staged M (GIT-001 incident residue, committed shape intact): ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker, InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer, PracticeSetBrowser, StylePackPicker. Phase 5 collides with NONE as edited files (sec 6): FormPlanner + FormTemplatePicker appear INSIDE the explore surface as today (imports + render preserved, files never opened for edit). |
| Gate floors | vitest.config.ts; assets/check-links.cjs | JSDOM glob `src/components/**/*.test.tsx` present (new component tests need NO config edit). check-links counts it( in tests/ ONLY (362 FROZEN - untouched; src/lib + engine + component tests invisible). docs/ not scanned. `npm run build` = two configs; new files ride both. |

Findings (new, this audit): F10: coCompose.ts is technique-list-only reuse (its picker + explanations + analyzeChord root path fail the honesty bar - clean-room required). F11: ChordGrid identity is exact (no adapter; the handoff dogfoods the chart parser). F12: symbol-vs-numeral mismatch kills literal progression transplant to Etude (constraints-carry is the honest design). F13: Hear via audioEngine would misvoice block chords (single-voice bus); the compose recipe table is the polyphonic truth. F14: IdeaBar Send-to is decorative (disabled flags + warn stubs) - completion is small and fully specified in D98. F15: ExploreSurface randomness is adapter-local (legal); engine seeds are Rng-injected (D100) - the two must never be confused.

---

## 2. Decisions (D93..D101, continuing the Phase 4 numbering)

### D93 (SEEDS): free-text parses through the ONE grammar; scale/interval have hand-rolled parsers; presets are pinned.

`engine/explore/seeds.ts`: `parseExploreSeed(raw): ExploreSeed`
(kind chord | progression | scale | interval | free + normalized
payload). Resolution order (deterministic, tested): (1) whole-string
`parseChordSymbol` -> chord; (2) whitespace-split, every token
`parseChordSymbol` (2+ tokens) -> progression; (3) scale grammar
(`ROOT + mode-name`: dorian/phrygian/lydian/mixolydian/aeolian/ionian/
locrian + major/minor/blues/chromatic aliases, case-insensitive,
"in C"/"C blues" orders both accepted) -> scale {rootPc, modeName};
(4) interval grammar (`m2/M2/m3/M3/P4/P5/m6/M6/m7/M7/oct`, optional
trailing "up/down") -> interval {semitones}; (5) else free {text}
(free cards offer the 3 preset chips + "try Cmaj7" - never an error
arm; the surface never shows a dead end). `EXPLORE_PRESETS` (the 12
stub strings) each MUST parse to a non-free kind (test-pinned; the
"Bbmaj7-A7alt" hyphen form normalizes hyphen->space first - documented).
Seed->ops matrix (surface renders ONLY applicable op buttons):
chord -> substitute + expand (+ voicelead when 2+ chords? no: single
chord voices as one bar); progression -> reharmonize + per-chord
substitute + voicelead; scale -> harmonize-scale cards (diatonic triads
i-iv-v + a modal-interchange tint, via D21 tokens realized through
core/chords - the scale seed's honest op set) + voicelead; interval ->
transpose-the-seed cards (up a fifth, down a semitone - honest,
conceptId null) + voicelead; free -> preset chips only.
Confidence: HIGH.

### D94 (P2 MODULATE - DEFERRED with rationale + stub seam): REQ-EXP-14 does NOT ship.

Rationale: (1) No primitive exists - neither harmony engine plans
pivot chords (etude passes are intra-key; compose inference is
mono-key); a 2-bar bridge that is not a pivot is a key-change CLAIM
without analysis, violating the honesty lineage. (2) P2 by PRD rank;
the P0/P1 set already fills the 2-week nominal. (3) The honest bridge
needs dual-key numeral contexts (V-of-new-key + pivot detection),
which is a design of its own, not a flag. Ship:
`engine/explore/modulate.ts` with `planModulation(from, to)` returning
the error arm `{ok:false, error:{code:"unsupported", message:
"modulation bridges land as a fast-follow (TD-EXP-MOD); reharmonize
toward the new tonic meanwhile"}}` + TD-EXP-MOD recording the dual-key
design sketch (pivot via shared diatonic + V/new-key confirmation).
The surface shows NO Modulate button (no promise made). Confidence: HIGH.

### D95 (P2 VOICE-LEAD - INCLUDED as a re-skin): REQ-EXP-15 ships with zero new voice-leading math.

`engine/explore/voicelead.ts`: `voiceLeadOptions(cells, profile,
register, rng)` calls `voiceSequence` once per VoicingStyle in fixed
order [close, drop2, quartal, spread, block] (draw-order pinned, D100)
and returns the 5 options + `firstDrop2Bar` passthrough (the drop-2
annotation gate reads the REALIZED flag, never re-derives - D74
lineage). Profile = the session's current StyleProfile (or jazz
default); register = style chords register. Cards label the style
honestly ("Drop 2 (realized, bar 0)") with conceptId voice-leading or
drop-2 ONLY when the realized data satisfies the annotate.ts predicates
(mean motion <= 4 / gap >= 7 + lower-three <= 12 - recomputed on the
realized pitches, not the style name). A style name is never a claim.
Confidence: HIGH.

### D96 (HEAR - reuse, no fork): card chords render through the EXISTING compose preview singleton.

`src/lib/exploreHear.ts` (adapter, the ONLY audio-touching new file):
`cardToHearInput(card, key)` (PURE, node-tested) builds a transient
synthetic project (ppq 480, single 4/4 tempo 120, endTick from card
bars) + a transient AccompanimentResult (chords role only, voicings via
`voiceSequence` close style, ticks via the same slot->tick tiling the
accompany pipeline uses) then `hearIdeaCard` calls the EXISTING
`renderAccompaniment(input) + composePreviewPlayer.play(buffer)`.
The singleton state machine (rendering->playing->idle) is reused
byte-identically (S3/S4 tests survive; the Hear button mirrors the
panel preview `data-preview` pattern). No new AudioContext, no new
transport, no audioEngine coupling (F13), no OfflineAudioContext in
unit tests (pure builder only; render path browser-pinned via e2e leg
+ manual, loopWav precedent). Melody-carrying cards voice the melody
as the `lead` recipe on top (D78/D90 mapping, same call). Cap: card
progressions are < 90s by construction - the preview cap never bites
(no truncation label needed; assert it in the builder test).
Rejected: sequencing `audioEngine.playNote` (single-voice bus
misvoices block chords); a new explorePreview singleton (second ctx
lifecycle for zero gain); deferring Hear (P0 action, REQ-EXP-21).
Confidence: HIGH.

### D97 (SEND-TO-COMPOSE - the documented seam, zero adapter): progression -> chart TEXT -> the S4 parser.

`progressionToChartText(progression, key)` (engine, pure): emits
`{key: X}` when key non-null + space-joined symbols (rests as `-`,
splits preserved per bar via `/`). The surface then calls the EXISTING
`parseChordChart(text)` + `buildChartSession(chart)` + `setComposeChart`
+ `requestMode("compose")` - the identical commit path the paste panel
uses (D83/D84). The grid is the grid (F11); no mapping function, no
shape translation, round-trip test pins
progression -> text -> grid -> progression-symbols equality (modulo
spelling family). Single-chord cards become 1-bar charts (legal).
Chart sessions land with the honest chart-only mixer row + summary card
(D84, unchanged). Confidence: HIGH.

### D98 (STORE PLACEMENT + SEND-ACTION COMPLETION): no store change; IdeaBar options enabled with real handlers.

Store: explore session state (seed text, parsed seed, cards, selected
card, vary input, history index) lives in ExploreSurface LOCAL state
(transient, PRD 10.4) + `useHistory`-style index for back navigation.
NO zustand change, NO session version bump (stays 4), NO migration,
`DirtyMap.explore` stays the literal `"none"` (exploration is
discardable; persistence is explicit via Save -> `hse.ideas`, ADR-007
intact). Rationale: Explore has no file identity to restore and no PRD
URL contract beyond `?idea=` (already shipped); persisting card history
would brawl with the 30MB-averse partialize design for zero
requirement. (If a future slice wants `?explore=` deep links, the D86
pattern carries seed text without store change - noted, not built.)

IdeaBar completion (the F14 fix, small): remove both `disabled` flags
(keep etude enabled); handlers: Send-to-Compose: Idea with
chord/progression -> chart-text path (D97) + `requestMode("compose")`;
scale/melody/seed kinds -> honest `console.warn` ("only
chord/progression ideas transplant literally") + still `requestMode`
(the surface boots from currentIdea - never a dead end).
Send-to-Etude: chord/progression/scale -> `cardToEtudeConstraints`
(D97b below) + `setEtudeConstraints` (NOT acceptEtude - no dirty; the
user presses Generate in Etude) + `requestMode("etude")`; melody ->
same with bars derived from melody length; seed -> key/mode defaults +
seed carry. Send-to-Explore: `requestMode("explore")` only (currentIdea
is already the carrier; the surface boots its seed from it -
ideaToSeedText: chord -> raw chord, progression -> joined, scale ->
raw scale, melody -> vary input, seed -> preset index). All three
options stay enabled whenever an idea exists (existing `disabled={!idea}`
gate unchanged). Confidence: HIGH.

D97b (SEND-TO-ETUDE semantics - the F12 consequence): `cardToEtudeConstraints(card, base)` carries key (card key or base key), mode (base mode), bars (card progression length clamped 4..32, else base bars), seed (hash of card id - deterministic, not clock), styleId (base styleId), harmony/melody/rhythm (base advanced constraints, untouched). It does NOT transplant chord symbols as numerals (unsound across grammars). The Etude surface label reads "Practice in this key (N bars)" - the honesty string (not "Practice these chords"). A literal symbol->numeral bridge is TD-EXP-LITERAL (fast-follow, needs key-relative numeral analysis). Confidence: HIGH.

### D99 (HONESTY - mechanical, lineage PHASE-3-01 + ADR-013 + ADR-017): predicates ported, equivalence-pinned, nulls allowed.

Technique tokens: tritone-sub, secondary-dominant, modal-interchange,
passing-diminished, extension, alteration, displacement, inversion,
retrograde, ornamentation, voice-leading, drop-2, original. Label rules
(ported from annotate.ts to ChordCell, same arithmetic): tritone-sub
ONLY when candidate root == mod12(orig+6) AND candidate quality in
{dom7, dom9, alt} AND next exists AND next.rootPc ==
mod12(candidate.rootPc-1) AND next is tonic-family (major: maj/maj7/
maj9/maj6/majadd9 on tonic pc; minor: min/m7/min9/min6/minadd9 on tonic
pc); secondary-dominant ONLY when candidate dominant AND
mod12(candidate.rootPc+5) == next.rootPc AND candidate degree != V;
modal-interchange ONLY when candidate root non-diatonic AND not claimed
by the two rules above (residual, annotate rule-4 precedence);
passing-diminished ONLY when candidate quality in {dim, dim7} AND root
is a chromatic step between orig and next roots; extension ONLY when
candidate pcs superset orig pcs mod12 with same root; alteration ONLY
when dom7 -> alt with same root. Voice-leading/drop-2 conceptIds ONLY
when the REALIZED pitches satisfy mean<=4 / gap>=7 rules (D95).
`engine/explore/truthfulness.test.ts` (name: honesty suite) pins the
NEGATIVES: flat-12pc fixture -> no tritone-sub label anywhere; V-I
without bII7 -> no tritone-sub; non-fifth dominant -> no
secondary-dominant; diatonic candidate -> no modal-interchange;
triad->triad -> no extension. `cards.test.ts` pins every non-null
conceptId resolves via `getConcept` (10-id registry). Equivalence:
`substitute.test.ts` translates annotate.ts golden fixtures
(EtudeChord -> ChordCell) and pins identical claim/no-claim outcomes
(D47 pattern). Confidence: HIGH.

### D100 (DETERMINISM): one Rng per op call, fixed draw order, hash ids, clock as parameter.

Every seeded op takes `rng: Rng` (caller `createRng(seed)`; seed =
session seed input, default from the seed text hash - `hashSeed`).
Draw order (part of the contract, pinned by `determinism.test.ts`
double-run byte-equality + 300-seed property sweep, assemble.ts
precedent): reharmonize bars ascending, per-bar candidate pick
(`rng.pick` over the substitute list); voicelead styles in D95 order;
vary ornamentation gaps ascending (`rng.bool` per gap); title/label
suffixes NEVER draw (ids are `hashSeed(seed|op|index)` strings, not
rng). No `Date.now`/`Math.random` in engine (purity guard enforces);
`cardToIdea` takes `nowMs` as a parameter (ADR-005). Grid fingerprint
(`gridFingerprint` over rootPc.qualitySymbol[/bassPc]) dedups
reharmonize alternatives (identical progressions never ship as distinct
cards). Confidence: HIGH.

### D101 (SLICE MAP - single pipeline RECOMMENDED; cut line explicit if split is forced).

RECOMMENDED: ONE slice (this doc). The ops share the card envelope +
honesty harness + crossover adapters; splitting strands either the
engine without a surface or a surface without ops, and the total fits
the PRD 2-week nominal (engine 4-6 dev-days, surface + Hear + crossover
1 week, e2e + gates 2 days). IF team capacity forces a split, the cut
line is: Slice A = engine/explore/ (sec 4) + purity floor + ALL engine
tests (zero UI, shippable, unblocks everything); Slice B = surface +
Hear + crossover + e2e (sec 5-7). Slice A MUST NOT include the modulate
stub alone without substitute (predicates are the shared asset). No
three-slice option (cards without ops is not shippable).
Confidence: HIGH.

---

## 3. engine/explore/ module design (copyable signatures)

All files: ASCII, silent, relative-only imports, Rng-injected,
Outcome-armed parsers (never throw into UI). Engine may import from
../core/*, ../compose/types (Outcome, ChordGrid, ChordCell, KeyCandidate),
../compose/chordsym, ../etude/harmony (numeralInfo/parseNumeral -
type-only + pure fns, no cycle: harmony imports etude/types type-only),
../pedagogy/concepts (getConcept - data lookup, no cycle),
../styles/* (types + index lookups). No tonal, no @tonejs/midi, no Date.

### engine/explore/types.ts (NEW)

```ts
import type { Versioned } from "../core/versioned";
import type { KeyCandidate } from "../compose/types";

export type ExploreSeedKind = "chord" | "progression" | "scale" | "interval" | "free";
export interface ExploreSeed {
  readonly kind: ExploreSeedKind;
  readonly raw: string;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: { readonly rootPc: number; readonly modeName: string } | null;
  readonly interval: { readonly semitones: number; readonly direction: "up" | "down" } | null;
}
export type ExploreOp = "reharmonize" | "substitute" | "expand" | "vary" | "voicelead";
export type TechniqueToken =
  | "tritone-sub" | "secondary-dominant" | "modal-interchange"
  | "passing-diminished" | "extension" | "alteration" | "displacement"
  | "inversion" | "retrograde" | "ornamentation" | "voice-leading"
  | "drop-2" | "diatonic-neighbor" | "original";
export interface IdeaCard extends Versioned { // version: 1
  readonly id: string; // "exp-<op>-<base36hash>" (hashSeed, D100)
  readonly op: ExploreOp;
  readonly label: string; // <= 40 chars (test-pinned)
  readonly description: string; // 1-2 sentences
  readonly rationale: string; // 1-3 sentences, technique-truthful (D99)
  readonly conceptId: string | null; // resolves via getConcept when non-null
  readonly technique: TechniqueToken;
  readonly progression: readonly string[] | null;
  readonly chord: string | null;
  readonly melody: readonly number[] | null;
  readonly sourceSeedRaw: string;
}
export function isSoundingSymbol(s: string): boolean; // shared "-" rest check
export function cardId(seedRaw: string, op: ExploreOp, index: number): string;
```

### engine/explore/seeds.ts (NEW)

```ts
import type { ExploreSeed } from "./types";
export const EXPLORE_PRESETS: readonly string[]; // the 12 stub strings, verbatim
export function parseExploreSeed(raw: string): ExploreSeed; // D93 order; never throws (free fallback)
export function ideaToSeedText(idea: { kind: string; chord: string | null; progression: readonly string[] | null; scale: string | null; melody: readonly number[] | null; seed: number | null }): string; // D98 carrier
```

Scale grammar table (modeName normalized lowercase): ionian/major,
dorian, phrygian, lydian, mixolydian, aeolian/minor, locrian, blues,
chromatic, major-pent/minor-pent. Root via the chordsym ROOT_PC table
(re-exported helper - no duplication). Interval grammar:
`^(m2|M2|m3|M3|P4|P5|m6|M6|m7|M7|oct)(_(up|down))?$` + space form
("P5 up"). Semitone map pinned by test.

### engine/explore/substitute.ts (NEW - the honesty core)

```ts
import type { Rng } from "../core/rng";
import type { ChordCell, KeyCandidate } from "../compose/types";
import type { SubstituteCandidate } from "./types-sub-or-types";
export interface SubstituteCandidate {
  readonly cell: ChordCell;
  readonly technique: TechniqueToken;
  readonly rationale: string;
  readonly conceptId: string | null;
}
export function substituteChord(
  cell: ChordCell,
  ctx: { readonly next: ChordCell | null; readonly key: KeyCandidate },
): readonly SubstituteCandidate[];
// Predicates per D99 (order: tritone -> secdom -> passing-dim -> modal -> neighbor).
// Returns [] for rests / unknown qualities (honest: nothing to substitute).
// The ORIGINAL cell is never in the output (callers add the "keep" card themselves).
```

Candidate construction (each via `buildCellFromSymbol` with the ctx
key so spelling is D11-correct): tritone root+6 (dominant qualities
present in the 17-table only); secdom V-of-next (root = mod12(next.root+7),
quality dom7); modal pool (bVI/bVII7/iv7 in major, bII7/III7 in minor -
the etude pass-4b pools, realized as CELLS not numerals); passing-dim
(#I dim7 between I and ii shape, generalized: root = chromatic step,
quality dim7); neighbor (diatonic third-away, conceptId null).
Rationale strings name the ACTUAL intervals
("Db7 shares G7's 3rd/7th tritone (B-F) and steps down to C").

### engine/explore/reharmonize.ts (NEW)

```ts
import type { Rng } from "../core/rng";
export function reharmonizeProgression(
  cells: readonly ChordCell[],
  key: KeyCandidate,
  rng: Rng,
  count: number, // N alternatives, clamped 1..6
): readonly (readonly SubstituteCandidate[])[];
// Per-bar substituteChord (next = cells[i+1] ?? null), rng.pick per bar
// (bars ascending, D100); unchanged bars carry
// {cell: original, technique: "original", conceptId: null}.
// Alternatives differing in zero bars are re-drawn (bounded 8 tries,
// then the distinct prefix ships - never duplicates, fingerprint-pinned).
```

### engine/explore/expand.ts (NEW)

```ts
export function expandChord(cell: ChordCell, key: KeyCandidate): readonly SubstituteCandidate[];
// Superset map over the 17-table (D99): maj->[maj7,maj9,maj6,majadd9];
// min->[m7,min9,min6,minadd9]; m7->[min9]; maj7->[maj9]; dom7->[dom9,alt];
// halfdim/dim7/sus4/maj6-family -> [] (honest: nothing wider in-table).
// technique "extension" (added 9th/6th) vs "alteration" (dom7->alt only).
// conceptId: null (no registry concept covers extensions - "where possible"
// allows it; the rationale says so plainly).
```

### engine/explore/vary.ts (NEW)

```ts
export type VaryKind = "displacement" | "inversion" | "retrograde" | "ornamentation";
export function varyMelody(notes: readonly number[], kind: VaryKind, rng: Rng): readonly number[];
// retrograde: reverse. inversion: 2*notes[0]-n (clamped 0..127, out-of-range
// folds by octave, counted in the rationale). displacement: rotate left by
// k = 1 + rng.int(len-1) (documented pitch-rotation stand-in for rhythmic
// displacement on the pitch-only Idea shape + TD-EXP-SLOT for EtudeNote
// slot-grid displacement). ornamentation: per-gap rng.bool(0.5) insert of
// the chromatic passing tone when |gap| > 2 (cap 2x length, clamp 0..127).
// Empty/singleton input -> [..input] (no-op, never throws).
```

### engine/explore/voicelead.ts (NEW, D95 re-skin)

```ts
import type { StyleProfile } from "../styles/types";
import type { MidiRange } from "../styles/types";
export function voiceLeadOptions(
  cells: readonly ChordCell[],
  profile: StyleProfile,
  register: MidiRange,
  rng: Rng,
): Readonly<Record<string, readonly (readonly number[] | null)[]>>;
// Keys: the 5 VoicingStyles in fixed order. Each = voiceSequence({cells:
// [cells], profile: {...profile, voicing: {...profile.voicing, style}},
// rng, allowRootless: style!=="block", register}).voicings[0].
// rng stream shared sequentially (D100). Returns raw pitch arrays; the
// cards layer computes the concept gates on them.
```

### engine/explore/cards.ts (NEW - envelope + crossover pure helpers)

```ts
import type { EtudeConstraints } from "../etude/types";
export function buildIdeaCards(
  seedRaw: string,
  op: ExploreOp,
  items: readonly { label: string; description: string; rationale: string; conceptId: string | null; technique: TechniqueToken; progression: readonly string[] | null; chord: string | null; melody: readonly number[] | null }[],
): readonly IdeaCard[]; // ids via cardId, version 1, label-length enforced
export function progressionToChartText(progression: readonly string[], key: KeyCandidate | null): string; // D97
export function cardToEtudeConstraints(card: IdeaCard, base: EtudeConstraints): EtudeConstraints; // D97b (validateEtudeConstraints-passing, test-pinned)
export function cardToIdeaArgs(card: IdeaCard): { kind: string; payload: unknown }; // surface feeds ideaFromChord/idea builders + nowMs
```

### engine/explore/modulate.ts (NEW - deferred stub, D94)

```ts
import type { KeyCandidate, Outcome } from "../compose/types";
export function planModulation(from: KeyCandidate, to: KeyCandidate): Outcome<readonly string[]>;
 // ALWAYS {ok:false, error:{code:"unsupported", message:"modulation bridges land as a fast-follow (TD-EXP-MOD); reharmonize toward the new tonic meanwhile"}}.
```

---

## 4. Component API sketches (UI)

All components: ASCII, no `console.*` except warn/error paths, no `any`.
Props-only (read nothing from stores except ExploreSurface, which owns
session bridging). StrictMode one-shot on every mount effect
(PHASE-3-03); live-gate every audible trigger (PHASE-2-01: AudioContext
resume inside the click handler, never in an effect).

```
src/components/SeedPicker.tsx (NEW; first-entry + preset chips)
  props: {
    value: string;
    onChange: (text: string) => void;
    onCommit: (seed: ExploreSeed) => void;   // parsed via parseExploreSeed
    presets?: readonly string[];             // default EXPLORE_PRESETS slice(3)
    autoFocus?: boolean;
  }
  // kind tabs (chord/progression/scale/interval/free) are FILTER hints:
  // selecting a tab fills an example placeholder, never constrains the
  // parser (the parser is authoritative - D93). Commits on Enter/chip.
  // data-testid: seed-input, seed-chip-<i>, seed-kind-<kind>.

src/components/IdeaCard.tsx (NEW; REQ-EXP-20/21/22)
  props: {
    card: IdeaCard;
    hearState: "idle" | "rendering" | "playing";  // singleton mirror (D96)
    onHear: (card: IdeaCard) => void;
    onSendToCompose: (card: IdeaCard) => void;    // progression-bearing only (else disabled + title)
    onSendToEtude: (card: IdeaCard) => void;
    onSave: (card: IdeaCard) => void;             // setCurrentIdea(cardToIdea) + saveCurrentIdea
    conceptTitle: string | null;                  // resolved via getConcept (drawer link)
    onOpenConcept: (conceptId: string) => void;   // ConceptDrawer existing
  }
  // layout: label (h3) + technique chip + description + rationale
  // (concept link inline when conceptId) + action row
  // [Hear][Send to Compose][Send to Etude][Save].
  // data-testid: idea-card-<card.id>, hear-<id>, send-compose-<id>, send-etude-<id>, save-<id>.

src/components/ExploreSurface.tsx (EDIT; real surface, keeps Form* imports)
  // LOCAL state only (D98): seedText, seed: ExploreSeed | null,
  // cards: readonly IdeaCard[], selectedId, varyMelody: readonly number[] | null,
  // history: {seedText, cards}[] + historyIndex (back/forward, cap 20).
  // Boot: currentIdea present + no local seed -> ideaToSeedText -> parse -> run default op.
  // Ops wiring: chord seed -> substitute+expand cards; progression -> reharmonize(N=3)
  // + per-chord substitute (first chord) + voicelead options (5 style cards);
  // scale -> harmonize-scale cards + voicelead; interval -> transpose cards + voicelead;
  // free -> preset chips (no cards, empty-state copy).
  // Hear: hearState from composePreviewPlayer.subscribe (one subscription, StrictMode-safe);
  // onHear -> hearIdeaCard(card, key) (D96; live-gated).
  // Crossover: onSendToCompose -> progressionToChartText -> parseChordChart ->
  //   buildChartSession -> setComposeChart + requestMode("compose").
  //   onSendToEtude -> cardToEtudeConstraints(card, etudeConstraints ?? defaults) ->
  //   setEtudeConstraints + requestMode("etude").
  //   onSave -> cardToIdeaArgs + setCurrentIdea + saveCurrentIdea (dirty clears per ADR-007).
  // Renders: SeedPicker + op buttons + cards grid (IdeaCard list) + vary panel
  // (when melody present) + the EXISTING FormTemplatePicker + FormPlanner
  // (unchanged props, below the grid - dirty files never edited).
  // data-testid: explore-seed, explore-cards, explore-empty.

src/lib/exploreHear.ts (NEW adapter; ONLY audio-touching new file)
  export function cardToHearInput(card: IdeaCard, key: KeyCandidate):
    { project: NormalizedProject; result: AccompanimentResult };  // PURE, node-tested
  export async function hearIdeaCard(card: IdeaCard, key: KeyCandidate): Promise<void>;
  // builds input -> renderAccompaniment -> composePreviewPlayer.play (D96).
  // Cap assert: input duration < PREVIEW_CAP_SEC (test-pinned, never truncates).

src/components/IdeaBar.tsx (EDIT; D98 completion, ~15 lines)
  // remove disabled flags on compose + explore options (hints updated:
  // compose "Send chord/progression to the chart grid", explore "Open in Explore").
  // handleSend: compose arm -> ideaToSeedText -> parseExploreSeed ->
  //   chord/progression ? chart-text path (same 4 calls as surface) : warn + requestMode;
  //   etude arm -> constraints-carry (same helper as surface) + requestMode;
  //   explore arm -> requestMode only. No other changes (Save/Share/mint untouched).
```

Key resolution for cards: surface key = merged compose/etude key when
available, else `{tonicPc: 0, mode: "major", correlation: 0}` (C major
spelling default - documented; cards spell via D11 in this key).

---

## 5. File plan + dirty-collision + purity floor

```
NEW engine/explore/types.ts
NEW engine/explore/seeds.ts
NEW engine/explore/substitute.ts
NEW engine/explore/reharmonize.ts
NEW engine/explore/expand.ts
NEW engine/explore/vary.ts
NEW engine/explore/voicelead.ts
NEW engine/explore/cards.ts
NEW engine/explore/modulate.ts            // deferred stub (D94)
NEW engine/explore/seeds.test.ts
NEW engine/explore/substitute.test.ts
NEW engine/explore/reharmonize.test.ts
NEW engine/explore/expand.test.ts
NEW engine/explore/vary.test.ts
NEW engine/explore/voicelead.test.ts
NEW engine/explore/cards.test.ts
NEW engine/explore/truthfulness.test.ts   // D99 negatives (honesty suite)
NEW engine/explore/determinism.test.ts    // D100 double-run + 300-seed sweep
EDIT engine/purity.test.ts                // MIN_SCANNED_FILES 35 -> 44 (same commit as first new source)
NEW src/components/SeedPicker.tsx
NEW src/components/IdeaCard.tsx
EDIT src/components/ExploreSurface.tsx    // real surface (keeps Form* imports/render)
EDIT src/components/IdeaBar.tsx           // D98 enablement (~15 lines)
NEW src/components/SeedPicker.test.tsx    // jsdom via existing glob (NO config edit)
NEW src/components/IdeaCard.test.tsx      // jsdom via existing glob
NEW src/lib/exploreHear.ts                // adapter (D96)
NEW src/lib/exploreHear.test.ts           // node: pure builder only (no AudioContext)
NEW e2e/explore.spec.ts                   // D92-convention browser legs (sec 7)
```

Purity floor: 35 -> 44 (9 new engine sources; tree scans 45 with the
index-file slack - same D20/D56/D91 ladder pattern, bumped in the SAME
commit as the first new engine source). No other guard change.

Dirty-collision: FormPlanner + FormTemplatePicker stay IMPORTED and
RENDERED in ExploreSurface with today's props; their files are never
opened for edit (READ-only). All other dirty-9 untouched. theory.ts,
paths.ts, studies.ts, tests/, README/SPEC/AGENTS/.kai untouched.
ModeGate + App.tsx untouched (D98 - no slot wiring required).

---

## 6. Test plan (colocated; node env unless marked jsdom; invisible to the it( drift gate)

1. `seeds.test.ts` - all 12 EXPLORE_PRESETS parse non-free
   (hyphen normalization pinned); chord/progression/scale/interval/free
   fixtures incl. "D dorian", "C blues", "P5 up", "hello world"->free;
   inner-whitespace rejection falls to free (never throws);
   ideaToSeedText round-trips for all 5 Idea kinds.
2. `substitute.test.ts` - per-technique positives (Dm7-G7-Cmaj7 in C:
   G7 yields a Db7 tritone candidate; A7 yields V-of-Dm secdom where
   applicable); annotation-fixture equivalence (EtudeChord goldens
   translated to ChordCell -> identical claim/no-claim, D47 pattern);
   rests/unknown-quality -> [].
3. `truthfulness.test.ts` (THE honesty suite, D99) - NEGATIVES:
   all-12pc flat fixture -> zero tritone-sub labels; V-I with no bII7
   present -> zero tritone-sub; dominant whose root+5 != next root ->
   zero secondary-dominant; fully-diatonic pool -> zero
   modal-interchange; triad->triad pairs -> zero extension; style-name
   without realized data -> zero voice-leading/drop-2 conceptIds.
   Each negative names the fixture + the forbidden token.
4. `reharmonize.test.ts` - N=3 alternatives on ii-V-I (each differs
   >= 1 bar, fingerprint-distinct, count clamp 1..6); empty/rests ->
   originals carried; draw-order pin (seed X run A == run B bytes).
5. `expand.test.ts` - Cmaj7 -> {Cmaj9}; Dm7 -> {Dm9}; G7 -> {G9, G7alt};
   triad Cmaj -> {Cmaj7, C6, Cadd9}; dim7/sus4 -> [] (honest empty);
   non-superset never emitted (interval-subset assertion per pair).
6. `vary.test.ts` - retrograde/inversion involutions
   (vary(vary(x)) == x); displacement rotation length-preserved +
   seeded k pin; ornamentation cap (len <= 2x) + clamp 0..127 +
   empty/singleton no-ops; 300-seed determinism spot.
7. `voicelead.test.ts` - 5 styles returned for a 4-bar grid; close
   matches a direct voiceSequence call (re-skin identity); drop-2
   flag passthrough equals voiceSequence.firstDrop2Bar; rests ->
   nulls preserved per style.
8. `cards.test.ts` - label <= 40 chars on every built card; every
   non-null conceptId resolves via getConcept (10-id pin); cardId
   stable across calls; progressionToChartText ->
   parseChordChart -> grid symbols round-trip equality (modulo
   spelling family); cardToEtudeConstraints passes
   validateEtudeConstraints on chord/progression/scale/melody cards.
9. `determinism.test.ts` - double-run byte-equality for
   reharmonize/substitute/expand/vary/voicelead on shared fixtures;
   300-seed sweep (no throw, fingerprint-distinct rate logged, never
   asserted as a count - flake-free).
10. `modulate.test.ts` - planModulation always returns the unsupported
    arm with the TD-EXP-MOD message (pins the deferral, kills silent
    success).
11. `exploreHear.test.ts` (src/lib, node) - cardToHearInput shapes:
    project ppq 480 + single tempo/meter, result chords-only (+ lead
    when melody present), duration < PREVIEW_CAP_SEC, note tuples
    tick-ascending; NO AudioContext import (guard asserts the module
    imports composePreview + voicing only).
12. Component tests (jsdom, auto-glob): SeedPicker (chip click commits
    parsed seed; Enter commits text); IdeaCard (concept link renders
    iff conceptId; progression-less card disables Send-to-Compose with
    title; Hear button mirrors hearState); ExploreSurface (seed commit
    renders cards; empty free seed shows presets, no cards;
    FormTemplatePicker + FormPlanner still render - dirty-presence pin).
13. e2e/explore.spec.ts (browser, served dist): (1) SEED->CARDS: type
    "Dm7 G7 Cmaj7" -> 3+ cards visible, each with rationale + Hear
    button. (2) SEND-TO-COMPOSE: first progression card -> Send ->
    Compose surface shows the chart summary + grid with the same
    symbols (text match). (3) HEAR: Hear -> data-preview rendering ->
    playing -> Stop -> idle (state + DOM, audio output manual - S3
    precedent). (4) SEND-TO-ETUDE: card -> Send -> Etude constraint
    panel shows the carried key/bars (honest "Practice in this key"
    copy). (5) TRUTH SPOT: seed "C F G C" (no chromatic candidates) ->
    zero DOM nodes with the tritone-sub technique chip. (6) NO-OP:
    existing compose/etude e2e specs run UNCHANGED in the full-gates
    step.
14. Purity bump + gates: floor 35->44 same-commit; then
    lint -> test (2157/1/2 baseline, 2=CSS-WIP) -> build x2 ->
    check-links 362 -> check:paths -> e2e (sec 8 checklist order).

---

## 7. Implementation checklist (developer-executable order)

```
[ ] 1. engine/explore/types.ts + seeds.ts + tests (D93; presets pin green)
[ ] 2. engine/explore/substitute.ts + truthfulness.test.ts negatives (D99 red->green)
[ ] 3. engine/explore/reharmonize.ts + expand.ts + vary.ts + voicelead.ts + modulate.ts + tests
[ ] 4. engine/explore/cards.ts (envelope + D97/D97b pure helpers) + cards.test.ts round-trips
[ ] 5. engine/explore/determinism.test.ts (double-run + 300-seed sweep green)
[ ] 6. engine/purity.test.ts floor 35 -> 44 (SAME commit as step 1's first source)
[ ] 7. src/lib/exploreHear.ts + exploreHear.test.ts (pure builder; no AudioContext in tests)
[ ] 8. src/components/SeedPicker.tsx + IdeaCard.tsx + tests (jsdom auto-glob, no config edit)
[ ] 9. src/components/ExploreSurface.tsx real surface (local state only; Form* render kept; no store/version change)
[ ] 10. src/components/IdeaBar.tsx enablement (disabled flags off; 3 real arms; warn strings honest)
[ ] 11. e2e/explore.spec.ts (5 discriminative legs; existing specs untouched)
[ ] 12. Gates: lint -> test (2157/1/2 + new, 2=CSS-WIP) -> build x2 -> check-links 362 -> check:paths -> e2e full
[ ] 13. Verify id ships: grep -o "study-" dist/assets/index-*.js unaffected (no catalog churn); grep explore chunk present
[ ] 14. Commit: feat(explore): PRD-001 phase 5 COMPLETE - <ops> + Hear + crossover + e2e <n/n>
```

---

## 8. Risks

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Symbol-vs-numeral bridge tempts a literal Etude transplant (unsound labels) | med | high | D97b forbids it by design; TD-EXP-LITERAL records the real bridge; test pins constraints-carry copy |
| Tritone/secondary labels drift from computed truth under schedule pressure | med | high | D99 predicates + truthfulness negatives + equivalence test; review gate: no technique token without its predicate call on the same data |
| Voice-lead cards claim style-names as theory (e.g. "drop 2" without the gap) | med | med | D95 gates conceptIds on realized pitches; style label copy says "(realized)" only with the flag |
| Hear singleton contention with Compose mixer playback | low | med | Singleton already stops prior sources on play (idempotent); Hear stops on unmount + on Send navigation; e2e leg 3 pins the state machine |
| Scale/interval seeds feel thin vs chord/progression (user disappointment) | med | low | D93 honest op matrices + empty-state copy ("scales harmonize; intervals transpose"); no fake depth |
| Single-slice size (2-week nominal) slips | med | med | D101 cut line is pre-authorized (engine Slice A shippable alone); no new scope without an ADR |
| Modulate deferral reads as missing P2 | low | low | D94 stub + TD-EXP-MOD + no UI promise; PRD rank P2 cited in the surface copy only if asked (no placeholder button) |
| Vary displacement honesty (rotation vs rhythmic shift) | low | med | Documented limitation in the card rationale + TD-EXP-SLOT; retrograde/inversion/ornamentation are exact |

Technical debt recorded in-round: TD-EXP-MOD (dual-key modulation
bridge), TD-EXP-LITERAL (symbol->numeral literal transplant),
TD-EXP-SLOT (slot-grid displacement over EtudeNote[]), TD-048 carried
(Space quirk, Phase 5 hygiene candidate - button-only Hear needs no key
handler change, so TD-048 stays untouched).

---

## HANDOFF TO DEVELOPER (YAML)

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-24T00:00:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-5-EXPLORE.md"
      status: complete
      size: "this document (single-slice design, 9 engine sources)"
    - name: "implementation_roadmap"
      status: complete
      tasks: 14
    - name: "adr_records"
      status: complete
      count: "D93-D101 (seeds, modulate-defer, voicelead-reskin, hear-reuse, compose-seam, store-no-change, honesty-mechanics, determinism, single-slice)"
  CONSTRAINTS:
    - technical: "engine/explore/ pure (relative-only, Rng-injected, no clock); floor 35->44 same-commit; zero non-relative imports"
    - technical: "FormPlanner/FormTemplatePicker READ-only (rendered, never edited); theory.ts/paths.ts/studies.ts/tests/README/SPEC/AGENTS/.kai off-limits; no App.tsx/ModeGate edit"
    - technical: "no new audio engine/transport; Hear reuses composePreview singleton + VOICE_RECIPES; no new AudioContext in unit tests"
    - timeline: "2-week nominal; single slice recommended; pre-authorized A/B cut line if forced"
    - resources: "1 senior dev minimum (honesty predicates + crossover need theory care)"
  DECISIONS_MADE:
    - decision: "REQ-EXP-14 modulate DEFERRED (stub + TD-EXP-MOD)"
      confidence: "HIGH"
      rationale: "no pivot primitive exists; key-change claims need analysis discipline; P2 rank"
    - decision: "REQ-EXP-15 voice-lead INCLUDED as voiceSequence re-skin (5 styles, gates on realized data)"
      confidence: "HIGH"
      rationale: "S3 engine exists; new work is zero math + honest labeling"
    - decision: "Hear via transient project+result through renderAccompaniment + existing singleton"
      confidence: "HIGH"
      rationale: "polyphonic truth is the recipe table; single-voice bus would misvoice; zero new lifecycle"
    - decision: "Explore session state local (no store change, no v5, DirtyMap.explore stays none)"
      confidence: "HIGH"
      rationale: "transient exploration; persistence is explicit Save; avoids partialize bloat"
    - decision: "Send-to-Compose dogfoods parseChordChart+buildChartSession (ChordGrid identity, no adapter)"
      confidence: "HIGH"
      rationale: "seam verified exact; round-trip test pins it"
    - decision: "Send-to-Etude is constraints-carry (key/mode/bars/seed), honestly labeled, never literal transplant"
      confidence: "HIGH"
      rationale: "symbol-vs-numeral grammars are disjoint; literal needs TD-EXP-LITERAL analysis"
    - decision: "Single pipeline (9 engine sources); optional A/B cut documented"
      confidence: "HIGH"
      rationale: "shared envelope+harness; fits nominal; split strands value"
  IMPLEMENTATION_NOTES:
    - "Start with seeds + substitute + truthfulness negatives (the load-bearing honesty core)"
    - "Port annotate.ts predicates to ChordCell with the equivalence test - do not invent new intervals"
    - "Keep Form* imports/render in ExploreSurface byte-identical (dirty-presence component test pins it)"
    - "Hear builder is pure and node-tested; render path is e2e + manual only (no OfflineAudioContext in jsdom)"
    - "Watch the slash-bass grammar (D61/D83): whole-token parse wins - Explore inherits it for free via chordsym"
  PROGRESS:
    - phases_completed: 5/5
    - total_time_spent: "research + design round"
    - retries: 0
    - quality_gates_passed: 5/5
  ESTIMATED_EFFORT:
    - implementation_hours: "60-80 (engine 24-32, surface+Hear+crossover 24-32, e2e+gates 12-16)"
    - testing_hours: "included (honesty + determinism + round-trips are the bulk)"
    - documentation_hours: "2 (TD-EXP-MOD/LITERAL/SLOT + ConceptDrawer copy check)"
  AUDIT_TRAIL:
    - timestamp: "2026-09-24T00:00:00Z"
      phase: "re-audit at HEAD c86258e (stub, IdeaBar, engines, handoffs, audio, e2e, dirty-11, gates)"
      duration: "research round"
      tools_used: "read, glob, bash (git/grep/ls)"
      errors_encountered: "none (rg absent - used grep; engine/explore absent - greenfield confirmed)"
```
