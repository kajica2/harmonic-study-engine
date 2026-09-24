# PRD-001 Phase 6 Design: Pedagogy Deepening (ear training + SRS + log + drawer global)

Status: APPROVED DESIGN (from @architect research packet, 2026-09-24).
Implementation authority for @developer. Parent: `docs/PHASE-5-EXPLORE.md`
is the process precedent (re-audit table + D-numbering + single-slice
with pre-authorized cut line); PRD sec 8.5 + sec 9.3/9.5 + Q10 are the
authority. This doc is the full Phase 6 design (engine + surface +
drawer + e2e). Read ALL of sec 1-2 before touching code.

Scope: REQ-PED-20/21 (P1 ear-training sub-mode, 7 types, seeded
generator type + difficulty 1-5 + seed), REQ-PED-22 (P1 distractors
same-pool minus answer), REQ-PED-23 (P1 enharmonic + timing tolerance),
REQ-PED-24 (P2 partial credit, melodic dictation only), REQ-PED-25
(P1 failure -> linked concept), REQ-PED-30/31/32 (P2 SRS state +
SM-2 + pedagogy.srs + due-bias), REQ-PED-40/41/42 (P1/P2 log entries
+ summary + pedagogy.log), REQ-PED-6 (P1 right-click/long-press ->
drawer, SCOPED per D103), REQ-PED-12 (P1 drawer global search in
header), REQ-PED-13 (P1 drawer Hear example + Send to Explore).
REQ-PED-7 toggle VERIFIED shipped (Etude-only, closed, D109).
REQ-PED-4 VERIFIED closed across all three modes (D110).

Baseline (verified this round at HEAD b4b6a34): Phase 5 merged, CI
green. Suite 2267 passed / 1 skipped / 2 failed (the 2 =
pre-existing CSS-WIP FormPlanner.test.tsx +
FormTemplatePicker.test.tsx - do NOT fix, do NOT touch). `tests/`
it( = 362 FROZEN. Purity floor MIN_SCANNED_FILES = 44.
check:paths 36/36. count-tunes pin 40, curatedBriefing pin 12 -
untouched by Phase 6 (ear-training artifacts are runtime data, never
catalog files). engine/ear-training/ does NOT exist (greenfield);
engine/pedagogy/ has types/concepts/annotate only (srs/log are new).
e2e has 7 specs (app, compose-upload, compose-accompaniment,
compose-mixer-export, count-in, etude-composer, explore).
Dirty-11 STAGED in the index per user instruction (sec 6 names them):
ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker,
InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog,
PracticeSessionPlayer, PracticeSetBrowser, StylePackPicker. They are
READ-only AND index-staged - double reason to never touch, never
bare-commit (GIT-001 strengthened, sec 8).

Rules for every new/edited file (inherited, standing): ASCII only; no
`console.*` except warn/error (engine: fully silent); no `any`, no
`@ts-ignore`; relative imports; engine/ purity absolute (allowlist:
relative-only, no packages, no node:*, no clock, no Math.random); new
component tests auto-register via the `src/components/**/*.test.tsx`
glob in vitest.config.ts JSDOM_FILES (NO config edit); src/lib +
engine tests are node-project and drift-gate-invisible; `tests/`,
`src/lib/studies.ts`, `src/lib/theory.ts`, `src/lib/paths.ts`,
README/SPEC/AGENTS/.kai OFF-LIMITS; the 11 dirty components
OFF-LIMITS (READ-only); App.tsx edits ONLY where sec 5 sanctions
(header search entry + etude sub-mode anchor, minimal); PHASE-2-01
live-gate rule and PHASE-3-03 StrictMode one-shot rule apply to every
new effect; PHASE-3-01 negative-fixture rule and PHASE-3-02
conservative-sound rule apply to every new detector/checker;
snapshot discipline: FILE-COPY snapshots, never `git checkout --`
(PHASE-2-02); honesty rule (PHASE-3-01 + ADR-013 + ADR-017 lineage):
drill answers checked against REAL music theory, distractor pools
never contain the answer enharmonically, SRS claims pinned, no
gamified score inflation (Q10 call, D108); determinism: seeded
prompts byte-identical (property-pinned, D100 precedent).

---

## 1. Re-audit (anchors verified at HEAD b4b6a34; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| audioEngine.playNote + buses | src/lib/audio.ts, search `playNote(` / `playChord(` / `melodyBus` / `metronomeGain` | Immediate-fire single-voice synth on the melody bus (oscillators Map keyed by midi; playChord loops playNote). NO `when` param, NO sample-accurate offset, NO sequential scheduler. The metronome rides its OWN gain -> compressor bus (REQ-PRAC-2, D33). HD soundfont branch routes through playSoundfontNote. VERDICT for ear prompts (D105): REJECT playNote-loop sequencing (setTimeout jitter + the rhythmDrill precedent bug below). The polyphonic + sequential truth is the compose recipe table + OfflineAudioContext render (D96/F13 lineage). |
| Voice recipes + preview singleton | src/lib/composeVoices.ts (`VOICE_RECIPES`, `scheduleComposeNote`, `voiceEnvelopeTimes`); src/lib/composePreview.ts (`renderAccompaniment`, `renderMixGroups`, `composePreviewPlayer` singleton, `mapOriginalTracks`, `PREVIEW_CAP_SEC`) | Recipes are BaseAudioContext-typed (offline AND live). Player is MODULE SINGLETON (idle->rendering->playing, StrictMode-safe, jsdom-pure math tested, render path browser-pinned). Explore Hear (src/lib/exploreHear.ts, `cardToHearInput` + `hearIdeaCard`) is the REUSE TEMPLATE: transient synthetic project (ppq 480, 4/4, 120bpm) + transient AccompanimentResult (chords role close-style via voiceSequence, same slot->tick tiling) + lead arm via mapOriginalTracks. VERDICT (D105): ear-training Hear reuses this byte-identically via a new earHear.ts adapter (no fork, no new AudioContext, no new transport, no audioEngine coupling). |
| Sequential-scheduling warning | src/lib/rhythmDrill.ts, search `playRhythmDrill` | Computes `when` per note but calls `audioEngine.playNote(midi)` immediately in a tight loop (all notes stack at now) with only the STOP staggered via setTimeout. This is the ANTI-PATTERN ear-training must NOT copy: sequential prompts need tick-offset rendering (transient project), not immediate-fire loops. Cited so the developer never cites this file as a reuse precedent. |
| Store v4 + session envelope | src/state/sessionStore.ts, search `CURRENT_SESSION_VERSION` / `partialize` / `DirtyMap` / `acceptEtude` | Version 4 (v1->v2 transpose slice, v2->v3 etudeConstraints, v3->v4 composeSession). partialize keeps mode/globalTranspose/exerciseTranspose/keyCycleActive/currentIdea/etudeConstraints/composeSession only; 30MB project + analysis + undo + accompaniment result are in-memory. DirtyMap.compose/explore are the literal `"none"`; only etude carries `etude-pending-accept` via acceptEtude (Generate/Reroll). VERDICT (D106): training attempts NEVER touch dirty (not composition work, ADR-007 intact); Send-to-Etude uses setEtudeConstraints (no dirty), Generate uses acceptEtude (dirty). NO store shape change, NO v5, NO migration for Phase 6 (D107). |
| Storage K registry | src/lib/storage.ts, search `export const K` / `STORAGE_KEYS` / `metronomeConfig` | K holds every persisted key; STORAGE_KEYS registers shape + since-version; metronomeConfig pattern is the drift-guard precedent (K-entry + registry row + normalize helper + test pin). hse.session + hse.ideas are the zustand/idea precedents; hse.performance.log.v1 (performanceLog.ts) is the versioned-log precedent. VERDICT (D107): pedagogy.srs + pedagogy.log are NEW localStorage keys OUTSIDE the zustand envelope (idea-library pattern), so NO session bump. Each gets K-entry + STORAGE_KEYS row + normalize/load helper + cap (SRS: 10 concepts bounded; log: cap 500, summary reads last 30d). |
| Etude surface anatomy (sub-mode anchor) | src/App.tsx, search `EtudeComposerPanel` / `EtudeViews` / `etudePathId` / `activeEtude`; src/components/EtudeComposerPanel.tsx (CLEAN); src/components/EtudeViews.tsx (CLEAN); src/components/ModeGate.tsx, search `mode === "etude"` | AppMain (etude slot) renders EtudeComposerPanel (constraint draft local, committed prop, Generate/Reroll -> acceptEtude) then EtudeViews (roll/staff tabs + margin chips + About + local drawerConceptId) gated on `activeEtude && path.id === etudePathId(activeEtude)`. ModeGate etude slot returns AppMain unchanged (no props). VERDICT (D104): sub-mode anchor is a SECTION below EtudeComposerPanel and above EtudeViews (not a tab, not a sub-route, no ModeGate edit, no URL contract). Training attempts are NOT dirty work (D106). |
| ConceptDrawer current API | src/components/ConceptDrawer.tsx, search `ConceptDrawerProps` / `REQ-PED-13 FOOTER SLOT` | Props `{conceptId: string; onClose: () => void}`; internal shown-state + key-prop remount; references render branch (dormant, all null); related chips; REQ-PED-13 footer slot COMMENTED but unbuilt. Hosts (all key-prop pattern): EtudeViews (local drawerConceptId), AnalysisCard (local + highlightRange), AccompanimentPanel (local), ExploreSurface (conceptOpen). VERDICT (D111/D112): footer lands HERE (Hear example + Send to Explore buttons); global search lands in App header with an App-level host (sec 4); existing local hosts stay untouched (no refactor). |
| Concept registry + exampleNumerals | engine/pedagogy/concepts.ts, search `CONCEPT_IDS` / `exampleNumerals`; engine/pedagogy/types.ts, search `exampleNumerals` | 10 ids in order: ii-v-i, tritone-sub, secondary-dominant, modal-interchange, voice-leading, drop-2, cadence, axis-progression, walking-bass, comping. Every concept has non-null exampleNumerals parsing in the D21 grammar (test-pinned); references are null for all 10 (TD-037 dormant refs, honest - no placeholder URLs). VERDICT (D112): Hear-an-example realizes exampleNumerals (1 bar per numeral, C-major default, close voicing) via the earHear transient path. No hand-authored note sets. Null-exampleNumerals disables Hear with a title (defensive, never fires today). |
| PED-6 host audit (twice-deferred) | src/components/AnalysisCard.tsx (CLEAN, search `chord-cell-` / `annotation-chip-`); src/components/AccompanimentPanel.tsx (CLEAN, search `drawerConceptId`); src/components/ComposerChartViewer.tsx (CLEAN, search `bar.roman`); src/components/ChordInspector.tsx (DIRTY, search `Roman`); src/components/MelodyLane.tsx (CLEAN but `onContextMenu` = nudge-down, NOT a concept gesture) | CLEAN chord-symbol hosts EXIST now (the deferral reason is stale): AnalysisCard chord cells are buttons with `data-testid=chord-cell-<bar>-<slot>` + tier + name (the primary PED-6 host). ComposerChartViewer BarChart roman spans are visual-only catalog rows (low value, out of scope). MelodyLane right-click is TAKEN (nudge-down + keyboard ArrowUp/Down/Delete alternative - must NOT be repurposed). ChordInspector Roman/Symbol cells are DIRTY (off-limits). EtudePianoRoll/ComposePianoRoll labels are SVG text (no button semantics, out of scope). VERDICT (D103): PED-6 ships SCOPED to AnalysisCard chord cells only (shared useConceptPress hook: right-click + 500ms long-press + Shift+F10 keyboard alternative); every other host gated with TD-PED-6-REST. |
| PED-7 toggle verify | src/components/EtudeViews.tsx, search `notesOn` / `REQ-PED-7` | `notesOn` useState(true) + Notes toggle button (aria-pressed) hiding chips + About. No other surface has a toggle (grep `notesOn|showAnnotations` hits EtudeViews only). VERDICT (D109): SHIPPED and CLOSED as Etude-only view chrome (deliberately NOT persisted, D37). Compose/Explore chips are sparse enough to not need a toggle; expanding scope is rejected (no requirement, no user ask). |
| PED-4 remainder check | src/components/AnalysisCard.tsx (Compose chips + ComposePianoRoll); src/components/AccompanimentPanel.tsx (chips); src/components/EtudeViews.tsx (margin + About); src/components/ExploreSurface.tsx + IdeaCard.tsx (rationale + concept link) | Compose: annotation chips under the chart + piano roll below (REQ text "under chords, on piano roll" satisfied by adjacency, not overlay). Etude: margin-note strip + About panel. Explore: idea-card rationale body + concept link. VERDICT (D110): CLOSED, nothing left. Piano-roll NOTE-level overlay was never required (target kinds note/scale exist in the union for future slices but no detector emits them - by design, types.ts comment). |
| Quiz/legacy ear assets (NOT reusable) | src/lib/quizEngine.ts, search `generateQuiz`; src/lib/rhythmDrill.ts; src/data/quizzes/ | quizEngine synthesizes chords from pathId hash + rides the DEAD analyzeChord path (D47 audit: theory.ts root bug) with canned explanations; question types are roman/tension/function (not the 7 ear types). VERDICT: harvest NOTHING (not even the distractor pickN - it uses unseeded sort comparator `sort(() => rng()-0.5)`, biased shuffle, engine-illegal). Ear-training is clean-roomed in engine/ear-training/ under Rng + honesty predicates. |
| Theory spelling tables | engine/core/chords.ts (`QUALITY_INTERVALS` 17 qualities, `NAME_SUFFIX`, `keyUsesFlats`, `spellChordName`); engine/core/spelling.ts (D11); engine/etude/harmony.ts (D21 `parseNumeral`/`numeralInfo`/`MODE_OFFSETS`); engine/compose/chordsym.ts (`ROOT_PC` incl. E#/B#/Cb/Fb, `parseChordSymbol`, `buildCellFromSymbol`); src/lib/theory.ts (FROZEN, display-only) | Chord truth lives in engine (17-interval table shared by etude + compose). chordsym ROOT_PC already carries the theoretical spellings Cb/Fb/B#/E# as pitch classes (cells store pc, spelling is the key's job). D21 numeral grammar is the progression/scale-degree truth. VERDICT (D113): enharmonic equivalence is PITCH-CLASS equality (mod12) everywhere in check + distractor filter (sec 3 table); display spelling never participates in grading. |
| SRS/log neighbor precedent | src/lib/performanceLog.ts (`hse.performance.log.v1`, MAX_TAKES 50, loadTakes/recordTake defensive); src/lib/practiceStore.ts (sessions cap 50); engine/core/rng.ts (`createRng`, `hashSeed`); engine/core/ids.ts (`deriveCanonicalId`, `makeInstanceId`); engine/pedagogy/annotate.ts (9 truthful detectors, D99 lineage) | Log precedent is append-only + capped + corrupt-fallback + ISO timestamps stamped at the ADAPTER (engine takes nowMs param, ADR-005). Rng precedent is one-handle-per-call + fixed draw order (D100). Annotate precedent is detectors-over-data + fixed emission order + deterministic ids (never rng/clock). VERDICT: SRS/log follow the SAME seams (sec 3). |
| e2e convention | e2e/explore.spec.ts (D92 pattern); e2e/etude-composer.spec.ts; playwright.config.ts (served dist :4173, build first) | In-spec helpers (goto + commit), served dist, NODE-side assertions, discriminative legs (each fails if its mechanism is removed), state-machine via data-preview MutationObserver (audio output manual, S3 precedent). VERDICT (sec 7): ear-training earns ONE spec with TWO legs (prompt->answer->feedback->SRS-update; drawer-open via failure-concept + header search), existing 7 specs survive UNEDITED. |
| Gate floors | vitest.config.ts (JSDOM glob `src/components/**/*.test.tsx`); assets/check-links.cjs (tests/ it( 362 FROZEN); engine/purity.test.ts MIN 44 | New component tests need NO config edit. New engine sources bump the floor SAME-commit (D20/D56/D91/D101 ladder). docs/ unscanned. build = two configs. VERDICT (sec 6): floor 44 -> 50 (6 new engine sources; tree scans 51 with index-file slack). |
| E2E_STATE / GIT-001 | git status (STAGED M x11, zero unstaged); .kai/memory.yaml, search `GIT-001` / `PHASE-3-01` / `ADR-005-01` | The S4 partial-commit incident (hand-listed git add missed 9 files, CI red) + the "Task cancelled" S4 fix-round incident are both recorded. The dirty-11 are now STAGED per user instruction (committed shape intact). VERDICT (sec 8): developer must NEVER bare-commit (pathspec commits only, `git add <exact paths>` + `git status` reconcile per GIT-001), NEVER touch dirty-11, NEVER `git checkout --` (PHASE-2-02 file-copy snapshots). |

Findings (new, this audit): F16: AnalysisCard chord cells are CLEAN and button-semantic - the PED-6 deferral reason is stale for Compose; scope to them and ship (D103). F17: rhythmDrill is an anti-precedent for sequencing (immediate-fire loop) - ear prompts must render tick-offsets, never loop playNote (D105). F18: quizEngine is technique-list-only at best (biased shuffle + dead analyzeChord path) - clean-room required, zero reuse (D113). F19: pedagogy.srs/log belong OUTSIDE the zustand envelope (idea-library pattern) - no v5, no migration (D107). F20: EtudeViews Notes toggle is the ONLY PED-7 surface and that is sufficient - Compose/Explore need no toggle (D109). F21: PED-4 is closed on all three modes by adjacency (chips + roll below counts as "on piano roll") - no overlay work (D110). F22: exampleNumerals on all 10 concepts parse in D21 - Hear-an-example needs no authored audio (D112).

---

## 2. Decisions (D102..D114, continuing the Phase 5 numbering)

### D102 (SINGLE PIPELINE RECOMMENDED; cut line pre-authorized if split is forced)

RECOMMENDED: ONE slice (this doc). The ear-training generator +
checker + SRS + log share the prompt envelope + honesty harness +
nowMs-param pattern; the drawer footer + header search + PED-6 hook
share the concept-resolution helper; splitting strands either the
engine without a surface or a surface without prompts, and the total
fits the PRD 2-week nominal (engine 5-7 dev-days, surface + Hear +
drawer + e2e 1 week, gates 2 days). IF team capacity forces a split,
the cut line is: Slice A = engine/ear-training/ + engine/pedagogy/
srs+log + purity floor + ALL engine tests (zero UI, shippable,
unblocks everything; the modulate-stub precedent D94 applies: no UI
promise made); Slice B = EarTrainingPanel + earHear + drawer footer
+ header search + PED-6 hook + log summary UI + e2e (sec 4-7). Slice
A MUST NOT include the drawer footer alone without the checker
(grades are the shared asset). No three-slice option (prompts
without checking is not shippable). Confidence: HIGH.

### D103 (PED-6 SCOPED SHIP + TD gate for the rest)

REQ-PED-6 ships SCOPED to AnalysisCard chord cells (the only CLEAN
button-semantic chord-symbol host, F16). Mechanism: shared
`useConceptPress` hook (sec 4) wiring onContextMenu (right-click) +
500ms long-press (touch) + Shift+F10 keyboard alternative (a11y;
MelodyLane keeps its nudge binding untouched). Resolution is HONEST:
the cell opens the concept linked from the NEAREST annotation
covering that (bar, slot) (merged.annotations lookup, same data the
chips use); when no annotation covers the cell, the gesture opens
the GLOBAL search prefilled with the cell symbol (no false claim -
the drawer never invents a concept for a bare chord). GATED with
TD-PED-6-REST: EtudePianoRoll/ComposePianoRoll SVG labels (no button
semantics - need a renderer change), ComposerChartViewer roman spans
(catalog surface, low value), and all DIRTY hosts (ChordInspector,
LiveScoreDisplay, InspectPanel) wait for their owners. Twice-deferred
ends here for Compose; the rest is tracked debt, not a third
deferral. Confidence: HIGH.

### D104 (ETUDE SUB-MODE ANCHOR: section below the composer)

The ear-training sub-mode is a SECTION (`<EarTrainingPanel>`)
rendered in AppMain between EtudeComposerPanel and EtudeViews (NOT
a tab, NOT a sub-route, NO ModeGate edit). Rationale: (1) simplest
that meets requirements (tab needs tablist a11y + state; sub-route
needs URL contract + gate branching); (2) preserves the D22/D37
layout (composer -> views -> live score) with one insertion point;
(3) DirtyMap.etude interplay is trivial (D106): training attempts
never dirty, so the section never calls acceptEtude and never
disturbs the mode-switch prompt. The section header reads "Ear
training" with type/difficulty/seed controls + prompt card +
feedback + streak line (Q10 call, D108). Empty state (PRD 9.6):
free example prompt + flow explanation on first visit (no SRS data
yet). Confidence: HIGH.

### D105 (AUDIO REUSE: earHear adapter through the existing singleton)

`src/lib/earHear.ts` (adapter, the ONLY audio-touching new file):
`promptToHearInput(prompt)` (PURE, node-tested) builds a transient
synthetic project (ppq 480, single 4/4 tempo 120, endTick from the
prompt span) + a transient AccompanimentResult (chords role for
block prompts via voiceSequence close style; sequential prompts as
tick-offset chord stabs on the SAME chords role - intervals 2 stabs,
scales 7-8 stabs at eighth spacing, progressions 1 bar per chord,
dictations as lead-arm melody via mapOriginalTracks like
exploreHear). `hearEarPrompt` then calls the EXISTING
`renderAccompaniment` (+ `renderMixGroups` for the lead arm) and
plays through `composePreviewPlayer` (markRendering -> play/playMix
-> idle, live-gated in the click handler per PHASE-2-01). Cap:
prompts are < 90s by construction (longest: 4-bar progression at
2s/bar = 8s + tail; asserted in the builder test). Rejected:
audioEngine.playNote loops (no when-param, setTimeout jitter, F17
anti-precedent, single-voice bus misvoices block chords per F13);
a new earPreview singleton (second ctx lifecycle for zero gain);
deferring Hear (prompts without audio are not ear training).
e2e asserts the state machine only (data-preview idle->rendering->
playing->idle via MutationObserver); audio OUTPUT stays
manual-per-policy (S3/D96 precedent). Confidence: HIGH.

### D106 (DIRTY INTERPLAY: training attempts are NOT dirty work)

DirtyMap.etude stays the literal `"etude-pending-accept"` set ONLY
by acceptEtude (Generate/Reroll). Ear-training prompt generation,
answer submission, SRS updates, and log writes NEVER touch dirty or
pendingModeRequest (they are practice events, not composition
edits - ADR-007). Send-to-Etude (drawer footer, D111) uses
setEtudeConstraints (no dirty; user presses Generate in Etude).
Rationale: a mode-switch prompt firing because the user missed an
interval is hostile UX and contradicts the Phase 1 dirty contract
(unsaved COMPOSITION work only). Test-pinned: answer submit leaves
`useSessionStore.getState().dirty.etude` unchanged. Confidence: HIGH.

### D107 (STORE VS LOCAL for each state class; NO v5, NO migration)

| State class | Home | Persisted | Rationale |
|---|---|---|---|
| Prompts (current prompt, options, attempt input, feedback) | EarTrainingPanel LOCAL useState (transient, PRD 10.4) | NO | Ephemeral drill state; reload regenerates deterministically from (type, difficulty, seed). Persisting it would brawl with the partialize design for zero requirement. |
| SRS state (per-concept lastSeen/interval/ease/streak) | src/lib/srsStore.ts over localStorage `pedagogy.srs` (NOT zustand) | YES (K-entry + registry row, capped 10) | Idea-library pattern (hse.ideas precedent): cross-session taste/progress outside the session envelope. New OPTIONAL key = no version bump per D73/D85 precedent. Engine srs.ts stays pure (nowMs param, ADR-005). |
| Practice log (entries + summary cache) | src/lib/pedagogyLog.ts over localStorage `pedagogy.log` (NOT zustand) | YES (K-entry + registry row, cap 500) | performanceLog.ts precedent (append-only, capped, corrupt-fallback, ISO stamps at adapter). New OPTIONAL key = no version bump. Summary is a PURE derivation (sec 3), never stored. |
| Drawer open concept (local hosts + global host) | useState<string \| null> per host + App-level host for header search | NO | Transient UI (PRD 10.4). No store change (D98 precedent: exploration/pedagogy UI stays local). |
| Ear-training config (type/difficulty/seed) | EarTrainingPanel LOCAL useState (defaults: interval/1/seed 1) | NO | Transient drill setup; PRD has no URL contract for ear state (REQ-ETU-3 covers etude constraints only). A future `?ear=` deep link can carry (type,difficulty,seed) without store change (D86 pattern noted, not built). |

Session version stays 4; engine/migrations untouched; STORAGE_SCHEMA_VERSION stays "1" (new keys, not changed shapes). Confidence: HIGH.

### D108 (Q10 SCORING CALL: accuracy-% + streaks, NO XP/levels)

PRD Q10 ("pass/fail, accuracy %, or gamified?") is ANSWERED here:
ship per-prompt correct/incorrect + rolling accuracy-% (last 20
attempts) + per-concept streak + SRS streak; NO XP, NO levels, NO
badges, NO leaderboards. Rationale: (1) honesty lineage (ADR-013/
017 + PHASE-3-01): a gamified score inflates progress claims (an XP
bar that rises on easy interval drills misrepresents harmonic
hearing); accuracy-% + streaks report WHAT HAPPENED without
inventing a currency. (2) SRS already provides the progression
mechanic (intervals grow, due items resurface) - gamification would
duplicate it with less theory. (3) PRD metrics (5.2) track
annotations-opened and session length, not points. The panel copy
reads "12/20 correct (60%) - streak 3" (the honesty string), never
"Level up". A gamified layer remains a product decision for later,
not an engine default (no XP fields in any type). Confidence: HIGH.

### D109 (PED-7 VERIFIED SHIPPED, CLOSED as Etude-only)

REQ-PED-7 (annotations toggle) shipped in Slice 3 as the EtudeViews
Notes toggle (aria-pressed, default ON, hides chips + About). It is
deliberately LOCAL view state, NOT persisted (D37: view chrome, not
user setup like metronome taste D32). Compose/Explore have NO
toggle and NEED none (their chip rows are sparse; a toggle there
adds chrome for zero requirement). No further work. Confidence: HIGH.

### D110 (PED-4 REMAINDER CHECK: CLOSED, nothing left)

REQ-PED-4 shipped on all three modes: Compose (annotation chips
under the chart + piano roll below the chips - adjacency satisfies
"under chords, on piano roll"; overlay on roll cells was never
required), Etude (margin-note strip + About panel), Explore
(idea-card rationale body + concept link). The note/scale target
kinds exist in the AnnotationTarget union for future slices but no
detector emits them (types.ts documents this) - that is extensibility,
not remainder. No further work. Confidence: HIGH.

### D111 (DRAWER-GLOBAL ENTRY SHAPE + REQ-PED-13 FOOTER)

Global entry: App header gains `<ConceptSearch>` (input + datalist
of the 10 titles, filters on title/definition substring, Enter or
selection opens the drawer). The drawer itself is hosted ONCE at
App level (`conceptOpen: string | null` useState in App, next to
the existing header state - sanctioned minimal App.tsx edit, sec 5).
Existing LOCAL hosts (EtudeViews, AnalysisCard, AccompanimentPanel,
ExploreSurface) stay untouched (no refactor to a global store -
premature per D37; two drawer instances never render simultaneously
because local drawers close on navigation). Footer (REQ-PED-13):
ConceptDrawer gains a footer slot with "Hear an example" (disabled
with title when exampleNumerals null) + "Send to Explore"
(ideaToSeedText path, sec 4). Both buttons are honest (Hear renders
the REALIZED exampleNumerals pitches, D112; Send carries the
numerals as seed text, D97b-style carry, never a literal
transplant claim). Confidence: HIGH.

### D112 (EXAMPLE-CONTENT MODEL: generated, never hand-authored)

"Hear an example" realizes `concept.exampleNumerals` (D21 tokens)
in C major (tonicPc 0, mode from the token set: major default,
minor when all tokens parse minor - deterministic rule, sec 3) as
1 bar per numeral via parseNumeral + QUALITY_INTERVALS + close
voicing inside the chords register (the etude Step-7 realization,
no new voicing math), rendered through the earHear transient path
(D105). Rationale: (1) the registry ALREADY pins exampleNumerals
parsing in D21 (test-pinned) - audio is a realization, not new
content; (2) hand-authored note sets would fork the theory truth
(D47 lineage: one interval table); (3) minimal honest scope: the
button plays WHAT THE TOKENS SAY (label reads "Hear ii-V-I in C",
not "Hear the concept"). "Send to Explore" carries the joined
numerals as free-text seed (Explore parses what it can, free
fallback otherwise - D93 never dead-ends). Confidence: HIGH.

### D113 (CHECKER HONESTY: enharmonic = pitch-class equality; pool filter excludes it)

Answer checking (REQ-PED-23/24) is PURE in engine/ear-training/
check.ts: note-name answers compare by PITCH CLASS (mod12 via the
chordsym ROOT_PC table extended with double-accidentals, sec 3
table - Cb==B, Fb==E, B#==C, E#==F pinned), NEVER by string.
Distractor pools (REQ-PED-22) are filtered by the SAME predicate:
a "Bb" distractor when the answer is "A#" is EXCLUDED (same pc =
false negative by design, the PRD's explicit example). Timing
tolerance (dictation rhythm): onset within max(120ms, 15% of slot)
counts (inputLatencyMs subtracted first when calibrated,
REQ-PRAC-42 lineage - param, not import). Partial credit (REQ-PED-24,
P2): melodic-dictation ONLY (pitch-class hit fraction + contour
bonus, sec 3); all other types are exact (no partial). On failure,
the checker returns the prompt's conceptId (every prompt carries
one; REQ-PED-25) and the panel offers "What is <title>?" opening
the drawer (existing key-prop pattern). Confidence: HIGH.

### D114 (SRS: canonical SM-2, pure, nowMs-param; due-bias as a pure selector)

engine/pedagogy/srs.ts implements the CANONICAL SM-2 (SuperMemo-2,
1987) with the published constants (sec 3 golden vectors): ease
starts 2.5, floor 1.3; interval 1 then 6 then interval*ease
(rounded); ease update `e + (0.1 - (5-g)*(0.08+(5-g)*0.02))`;
grade = 5 correct / 2 incorrect (binary prompts have no 3-4 band -
documented mapping, no invented granularity); grade < 3 resets
interval to 1 and streak to 0, else streak+1. Pure: `review(state,
grade, nowMs)` returns new state (lastSeen = nowMs; nextDue =
nowMs + interval*86400e3); clock NEVER read in engine (ADR-005).
Prompt selection bias (REQ-PED-32):
`pickNext(conceptIds, srsMap, nowMs, rng)` returns due items
(nextDue <= nowMs) weighted by overdue-days, else the
longest-unseen item (never empty, never throws). SRS scheduling
claims ("due in N days") derive ONLY from this math (no invented
half-life). Confidence: HIGH.

---

## 3. engine/ modules design (copyable signatures)

All files: ASCII, silent, relative-only imports, Rng-injected,
Outcome-armed parsers (never throw into UI except the documented
RangeError on programmer-error paths the adapter pre-validates).
Engine may import from ../core/* (rng, spelling, chords, ids,
versioned), ./types, ../etude/harmony (parseNumeral/numeralInfo -
pure fns, no cycle), ../compose/chordsym (parseChordSymbol -
grammar only), ../pedagogy/concepts (getConcept - data lookup),
../styles/* (types only). No tonal, no @tonejs/midi, no Date.

### engine/ear-training/types.ts (NEW)

```ts
import type { Versioned } from "../core/versioned";
import type { Seed } from "../core/rng";

export type EarType =
  | "interval" | "chord-quality" | "chord-inversion"
  | "progression" | "scale"
  | "melodic-dictation" | "harmonic-dictation";
export type EarDifficulty = 1 | 2 | 3 | 4 | 5;
export interface EarPrompt extends Versioned { // version: 1
  readonly id: string; // "ear-<type>-<base36hash>" (hashSeed, D100 pattern)
  readonly type: EarType;
  readonly difficulty: EarDifficulty;
  readonly seed: Seed;
  readonly rootPc: number; // 0..11 (transposition anchor)
  readonly midi: readonly number[]; // PROMPT pitches (intervals: 2; chords: 3-5; scales: 7-8; dictations: 4-8)
  readonly chordSymbols: readonly string[] | null; // progression/harmonic only (spelled via D11)
  readonly question: string; // ASCII prompt text ("Which interval?" / "Notate the 4 notes")
  readonly conceptId: string; // ALWAYS non-null (REQ-PED-25; registry-resolving, test-pinned)
  readonly answerKey: string; // canonical answer token (interval name / quality symbol / symbol list / pc list)
}
export interface EarOptions {
  readonly prompt: EarPrompt;
  readonly choices: readonly string[]; // multiple-choice types only (4 options, answer included once)
  readonly correctIndex: number; // index into choices
}
export function isEarType(s: string): s is EarType;
export function earPromptId(type: EarType, difficulty: EarDifficulty, seed: Seed): string;
```

### engine/ear-training/generate.ts (NEW)

```ts
import type { Rng, Seed } from "../core/rng";
import type { EarDifficulty, EarPrompt, EarType } from "./types";
export interface EarGenInput {
  readonly type: EarType;
  readonly difficulty: EarDifficulty;
  readonly seed: Seed;
  readonly rng: Rng; // caller createRng(seed); ONE handle per prompt (D100)
}
export function generateEarPrompt(input: EarGenInput): EarPrompt;
// Draw order (contract, pinned by determinism test): rootPc -> type
// payload (intervals ascending by difficulty table below) -> spelling
// key (C major default; minor for minor-flavored prompts) ->
// conceptId (fixed per type, sec table) -> id (hash, never rng).
// Difficulty tables (closed, test-pinned):
// interval: L1 {P5,P4,M3} L2 +{m3,M2,m7} L3 +{m6,M6,m2,M7} L4 +{tritone,aug} L5 all + compound flag;
// chord-quality: L1 {maj,min} L2 +{maj7,m7,dom7} L3 +{dim,halfdim} L4 +{maj9,dom9,min9} L5 +{alt,sus4,maj6};
// inversion: root-position/triadic inversions L1-2, seventh inversions L3+;
// progression: L1 {I-V, I-IV} L2 +{ii-V-I} L3 +{12-bar fragment} L4 +{rhythm changes bridge} L5 +{coltrane fragment};
// scale: L1 {major,minor} L2 +{dorian,mixolydian} L3 +{lydian,phrygian} L4 +{locrian,blues} L5 +{chromatic};
// dictations: length 4 (L1-2) / 6 (L3-4) / 8 (L5), stepwise bias L1-3, chromatic approaches L4+.
// Concept map (every prompt carries one, REQ-PED-25): interval -> voice-leading;
// chord-quality -> drop-2; inversion -> voice-leading; progression -> ii-v-i
// (or cadence for cadential fragments - data-driven, never prose);
// scale -> modal-interchange; melodic -> voice-leading;
// harmonic -> cadence. Non-null MUST resolve via getConcept (test-pinned).
```

### engine/ear-training/distractors.ts (NEW, REQ-PED-22 + D113 filter)

```ts
import type { Rng } from "../core/rng";
export function distractorsFor(
  answer: string,
  pool: readonly string[],
  rng: Rng,
  count: number, // 3 (4 options total)
): readonly string[];
// Contract: same-pool candidates, answer EXCLUDED ENHARMONICALLY
// (pc-equality via NOTE_PC table, sec 6 - "Bb" never distracts "A#").
// Fill order: pc-distinct pool members shuffled (rng.shuffle on a COPY)
// then truncated; short pools recycle with octave suffixes (never the
// answer pc). Returns exactly `count` items; throws RangeError on
// empty pool (programmer error - adapter pre-checks).
export function pitchClassOfToken(token: string): number | null;
// NOTE_PC incl. Cb/Fb/B#/E# + double-accidentals (sec 6 table).
// Null for unparseable (dictation pc-lists bypass this path).
```

### engine/ear-training/check.ts (NEW, REQ-PED-23/24 + D113)

```ts
import type { EarPrompt } from "./types";
export interface EarGrade {
  readonly correct: boolean;
  readonly partial: number | null; // 0..1 for melodic-dictation only; else null
  readonly conceptId: string; // prompt.conceptId echo (REQ-PED-25 wiring)
  readonly detail: string; // ASCII feedback sentence (honest intervals named)
}
export function gradeEarAnswer(
  prompt: EarPrompt,
  answer: string,
  opts?: { readonly latencyMs?: number },
): EarGrade;
// Rules: note-name answers compare by pitch class (mod12), never by
// string (sec 6 table pinned). Interval/quality/inversion/progression/
// scale answers compare canonical tokens (case-folded, ascii "b"/"#"
// normalized; "m7b5" == "halfdim" alias accepted via QUALITY map).
// Dictation answers are pc-lists ("60,62,64" or "C D E" spellings -
// both accepted, pc-compared positionally). Timing: dictation onset
// errors within max(120ms, 15% slot) count (latencyMs subtracted
// first when provided). Partial (melodic ONLY): hitFraction =
// correctPc/positions + 0.1 contour bonus (capped 1.0); correct =
// partial >= 0.85. All other types: partial null, correct = exact.
```

### engine/pedagogy/srs.ts (NEW, REQ-PED-30/31/32 + D114)

```ts
import type { Versioned } from "../core/versioned";
import type { Rng } from "../core/rng";
export interface SrsState extends Versioned { // version: 1
  readonly conceptId: string;
  readonly lastSeenMs: number; // nowMs at last review (0 = never)
  readonly intervalDays: number; // SM-2 interval (0 = unseen)
  readonly ease: number; // SM-2 ease (2.5 default, floor 1.3)
  readonly streak: number; // consecutive grade>=3 reviews
  readonly nextDueMs: number; // lastSeenMs + intervalDays*86400e3 (0 = due now)
}
export type EarGradeBinary = 2 | 5; // incorrect / correct (D114 mapping)
export function newSrsState(conceptId: string): SrsState;
export function reviewSrs(
  state: SrsState,
  grade: EarGradeBinary,
  nowMs: number, // injected clock (ADR-005); never Date.now here
): SrsState;
// Canonical SM-2 (sec 6 golden vectors pinned): grade>=3 ->
// interval = 1 (first) / 6 (second) / round(prev*ease); streak+1;
// grade<3 -> interval 1, streak 0. Ease update ALWAYS (both arms):
// e + (0.1 - (5-g)*(0.08+(5-g)*0.02)), floor 1.3.
export function pickNextConcept(
  conceptIds: readonly string[],
  srs: Readonly<Record<string, SrsState>>,
  nowMs: number,
  rng: Rng,
): string;
// Due-bias (REQ-PED-32): due = nextDueMs <= nowMs (or unseen);
// due nonempty -> weighted pick by overdue-days (min weight 1);
// else longest-unseen (smallest lastSeenMs). Never throws on
// nonempty input (RangeError on empty - programmer error).
```

### engine/pedagogy/log.ts (NEW, REQ-PED-40/41/42)

```ts
import type { Versioned } from "../core/versioned";
export type PracticeOutcome = "correct" | "incorrect" | "partial";
export interface PracticeEntry extends Versioned { // version: 1
  readonly atMs: number; // injected clock (adapter stamps Date.now)
  readonly mode: "etude" | "compose" | "explore" | "ear";
  readonly refId: string; // prompt id / etude canonicalId / idea id
  readonly outcome: PracticeOutcome;
  readonly durationSec: number; // >= 0, capped 3600 (defensive)
  readonly conceptId: string | null; // ear prompts always non-null; others nullable
}
export interface LogSummary {
  readonly minutesPerDay: Readonly<Record<string, number>>; // "YYYY-MM-DD" -> minutes (last 30d, UTC date)
  readonly conceptCounts: Readonly<Record<string, number>>; // conceptId -> attempts
  readonly rollingAccuracy: number | null; // last-20 correct fraction (partial counts 0.5); null when empty
  readonly totalAttempts: number;
}
export function appendEntry(
  log: readonly PracticeEntry[],
  entry: PracticeEntry,
  cap?: number, // default 500
): readonly PracticeEntry[];
export function summarizeLog(
  log: readonly PracticeEntry[],
  nowMs: number, // injected (window: nowMs-30d <= atMs <= nowMs)
): LogSummary;
// Pure math (sec 6 pinned): minutesPerDay sums durationSec/60 per UTC
// day key (entries outside the 30d window excluded); conceptCounts
// tallies non-null conceptIds over the WHOLE log (not windowed);
// rollingAccuracy over the last 20 entries (correct=1, partial=0.5,
// incorrect=0). All rounding to 2 decimals at the ADAPTER display
// layer, never here (raw fractions).
```

---

## 4. Component API sketches (UI)

All components: ASCII, no `console.*` except warn/error paths, no
`any`. Props-only (read nothing from stores except EarTrainingPanel,
which owns SRS/log bridging). StrictMode one-shot on every mount
effect (PHASE-3-03); live-gate every audible trigger (PHASE-2-01:
AudioContext resume inside the click handler, never in an effect).

```
src/components/EarTrainingPanel.tsx (NEW; REQ-PED-20/21/22/23/24/25, D104/D106/D108)
  // LOCAL state only (D107): earType, difficulty (1-5), seedText,
  // prompt: EarPrompt | null, options: EarOptions | null,
  // attempt: string, grade: EarGrade | null, srsLine: string | null,
  // hearState (singleton mirror, D105), logCount (display only).
  // Generation: createRng(seed) -> generateEarPrompt -> distractorsFor
  // (multiple-choice types) -> setPrompt/Options (NO dirty call, D106).
  // Answer: gradeEarAnswer(prompt, attempt) -> reviewSrs(srs[concept],
  // gradeToBinary, Date.now()) -> srsStore.save -> pedagogyLog.append
  // ({mode:"ear", refId: prompt.id, outcome, durationSec measured from
  // promptShownAt ref, conceptId}) -> setGrade + failure-concept offer.
  // Hear: hearState from composePreviewPlayer.subscribe (one
  // subscription, StrictMode-safe); onHear -> hearEarPrompt(prompt)
  // (D105; live-gated). MIDI/computer-keyboard input: on-screen piano
  // buttons append pc tokens to attempt (touch-friendly, REQ-IO-4/5
  // lineage - no Web MIDI in Phase 6 scope; MIDI-ear answers are TD).
  // Q10 copy (D108): "12/20 correct (60%) - streak 3" + per-concept
  // streak line; NO XP/levels anywhere in copy or types.
  // data-testid: ear-type, ear-difficulty, ear-seed, ear-generate,
  // ear-prompt, ear-option-<i>, ear-attempt, ear-submit, ear-feedback,
  // ear-hear (data-preview mirror), ear-concept-offer, ear-streak.

src/lib/earHear.ts (NEW adapter; ONLY audio-touching new file, D105)
  export function promptToHearInput(prompt: EarPrompt):
    { project: NormalizedProject; result: AccompanimentResult;
      lead: readonly OriginalVoiceNote[] };  // PURE, node-tested
  export async function hearEarPrompt(prompt: EarPrompt): Promise<void>;
  // builds input -> renderAccompaniment (+ renderMixGroups for lead)
  // -> composePreviewPlayer.play/playMix (D105). Cap assert: input
  // duration < PREVIEW_CAP_SEC (test-pinned, never truncates).
  // Sequential prompts use tick offsets (eighth grid, 240 ticks at
  // ppq 480): intervals [0, 480], scales ascending eighths, melodic
  // dictation as lead-arm eighths, harmonic dictation as block + lead.

src/lib/srsStore.ts (NEW adapter; D107, K-entry + registry pattern)
  export function loadSrs(): Record<string, SrsState>; // corrupt -> {}
  export function saveSrs(map: Record<string, SrsState>): void; // capped 10 concepts
  export function getSrs(conceptId: string): SrsState; // missing -> newSrsState
  export function recordReview(conceptId: string, grade: 2|5, nowMs: number): SrsState;
  // void on quota failure (in-memory value stays; UI never breaks).

src/lib/pedagogyLog.ts (NEW adapter; D107, performanceLog.ts pattern)
  export function loadLog(): readonly PracticeEntry[];
  export function appendLog(entry: Omit<PracticeEntry,"version">): PracticeEntry;
  export function summarize(nowMs?: number): LogSummary; // default Date.now() HERE (adapter only)
  export const PEDAGOGY_LOG_CAP = 500;
  // Never throws (corrupt -> []); storageSetCap-style trim.

src/components/ConceptSearch.tsx (NEW; REQ-PED-12, D111)
  props: {
    value: string;
    onChange: (text: string) => void;
    onOpen: (conceptId: string) => void;  // App-level host setter
    initialValue?: string;                // PED-6 fallback prefill (D103)
  }
  // input + datalist of the 10 titles; filters on title/definition
  // substring (case-insensitive); Enter opens the first match;
  // datalist selection opens exact. data-testid: concept-search,
  // concept-search-option-<id>. No store, no URL (transient).

src/components/ConceptDrawer.tsx (EDIT; REQ-PED-13 footer, D111/D112)
  // Footer slot (replaces the D38 comment): "Hear an example" button
  // (onHearExample prop OR internal earHear call with C-major default
  // + data-preview mirror) + "Send to Explore" button (onSendToExplore
  // prop: ideaToSeedText(join(exampleNumerals)) + requestMode("explore")).
  // Props widen BACKWARD-COMPATIBLY (optional callbacks + optional
  // hearState; existing 4 hosts compile unchanged - PM-2026-009-003).
  // Hear disabled with title when exampleNumerals null (never fires
  // today; defensive). data-testid: concept-hear, concept-send-explore.

src/components/useConceptPress.ts (NEW hook; REQ-PED-6, D103)
  export function useConceptPress(
    resolve: () => string | null,   // nearest-annotation conceptId or null
    open: (conceptId: string | null, fallbackText: string) => void,
  ): { onContextMenu: React.MouseEventHandler; onTouchStart/End; onKeyDown };
  // Right-click (onContextMenu preventDefault + open), 500ms long-press
  // (touch timer, cancelled on move/end), Shift+F10 keyboard (a11y).
  // Null resolution opens the GLOBAL search prefilled (no false claim).

src/components/AnalysisCard.tsx (EDIT; REQ-PED-6 host, D103, ~20 lines)
  // Chord-cell buttons gain {...useConceptPress(
  //   () => nearestAnnotationConcept(merged.annotations, region.bar, slot),
  //   (id, fallback) => id ? setDrawerConceptId(id) : openGlobalSearch(fallback))}
  // + title suffix " (right-click for concept)". No other changes
  // (popover, tiers, piano roll, privacy line untouched). CLEAN file.

src/App.tsx (EDIT; TWO sanctioned insertions only, D111/D104)
  // (1) Header: <ConceptSearch> next to ModeSelector (global search,
  // REQ-PED-12) + App-level {conceptOpen} host rendering <ConceptDrawer
  // key={conceptOpen} conceptId={conceptOpen} onClose=...> (footer
  // wired to earHear + explore seed). (2) Etude slot: <EarTrainingPanel>
  // between EtudeComposerPanel and RecentTakesPanel (D104 section
  // anchor). No other changes (ModeGate, PracticeHeader, transport
  // untouched). Both insertions preserve existing testids.
```

Key resolution for ear prompts: rootPc drawn from rng (0..11);
spelling key = C major default (tonicPc 0, major) except
minor-flavored prompts (minor scales, minor progressions) which use
A minor (tonicPc 9, minor) - deterministic rule, documented in the
builder test.

---

## 5. File plan + dirty-collision + purity floor

```
NEW engine/ear-training/types.ts
NEW engine/ear-training/generate.ts
NEW engine/ear-training/distractors.ts
NEW engine/ear-training/check.ts
NEW engine/pedagogy/srs.ts
NEW engine/pedagogy/log.ts
NEW engine/ear-training/generate.test.ts
NEW engine/ear-training/distractors.test.ts
NEW engine/ear-training/check.test.ts       // enharmonic table (sec 6)
NEW engine/ear-training/determinism.test.ts // double-run + 300-seed sweep
NEW engine/pedagogy/srs.test.ts             // SM-2 goldens + due-bias property
NEW engine/pedagogy/log.test.ts             // summary math (sec 6)
EDIT engine/purity.test.ts                  // MIN_SCANNED_FILES 44 -> 50 (same commit as first new source)
EDIT src/lib/storage.ts                     // K.pedagogySrs + K.pedagogyLog + STORAGE_KEYS rows (drift-guard pattern)
NEW src/lib/earHear.ts                      // adapter (D105)
NEW src/lib/earHear.test.ts                 // node: pure builder only (no AudioContext)
NEW src/lib/srsStore.ts                     // adapter (D107)
NEW src/lib/srsStore.test.ts                // node/jsdom storage contract (cap, corrupt-fallback)
NEW src/lib/pedagogyLog.ts                  // adapter (D107)
NEW src/lib/pedagogyLog.test.ts             // node: append + summarize (nowMs-injected)
NEW src/components/EarTrainingPanel.tsx
NEW src/components/ConceptSearch.tsx
NEW src/components/useConceptPress.ts
EDIT src/components/ConceptDrawer.tsx       // footer slot only (props widened optionally)
EDIT src/components/AnalysisCard.tsx        // PED-6 hook on chord cells only (~20 lines)
EDIT src/App.tsx                            // header search + App-level drawer host + EarTrainingPanel anchor (sanctioned, minimal)
NEW src/components/EarTrainingPanel.test.tsx // jsdom via existing glob (NO config edit)
NEW src/components/ConceptSearch.test.tsx    // jsdom via existing glob
NEW src/components/useConceptPress.test.tsx  // jsdom via existing glob
NEW e2e/ear-training.spec.ts                 // D92-convention browser legs (sec 7)
```

Purity floor: 44 -> 50 (6 new engine sources; tree scans 51 with
the index-file slack - same D20/D56/D91/D101 ladder pattern, bumped
in the SAME commit as the first new engine source). No other guard
change.

Dirty-collision: NONE of the 11 staged files are edited (sec 1
table). AnalysisCard + ConceptDrawer + App.tsx are CLEAN (App.tsx
edits are the two sanctioned insertions only - header search and
etude-section anchor; no transport/mode logic touched).
FormPlanner/FormTemplatePicker stay IMPORTED and RENDERED in
ExploreSurface with today's props (never opened for edit).
theory.ts, paths.ts, studies.ts, tests/, README/SPEC/AGENTS/.kai
untouched. ModeGate untouched (D104 - no slot wiring required).

---

## 6. Test plan (colocated; node env unless marked jsdom; invisible to the it( drift gate)

1. `generate.test.ts` - all 7 types generate on every difficulty
   1-5 (35 cells); prompt carries non-null registry-resolving
   conceptId (10-id pin); rootPc 0..11; midi ranges 0..127;
   chordSymbols spelled via D11 (round-trip through chordsym
   parse); question ASCII-only (byte scan); empty-rng never throws.
2. `distractors.test.ts` - same-pool 4-option shape (answer + 3,
   correctIndex points at answer); ENHARMONIC FILTER pin (sec
   table: "Bb" never distracts "A#", "Cb" never distracts "B",
   "E#" never distracts "F"); short-pool recycle never emits the
   answer pc; shuffle copy-identity (input untouched).
3. `check.test.ts` (THE honesty suite, D113 + PHASE-3-01 negatives)
   - ENHARMONIC-EQUIVALENCE TABLE (each row: answer token, accepted
     variant, rejected neighbor):
     B/Cb (pc 11): accept {"B","Cb","A##"}; reject {"Bb","C"}.
     E/Fb (pc 4): accept {"E","Fb","D##"}; reject {"Eb","F"}.
     C/B# (pc 0): accept {"C","B#","Dbb"}; reject {"C#","Db"}.
     F/E# (pc 5): accept {"F","E#","Gbb"}; reject {"F#","Gb"}.
     A#/Bb (pc 10): accept {"A#","Bb"}; reject {"A","B"}.
     C#/Db (pc 1): accept {"C#","Db"}; reject {"C","D"}.
     F#/Gb (pc 6): accept {"F#","Gb"}; reject {"F","G"}.
     G#/Ab (pc 8): accept {"G#","Ab"}; reject {"G","A"}.
     D#/Eb (pc 3): accept {"D#","Eb"}; reject {"D","E"}.
     G/B double-sharp/flat pairs pinned via pitchClassOfToken.
   - NEGATIVES: string-different/same-pc ACCEPTS (Cb for B);
     string-similar/different-pc REJECTS ("B" for "Bb" fails even
     though one char overlaps); quality aliases accept
     ("m7b5" == "halfdim"); wrong quality rejects even with right
     root ("Cmaj7" for "Cm7" fails). Each negative names the
     fixture + the forbidden outcome.
   - TIMING: dictation onset within max(120ms, 15% slot) accepts
     (latencyMs subtracted first); outside rejects. Partial:
     melodic 6/8 pcs + right contour -> partial ~0.85, correct
     true; 3/8 pcs -> partial < 0.5, correct false; non-melodic
     types always partial null.
4. `determinism.test.ts` - double-run byte-equality for all 7 types
   on shared fixtures; 300-seed sweep (no throw, id-stable rate
   logged, never asserted as a count - flake-free, D100 precedent).
5. `srs.test.ts` - SM-2 GOLDEN VECTORS (canonical algorithm, sec
   table below, each row: start state + grade + expected):
   fresh (ease 2.5, int 0) + grade 5 -> interval 1, ease ~2.6,
   streak 1, nextDue = nowMs+1d.
   (ease 2.6, int 1) + grade 5 -> interval 6, ease ~2.7, streak 2.
   (ease 2.7, int 6) + grade 5 -> interval round(6*2.7)=16,
   ease ~2.8, streak 3.
   (ease 2.8, int 16) + grade 2 -> interval 1, ease ~2.46
   (2.8 + (0.1-(5-2)*(0.08+(5-2)*0.02)) = 2.8-0.32=2.48? pinned
   EXACT by test computation, not this comment), streak 0.
   Ease floor: (ease 1.4) + grade 2 repeatedly -> never below 1.3.
   lastSeenMs == nowMs param; nextDueMs == lastSeenMs +
   intervalDays*86400e3 (exact arithmetic pin).
   DUE-BIAS PROPERTY: mixed map (2 overdue, 1 due-now, 2 future,
   1 unseen) -> 200 picks with fixed rng seed: every pick is from
   the due+unseen set (future never picked); overdue weight
   ordering (most-overdue picked most - chi-square-free count
   assertion: count(most) > count(least)); empty input throws
   RangeError (programmer error).
6. `log.test.ts` - LOG SUMMARY MATH (nowMs-injected, fixed clock):
   30d window excludes older entries (31d-old entry contributes to
   conceptCounts but NOT minutesPerDay); minutesPerDay keys are UTC
   YYYY-MM-DD (two entries same UTC day sum; midnight-boundary
   fixture pinned); conceptCounts tallies whole-log non-null ids;
   rollingAccuracy over last 20 (correct=1, partial=0.5,
   incorrect=0; 20-entry window slides; null when empty);
   appendEntry caps at 500 (501st drops oldest); durationSec
   negative/clamped (>3600 capped); corrupt payload -> [].
7. `earHear.test.ts` (src/lib, node) - promptToHearInput shapes:
   project ppq 480 + single tempo/meter, result chords-only (+ lead
   when dictation present), duration < PREVIEW_CAP_SEC, note tuples
   tick-ascending with eighth offsets for sequential types; NO
   AudioContext import (guard asserts the module imports
   composePreview + voicing only).
8. `srsStore.test.ts` + `pedagogyLog.test.ts` (src/lib, node/jsdom)
   - K-entry existence + STORAGE_KEYS row presence; corrupt JSON
   -> fallback ({} / []); quota failure -> void (no throw); cap
   enforcement (10 concepts / 500 entries); recordReview stamps
   nowMs param (no Date inside engine - adapter passes it).
9. Component tests (jsdom, auto-glob): EarTrainingPanel (generate
   renders prompt + 4 options; submit correct shows 60%-style
   streak copy + SRS line; submit incorrect shows concept offer
   button opening drawer; Hear button mirrors hearState; dirty
   unchanged after submit - store pin); ConceptSearch (typing
   filters to 1 title; Enter opens; datalist options 10);
   useConceptPress (contextmenu opens; long-press timer opens;
   Shift+F10 opens; null resolution prefills search); ConceptDrawer
   footer (Hear + Send render; null-exampleNumerals disables Hear
   with title - fixture concept).
10. e2e/ear-training.spec.ts (browser, served dist): (1) EAR FLOW:
    Etude surface -> Ear training section -> Generate (interval)
    -> 4 options visible -> click correct -> feedback "correct"
    + streak line + SRS entry in localStorage pedagogy.srs for the
    prompt conceptId (NODE-side read). (2) DRAWER-OPEN: submit
    WRONG -> concept offer visible -> click -> ConceptDrawer with
    the offered title visible -> header ConceptSearch type "cad"
    -> suggestion -> open -> drawer switches (key-prop). (3) NO-OP:
    existing 7 e2e specs run UNCHANGED in the full-gates step.
11. Purity bump + gates: floor 44->50 same-commit; then
    lint -> test (2267/1/2 baseline, 2=CSS-WIP) -> build x2 ->
    check-links 362 -> check:paths -> e2e (sec 8 checklist order).

SM-2 GOLDEN TABLE (canonical SuperMemo-2; test computes exact ease
to 2 decimals - values below are the pinned expectations):

| Start (ease, interval, streak) | Grade | End (ease, interval, streak) |
|---|---|---|
| (2.50, 0, 0) fresh | 5 | (2.60, 1, 1) |
| (2.60, 1, 1) | 5 | (2.70, 6, 2) |
| (2.70, 6, 2) | 5 | (2.80, 16, 3) |
| (2.80, 16, 3) | 2 | (2.48, 1, 0) |
| (1.40, 6, 2) | 2 | (1.30 floor, 1, 0) |
| (2.50, 0, 0) | 2 | (2.18, 1, 0) |

Ease formula (pinned verbatim in test):
  ease' = ease + (0.1 - (5-g)*(0.08+(5-g)*0.02)); floor 1.3.
Interval rule: grade>=3: 1 (first) / 6 (second, i.e. prev==1) /
round(prev*ease) otherwise; grade<3: 1.

---

## 7. Implementation checklist (developer-executable order)

```
[ ] 1. src/lib/storage.ts K.pedagogySrs + K.pedagogyLog + STORAGE_KEYS rows (drift-guard pattern; no version bump)
[ ] 2. engine/ear-training/types.ts + generate.ts + generate.test.ts (7 types x 5 difficulties green; conceptIds resolve)
[ ] 3. engine/ear-training/distractors.ts + check.ts + check.test.ts enharmonic table red->green (D113)
[ ] 4. engine/pedagogy/srs.ts + log.ts + srs.test.ts (SM-2 goldens) + log.test.ts (summary math) + determinism.test.ts (300-seed sweep green)
[ ] 5. engine/purity.test.ts floor 44 -> 50 (SAME commit as step 2 first source)
[ ] 6. src/lib/srsStore.ts + pedagogyLog.ts + earHear.ts + earHear.test.ts (pure builders; no AudioContext in tests)
[ ] 7. src/components/useConceptPress.ts + ConceptSearch.tsx + tests (jsdom auto-glob, no config edit)
[ ] 8. src/components/ConceptDrawer.tsx footer (Hear example + Send to Explore; optional props only)
[ ] 9. src/components/AnalysisCard.tsx PED-6 hook on chord cells only (~20 lines; popover/tiers untouched)
[ ] 10. src/components/EarTrainingPanel.tsx + test (local state only; no dirty call - store pin)
[ ] 11. src/App.tsx TWO insertions only (header ConceptSearch + App-level drawer host; etude-section EarTrainingPanel anchor)
[ ] 12. e2e/ear-training.spec.ts (2 discriminative legs; existing 7 specs untouched)
[ ] 13. Gates: lint -> test (2267/1/2 + new, 2=CSS-WIP) -> build x2 -> check-links 362 -> check:paths -> e2e full
[ ] 14. Verify ids ship: grep -o "ear-" dist/assets/index-*.js present; grep pedagogy.srs key present in bundle strings
[ ] 15. Commit via PATHSPEC ONLY (never bare `git commit -a`; sec 8): feat(pedagogy): PRD-001 phase 6 COMPLETE - <types> + SRS/log + drawer global + PED-6 scoped + e2e <n/n>
```

---

## 8. Risks

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Enharmonic false-negative ships (string compare instead of pc compare) | med | high | D113 pc-equality everywhere + check.test.ts table + distractors filter pin; review gate: no note-name `===` in engine/ear-training (grep audit) |
| SM-2 constants drift from canonical (invented ease curve) | low | high | D114 golden vectors pinned to the published formula; ease math is one line with the exact expression; no invented grade bands (binary 2/5 mapping documented) |
| PED-6 gesture collides with existing bindings (MelodyLane nudge, popover click) | low | med | D103 scopes to AnalysisCard cells only (MelodyLane untouched); hook uses contextmenu + long-press + Shift+F10 (click path preserved for popover); title suffix discloses the gesture |
| Drawer concept invention (bare chord -> wrong concept claim) | med | high | D103 honest resolution (nearest annotation or search-prefill, never invention); truthfulness review gate (no conceptId without its detector/lookup on the same data) |
| Hear singleton contention with Compose/Explore audition | low | med | Singleton already stops prior sources on play (idempotent); Hear stops on unmount + on Send navigation; e2e leg pins the state machine; prompts < 90s so no cap truncation |
| SRS/log localStorage quota/corruption breaks panel | low | med | D107 adapters are defensive (corrupt -> fallback, quota -> void, caps 10/500); engine never touches storage (testable without jsdom); panel never blocks on I/O |
| Single-slice size (2-week nominal) slips on 7-type matrix | med | med | D102 cut line pre-authorized (engine Slice A shippable alone); no new scope without an ADR; dictation types share the pc-list checker (no duplicate work) |
| Gamified-score pressure reopens Q10 post-ship | low | low | D108 records the call with rationale (accuracy-% + streaks, no XP fields in any type); a gamified layer needs a new ADR + product sign-off, not a flag |
| Bare-commit reselects dirty-11 (S4 incident repeats; Task-cancelled residue) | med | high | GIT-001 strengthened: pathspec commits ONLY (`git add <exact Phase-6 paths>` + `git status` reconcile showing dirty-11 still staged-but-uncommitted); NEVER `git commit -a`, NEVER `git checkout --` (file-copy snapshots per PHASE-2-02); e2e_STATE legs run on the worktree, not the index |
| Q10 copy drifts into XP language ("Level", "points") | low | med | D108 honesty string pinned by component test (copy regex `correct.*streak`, no `level\|xp\|points` in EarTrainingPanel); review greps for those tokens |

Technical debt recorded in-round: TD-PED-6-REST (SVG-label + catalog-roman + dirty-host PED-6 remainder with the useConceptPress reuse note), TD-037 carried (dormant drawer references - still null, no placeholder URLs), TD-EXP-MOD/LITERAL/SLOT carried (untouched), TD-EAR-MIDI (Web MIDI + computer-keyboard full-answer input for dictation; Phase 6 ships on-screen piano buttons only).

---

## HANDOFF TO DEVELOPER (YAML)

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-24T00:00:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-6-PEDAGOGY.md"
      status: complete
      size: "this document (6 engine sources, 3 adapters, 3 components, 1 hook)"
    - name: "implementation_roadmap"
      status: complete
      tasks: 15
    - name: "adr_records"
      status: complete
      count: "D102-D114 (single-slice, PED-6-scoped, section-anchor, audio-reuse, dirty-not-dirty, store-vs-local, Q10-accuracy, PED-7/4-closed, drawer-global, example-generated, checker-honesty, SM-2-canonical)"
  CONSTRAINTS:
    - technical: "engine/ear-training/ + engine/pedagogy/srs+log pure (relative-only, Rng-injected, nowMs-param, no clock); floor 44->50 same-commit"
    - technical: "dirty-11 READ-only AND index-staged (never touch, never bare-commit); theory.ts/paths.ts/studies.ts/tests/README/SPEC/AGENTS/.kai off-limits; App.tsx TWO insertions only; ModeGate untouched"
    - technical: "no new audio engine/transport; earHear reuses composePreview singleton + VOICE_RECIPES; no new AudioContext in unit tests; audio output manual-per-policy"
    - technical: "ASCII only; no console except warn/error (engine silent); no any; enharmonic = pc-equality (sec 6 table); Q10 = accuracy-% + streaks, no XP fields"
    - timeline: "2-week nominal; single slice recommended; pre-authorized A/B cut line if forced"
    - resources: "1 senior dev minimum (checker honesty + SM-2 + crossover need theory care)"
  DECISIONS_MADE:
    - decision: "SINGLE pipeline (6 engine sources); optional A/B cut documented"
      confidence: "HIGH"
      rationale: "shared envelope+harness+nowMs pattern; fits nominal; split strands value"
    - decision: "PED-6 SCOPED to AnalysisCard chord cells (useConceptPress: right-click + 500ms long-press + Shift+F10); rest gated TD-PED-6-REST"
      confidence: "HIGH"
      rationale: "only CLEAN button-semantic host; honest nearest-annotation-or-prefill resolution; twice-deferred ends for Compose"
    - decision: "Etude sub-mode anchor is a SECTION below EtudeComposerPanel (no tab, no sub-route, no ModeGate edit)"
      confidence: "HIGH"
      rationale: "simplest that meets requirements; preserves D22/D37 layout; training attempts never dirty"
    - decision: "Ear Hear via earHear transient project+result through renderAccompaniment + existing singleton"
      confidence: "HIGH"
      rationale: "polyphonic + sequential truth is the recipe table; playNote loops jitter (F17 anti-precedent); zero new lifecycle"
    - decision: "Training attempts NEVER dirty (DirtyMap.etude only via acceptEtude)"
      confidence: "HIGH"
      rationale: "practice events are not composition edits (ADR-007); mode-switch prompt on a missed interval is hostile"
    - decision: "Store-vs-local: prompts/config/drawer local; SRS/log in localStorage OUTSIDE zustand (no v5, no migration)"
      confidence: "HIGH"
      rationale: "idea-library + performanceLog precedent; new OPTIONAL keys per D73/D85"
    - decision: "Q10: accuracy-% + streaks, NO XP/levels/badges (no XP fields in any type)"
      confidence: "HIGH"
      rationale: "honesty lineage (no invented currency); SRS already provides progression; PRD metrics need no points"
    - decision: "PED-7 CLOSED as Etude-only Notes toggle; PED-4 CLOSED on all three modes by adjacency"
      confidence: "HIGH"
      rationale: "verified shipped; no requirement for wider toggles or roll overlays"
    - decision: "Drawer global = header ConceptSearch + App-level host; footer = Hear example (generated numerals) + Send to Explore (seed carry)"
      confidence: "HIGH"
      rationale: "transient UI stays local (D98 precedent); exampleNumerals already D21-pinned so no authored audio"
    - decision: "Checker: pc-equality + same-pc distractor exclusion + dictation timing tolerance + melodic-only partial; SM-2 canonical with nowMs-param + due-bias selector"
      confidence: "HIGH"
      rationale: "REAL theory grading (Cb==B etc.); SRS claims pinned to published constants"
  IMPLEMENTATION_NOTES:
    - "Start with storage K-entries + ear types/generate + check table (the load-bearing honesty core)"
    - "Port NOTHING from quizEngine/rhythmDrill (F17/F18 anti-precedents); clean-room under Rng + pc-equality"
    - "Keep AnalysisCard edit to ~20 lines (hook spread on chord cells only); ConceptDrawer props widen optionally (existing hosts compile)"
    - "App.tsx insertions are header-search and section-anchor ONLY (no transport/mode logic)"
    - "Commit via PATHSPEC ONLY with git status reconcile (GIT-001 strengthened); dirty-11 stay staged-but-untouched"
  PROGRESS:
    - phases_completed: 5/5
    - total_time_spent: "design round"
    - retries: 0
    - quality_gates_passed: 5/5
  ESTIMATED_EFFORT:
    - implementation_hours: "60-80 (engine 30-40, surface 20-25, e2e+gates 10-15)"
    - testing_hours: "included (honesty + goldens + property + e2e legs)"
    - documentation_hours: "2 (TD entries + Q10 call note)"
  AUDIT_TRAIL:
    - timestamp: "2026-09-24T00:00:00Z"
      phase: "re-audit at HEAD b4b6a34 (audio, store v4, etude anatomy, drawer API, PED-6 hosts, PED-7/4 verify, quiz anti-precedent, e2e, gates, E2E_STATE)"
      duration: "design round"
      tools_used: "read, glob, grep, bash (git log/status, counts)"
      errors_encountered: "none (dirty-11 left untouched; no writes except this doc)"
```

