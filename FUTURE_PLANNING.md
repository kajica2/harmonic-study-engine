# Future Planning — Harmonic Study Engine

Status as of 2026-09-18 (session freeze). Everything below is grounded
in the current codebase — no roadmap item pretends an unpublished
feature exists. Companion docs: `IMPROVEMENT_PLAN.md` (the 8-option
teardown), `IMPROVEMENT_PLAN_TOP10.md`, `docs/COMPOSITION-ENGINE-PLAN.md`,
`docs/COMPOSITION-MVP-PLAN.md`, `TODO.md`, `CHANGELOG.md`,
`PERF_ROADMAP.md` (Vercel React Best Practices, phased).

## Where we are (verified baseline)

```
lint        tsc --noEmit            clean
frontend    818 passed / 1 skipped  (72 files)
backend     29 passed               (FastAPI, pytest)
e2e         7 passed                (Playwright/Chromium)
gate        node assets/check-links.cjs  green (363 tests)
build       vite build              green (510KB eager main)
deploy      Vercel linked; preview + production Ready
```

Shipped this sprint: vitest 5 + jsdom/localStorage test infra, adaptive
CI drift gate, vendor code-splitting, e2e expansion, the performance/
mastery log (option G) and its guide-tone bridge (option C → G).

## Near term — small, high-leverage (≤ 1 day each)

1. **Guide-tone live tally in the practice header.** — **SHIPPED**
   (2026-09-22, commit `eced8ed`, ADR-001). Exposes the live `tally` as
   an inline "✓ N · ✗ M" chip next to `GuideToneFeedback` so sight-
   reading practice gets immediate feedback without recording. Dims on
   pause, resets on path change.

2. **First-try vs rep #3 snapshots (option-G follow-up).** — **SHIPPED**
   (2026-09-20). Rep tracking on take records (`rep`) and a `±% vs rep #N-1`
   diff row in `RecentTakesPanel`.

3. **Path-level guide-tone coverage map.** — **SHIPPED**
   (2026-09-22, commit `d961f8b`, ADR-002). Precomputed per-bar guide-tone
   targets (`gtTargetsForPath`) rendered in `GtCoverageRow` below the bar
   strip with informational `✓/—` glyphs.

4. **Masterclass in-app enablement.**
   35 of 38 tunes are `inApp: false`. The ingest pipeline
   (`scripts/ingest_standards.py` → `studies.ts`) already emits Real
   Book voicings; enabling a tune = adding an 8-bar `HarmonicPath`
   entry + flipping `inApp: true`. Batch one MC-family at a time
   (MC 1–10 first) so the catalog grows without a big-bang change.

## Mid term — machine + product depth (2–5 days each)

5. **Take-comparison UI + timing heat map (option G, deferred piece).**
   Once rep-3 snapshots exist (item 2): per-path accuracy trend chart,
   and a per-bar heat strip showing which bars consistently miss guide
   tones. Data model already supports it — takes are keyed by pathId
   with `transitionsHit/Missed`.

6. **Guide-tone classifier upgrades (option C).**
   `classifyGuideTone` handles triads/sevenths well but labels
   tensions loosely ("color tone") and ignores inversions (bassPc vs
   rootPc is a known gap, pinned in `paths.test.ts`). Feed the chord
   root from `analyzeChord` into slot assignment so inversions classify
   correctly; surface 9th/11th/13th labels from `tensions`.

7. **Curriculum / briefing layer (option B completion).**
   `PathBriefing` exists; it currently templates from
   `mainExercise`/`description`. Write hand-curated briefings for the
   first masterclass batch (item 4) and persist dismissal per-session
   (already spec'd in IMPROVEMENT_PLAN section B).

8. **Composition layer → playable quests.**
   The 9 `src/lib/` modules (Markov melody, counterpoint, style packs,
   co-compose, quiz engine) are code-complete per ARCHITECTURE.md.
   The missing piece is a guided composition flow: a form template →
   co-compose suggestions → counterpoint warnings → export. See
   `docs/COMPOSITION-MVP-PLAN.md` for the 28 already-split tasks.

## Far term — strategic

9. **Replace / fork @magenta/music (audit endgame).**
   15 remaining npm audit items (minimist, protobufjs, quote-stream,
   static-module) are transitive no-fix from `@magenta/music`. Options:
   (a) pin a patched fork, (b) lazy-load the magentaHelper chunk even
   more aggressively (it already 2.5MB in its own chunk), (c) vendor
   only the RNN jams code the app actually uses. Do not hold the
   roadmap hostage to it — document as accepted risk meanwhile.

10. **Multi-workspace routing (IMPROVEMENT_PLAN H).**
    One clear practice loop is the current win and it works. Revisit
    Practice / Explore / Create / Record routing only if the masterclass,
    composition, and mastery surfaces each earn real traffic.

11. **DDSP on persistent infra.**
    `/synthesize` is a 503 on HF free tier (ddsp not installable).
    `render.yaml` exists for Render; a real model endpoint would power
    instrument synthesis behind the personas. Lowest priority — the app
    is fully functional without it.

12. **Take-log sync / export.**
    `hse.performance.log.v1` is localStorage-only. A JSON export
    (already have `performanceLog.ts` — one `exportTakes()` function)
    plus an optional server sync would make the mastery log durable
    across devices. Do this after item 2 so the schema is stable.

## Guardrails (from LOOP-PROMPT + repo invariants)

- Every commit: `npm run lint` + `npm run build` must pass.
- Test/SPEC/README/magenta-README counts are gated consistently:
  run `node assets/check-links.cjs` before committing doc changes.
  Frontend count = `it(` blocks in `tests/*.test.ts` only.
- New DOM-component tests must be added to `JSDOM_FILES` in
  `vitest.config.ts` (`projects` API replaced per-file env comments).
- Never commit secrets; `.env*`, `.venv/`, `server/requirements-arm64.txt`
  stay out.
- If a TODO item exceeds one iteration, split it before starting.

---

## PRD-001 alignment (2026-09-22)

The strategic product doc is `docs/PRD-001.md` - mode-driven workbench
(Compose / Etude / Explore + Learn cross-cutting). Where it conflicts
with the tactical items above, **PRD-001 wins** (it says so itself in
section 16). This section maps PRD phases to current state and tells
the loop which near-term work unblocks the strategic plan.

### PRD Phase 0 - Foundations

| PRD item | Status | Notes |
|---|---|---|
| Add `tonal`, `@tonejs/midi` | NOT STARTED | `package.json` only has `fflate` + `midi-writer-js`. Add when starting Phase 0. |
| MIDI-first internal notes | PARTIAL | `HarmonicPath.steps[].notes` already in MIDI; `chordNames` are user-facing. No migration needed. |
| `mulberry32` PRNG | SHIPPED | `src/magenta/noise.ts`. REQ-FND-2 / REQ-FND-3 already covered. |
| `StyleProfile` types + 3 profiles | SHIPPED - Phase 0, 2026-08-08 | `engine/styles/`: the PRD's `StyleProfile` (harmony/melody/rhythm/voicing + registers, versioned, `validateStyleProfile` gate) + 3 shipped profiles (`jazz`, `pop`, `classical`) consumed by the Phase 3 etude + Phase 4 S3 accompaniment generators. The old note was stale: `src/data/styles/` "style packs" remain backing-engine config - a separate concept, untouched. |
| Versioned data model + migrations skeleton | PARTIAL | `usePersistedState` keys already versioned informally (e.g. `hse.performance.log.v1`). No formal migration runner. |
| Lint rule against `Math.random` in `engine/` | NOT STARTED | No `engine/` directory today. Add when Phase 0 lands. |

### PRD Phase 1 - Mode selector & scaffolding

| PRD item | Status | Notes |
|---|---|---|
| Mode selector component | NOT STARTED | Today the app is a single workspace; modes are sections of one screen. Big refactor. |
| URL + localStorage persistence for mode | NOT STARTED | Easy once the selector exists. |
| Dirty-state tracking + prompt | NOT STARTED | Requires the `Idea` model. |
| Idea bar with chip | NOT STARTED | New global component. |
| Empty states per mode | NOT STARTED | Most empty states are "load a path" today. |

### PRD Phase 2 - Transposition

| PRD item | Status | Notes |
|---|---|---|
| Global transpose | SHIPPED - Phase 2, 2026-09-23 | zustand `globalTranspose` (+/-24 clamp) is the single source of truth; persists to `hse.session` + URL-syncs (boot precedence URL > persisted > legacy one-shot > 0). Pre-Phase-2 row was wrong: the legacy `transposeShift` had NO persistence writer and `?transpose=` drove nothing audible. |
| Per-exercise transpose (Etude) | SHIPPED - Phase 2, 2026-09-23 | `exerciseTranspose` (+/-12) via `src/components/TransposeControls.tsx` (Etude-only row); sounding shift = global + exercise, applied at playback/export time, never baked into path data (REQ-TRANS-7). |
| Compose key + opt-in offsets (REQ-TRANS-3) | DEFERRED - Phase 4 | Full Compose-mode transposition semantics deferred with the Compose surface (`docs/PHASE-2-TRANSPOSITION.md` section 7). |
| Effective key display | SHIPPED - Phase 2, 2026-09-23 | `src/components/EffectiveKeyBadge.tsx` (`role="status"`, `aria-live="polite"`): keyed / drift / pitch-only fallback content forms; spelling in `engine/core/spelling.ts`. |
| Cycle-all-12-keys | SHIPPED - Phase 2, 2026-09-23 | "Cycle 12" toggle advances the exercise offset +1 mod 12 per form pass (`src/lib/keyCycle.ts` x `detectFormPeriod`); suppressed under sub-range section loops. |
| Keyboard `[` / `]` / `Shift+[` / `Shift+]` | SHIPPED - Phase 2, 2026-09-23 | Brackets transpose the global offset -1/+1 and -12/+12 with Shift (PRD 9.7), matched by `e.code`; tempo +/-5 moved to `,` / `.` (muscle-memory change). Pre-Phase-2 row was wrong: the bracket bindings were tempo, not transpose. |

### PRD Phase 3 - Etude mode

| PRD item | Status | Notes |
|---|---|---|
| Constraint panel (style, key, mode, difficulty, bars, tempo, seed) | SHIPPED - Phase 3 slice 2, 2026-09-23 | `EtudeComposerPanel` on the Etude surface (full-width, below the practice rail): 7 core controls + Generate + Randomize-seed + collapsible Advanced. Carve-out: advanced constraints ship 6 of 9 (`allowedQualities` / `allowedNumerals` / melody `range` deferred, D29). Legacy Generator Lab assistant coexists untouched. Docs: `docs/ETUDE-COMPOSER.md`. |
| Harmony / melody / difficulty generators | SHIPPED (engine) - Phase 3 slice 1, 2026-09-23 | `engine/etude/` + `engine/pedagogy/`: `generateEtude` - seeded deterministic harmony/melody generators over the Phase 0 `StyleProfile`s with difficulty scaling (REQ-ETU-10..15) + the 8-concept truthfulness annotator (REQ-PED-1/2/3/10/11). User-facing since slice 2 (`EtudeComposerPanel` + `src/lib/etudeEngine.ts` adapter); annotations stay data-only until slice 3 (no display surface). Legacy `melodyMarkov.ts`/`coCompose.ts` stay in `src/lib/` (superseded; consumers untouched). Design: `docs/PHASE-3-ETUDE.md`; docs: `docs/engine-etude.md`. |
| Piano roll for etude | SHIPPED - Phase 3 slice 2, 2026-09-23 | Static SVG display roll (`EtudePianoRoll.tsx`): Okabe-Ito palette with shape redundancy, screen-reader summary. Carve-out: display-only - the piano-roll EDITOR stays Phase 8. |
| Staff notation via VexFlow | SHIPPED via abcjs - Phase 3 slice 2, 2026-09-23 (Q2 RESOLVED, D16: VexFlow dropped) | abcjs is retained for ALL staff rendering (the only installed renderer; the PRD's VexFlow premise never held). REQ-ETU-21 ships as `EtudeStaffView.tsx` (lazy; pure ABC builder `src/lib/etudeAbc.ts` - chord symbols, bar-crossing ties); `LiveScoreDisplay` untouched. `docs/PHASE-3-ETUDE.md`. |
| MIDI export | SHIPPED | `src/lib/midiExport.ts` covers `asWritten` + `splitTracks`. |
| MusicXML export | SHIPPED - Phase 3 slice 2, 2026-09-23 (melody voice) | `toMusicXml` gains an additive second part P2 (melody) behind the "MusicXML (with melody)" button - true-form export; chord-only exports stay byte-identical (frozen pins). Carve-out: the melody ships as notation + roll only - melody AUDIO playback is NOT wired (chord backing plays through the existing chain). |
| URL constraint serialization (shareable etude links, REQ-ETU-3) | SHIPPED - Phase 3 slice 2, 2026-09-23 | `?style=&key=&tmode=&diff=&bars=&tempo=&seed=` (+ advanced keys) via the single debounced replaceState writer; same URL => same etude (round-trip pinned). `tmode` avoids the `mode=` collision with the app-mode selector. Carve-outs: boot read only (no popstate/back-forward, TD-027), no copy-link button. |
| Metronome settings (volume / presets / subdivision / accents, REQ-PRAC-1/2) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Click-settings gear popover in `PracticeHeader`: independent click bus (playback volume cannot touch the click; the click left the recording tap by design), 3 syntheses (beep/click/shaker), beat-relative subdivision 1-4 (triplets ride WebAudio scheduling beside the immutable 16th grid), meter-derived accent chips (4/6/7/11/16). All prefs persist (fixes the latent `metronomeOn` read-with-no-write bug). Default config is bit-identical to the legacy click (exhaustive per-meter oracle vs the frozen `tests/rhythm.test.ts` spy). Docs: `docs/PRACTICE-MECHANICS.md`. |
| Count-in (REQ-PRAC-10/11) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Pre-roll gate (`requestPlayState`) upstream of the transport: the countdown fires before ANY playback starts (grid/backing/chords untouched by construction), visible beats-left overlay (`aria-live`), 0/1/2 bars, second-press cancels, clicks sound even with the Click toggle off (opt-in IS the consent), subdivision deliberately not applied to the pre-roll. e2e leg: `e2e/count-in.spec.ts`. |
| Annotation surfaces + Concept drawer (REQ-PED-4/5/7) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Margin-note chips + "About this etude" panel + Notes toggle in `EtudeViews`; concept chips open the right-slide `ConceptDrawer` (on `ModalShell`: focus trap/restore, Escape). Carve-outs: REQ-PED-4 Compose portion SHIPPED since Phase 4 slice 2, 2026-09-23 (analysis annotation chips under the chart open the ConceptDrawer - `AnalysisCard`; see `docs/COMPOSE-MODE.md`); Explore annotation host still deferred (dirty files); REQ-PED-6 right-click chord -> drawer deferred (D39); REQ-PED-12 search + REQ-PED-13 hear-example / send-to-explore deferred (D38). |
| Print (REQ-ETU-32) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Global `@media print` block + `print-area`/`print-hide` classes + WYSIWYG Print button in the etude views (active tab + visible annotations; light-token flip, 14 mm margins). Etude views only - other surfaces can opt in later. |
| Section loop ranges on generated etude paths (F3) | USER-DECISION - open | The sub-range loop math in the transport's measure handler assumes 4 steps/bar; etude paths carry 1 step/bar, so a start/end-bar range lands on the wrong window (whole-path looping unaffected). Pre-existing, not worsened by slice 3; fixing it touches the sacred handler - dedicated transport slice vs ~10-line rail gate fast-follow, per `docs/PHASE-3-SLICE3.md` D41. |

### PRD Phase 4 - Compose mode

**Phase 4: COMPLETE - 2026-09-24** (all rows below SHIPPED; honest
carve-outs: stems ZIP REQ-COMP-42 deferred TD-046, /play route
REQ-IO-52 deferred TD-047, audition capped at the first 1:30 / WAV
at 10:00, human LISTEN CHECK OPEN - RK-S4-1/RK6).

| PRD item | Status | Notes |
|---|---|---|
| MIDI upload + parse | SHIPPED (upload UI) - Phase 4 slice 2, 2026-09-23 | `engine/compose/` + the `src/lib/composeMidi.ts` adapter: SMF 0/1/2 parse -> tick-native `NormalizedProject` (30MB cap pre-parse, meter/tempo-map aware, never-throwing `Outcome`). User-facing since slice 2: `UploadDropZone` (drag-drop + browse, extension gate) on a real three-state `ComposeSurface`; zero network calls (REQ-IO-71). Carve-outs: the 30MB project is NOT persisted - a reload asks for the file again (hash-gated restore of your edits). Pre-slice-1 row was FALSE (C1): `ImportExportModal` does NOT read `.mid` - it is a text-only (.txt/.json/.irealb) importer for the etude catalog; the parse pipeline was 100% greenfield. Docs: `docs/engine-compose.md`, `docs/COMPOSE-MODE.md`. |
| Track role classification | SHIPPED (engine) - Phase 4 slice 1, 2026-09-23 | `classifyRoles` (`engine/compose/roles.ts`): deterministic feature-scored melody/bass/harmony/percussion/unknown + confidence (REQ-COMP-4). The old row ("no formal classifier", only the `midiExport.buildSplitTracks` lowest-note heuristic) predates it. User-facing since slice 2 (melody-track select + the analysis card's role-derived reads). |
| Key / melody / chord analysis | SHIPPED (engine) - Phase 4 slice 1, 2026-09-23 | `detectKey` (hand-rolled Krumhansl-Schmuckler, top-3 candidates + atonal chromatic fallback), `extractMelody` (confident role track, else top-line synthesis), `inferChords` (tick-aligned grid, calibrated confidence + top-3 alternatives) behind `analyzeProject`. Carve-outs: accuracy proven on the SEEDED SYNTHETIC corpus only (key top-1 24/24, chord roots 768/768 - idealized diatonic material; real-world MIDI unproven, RK2 open); `@tonejs/midi`'s encoder does NOT round-trip key signatures (upstream +14-off bug) - the slice 4 export BYPASSES it (midi-file spec-correct event insertion, golden-tested). |
| Editable analysis card (+ melody preview) | SHIPPED - Phase 4 slice 2, 2026-09-23 | `AnalysisCard`: key/tempo/meter/melody-track/chord cells all overridable (REQ-COMP-20/21) with confidence tiers + the D58 `blendKeyEvidence` honesty blend (H1: correlation alone never auto-accepts; H2: declared-vs-inferred conflict always banners with a declared-default radio); `ChordCellPopover` editor (autocomplete, top-3 common options, delete-to-rest, split-bar-in-two via the D60 `mergeGrid` append fix) + store-resident snapshot undo, Cmd/Ctrl+Z (REQ-COMP-23/24, cap 32); tick-native `ComposePianoRoll` melody preview (REQ-COMP-5 melody-only carve) + 4-min default window with analyze-full (REQ-COMP-53); annotation chips open the ConceptDrawer (REQ-PED-4/5 Compose host). Carve-outs: full playback/mixer SHIPPED in S4 (mixer row below), accompaniment generation SHIPPED in S3 (next row), URL-serialize + MIDI/WAV export SHIPPED in S4 (mixer row below); no roll editing (Phase 8). There was never a separate "preview" row - the roll ships here. Docs: `docs/COMPOSE-MODE.md`. |
| Accompaniment generation | SHIPPED - Phase 4 slice 3, 2026-09-23 | `engine/compose/patterns.ts` AUTHORS the PRD's missing "Pattern Library reference" (14 patterns: 8 chord + 6 bass, thinning ranks; content: `docs/PATTERN-LIBRARY.md`) + `voicing.ts` (clean-room SEQUENTIAL voice-lead, 5 style shapes - REQ-COMP-31/32) + `bass.ts` (seeded idiomatic resolvers: walking approaches, boogie b7, slash-bass - REQ-COMP-34) + `accompany.ts` (plan/realize: density THINS, never reshapes - REQ-COMP-33; seed determinism + Randomize - REQ-COMP-36; accompaniment-only transpose - REQ-TRANS-3). UI: `AccompanimentPanel` (style/roles/density 0..5/register/seed + staleness chip + annotation chips), overlay roll layers, +2 concepts (walking-bass, comping). `backingEngine` remains separate (it plays existing style tracks; it does not generate to a user's chart). Carve-outs: PREVIEW (D72) is accompaniment-only, offline-rendered, capped at the first 1:30 on long charts; full mix + mixer + combined export + chart-paste SHIPPED in S4 (next row). RK6 musicality is human-gated: the MANUAL LISTEN CHECK is OPEN (the e2e pins the preview state machine, not the sound). Docs: `docs/PATTERN-LIBRARY.md`, `docs/engine-compose.md` (S3 section), `docs/COMPOSE-MODE.md`. |
| Mixer + exports + chart paste + URL | SHIPPED - Phase 4 slice 4, 2026-09-24 | The phase-completing slice (D77..D92): 4-group MIXER (REQ-COMP-37 - per-group baked AudioBuffers + live GainNode buses; knobs are instant AudioParam writes, mute wins over solo AS PINNED by computeGroupGains; drum-audition skip + chart-only state disclosed in the UI), COMBINED MIDI export (REQ-COMP-40 - originals incl. drums untransposed + generated roles, effective tempo map + time sigs + spec-correct key signatures via midi-file event insertion past the broken @tonejs encoder, golden-tested; key-in-filename REQ-COMP-43), FULL-MIX WAV (REQ-COMP-41 - mono, current gains, peak-safe, 10:00 cap), CHART PASTE (REQ-IO-10..16 - `engine/compose/chordchart.ts` grammar with {key:}/{tempo:}/{time:}/{style:} directives, % repeats, deterministic slash rule; editable preview; human reference `docs/CHART-FORMAT.md`), SESSION URL (REQ-IO-50/51 - 7 compose keys on the single ADR-015 writer, 6000-char governor + honest too-large notice, hash-gated cross-device file restore, chart auto-heal). Tempo/meter overrides became TRUE everywhere (D79, TD-043 closed); fingerprint honors bassPc (TD-044 closed). Carve-outs: stems ZIP (REQ-COMP-42) DEFERRED - TD-046; /play route (REQ-IO-52) DEFERRED - TD-047; audition capped (1:30 play-mix / 10:00 WAV); mixer audio quality + WAV-listen human-gated - the LISTEN CHECK is OPEN (RK-S4-1). Docs: `docs/PHASE-4-S4-MIXER-EXPORT.md`, `docs/COMPOSE-MODE.md`, `docs/CHART-FORMAT.md`, `docs/engine-compose.md` (S4 section). |
| WAV export | SHIPPED - Phase 4 slice 4, 2026-09-24 (Compose full mix; premise corrected C2) | The old note was FALSE: `Tone.Offline` does not exist (zero `Tone.` imports in src/; tone is a @magenta/music transitive). Offline WAV DOES ship user-facing via raw `OfflineAudioContext` + hand-rolled `encodeWav` in `src/lib/loopWav.ts` (backing-track loop render). Compose full-mix WAV (REQ-COMP-41) SHIPPED in slice 4: mono 44.1k at the CURRENT mixer gains, peak-safe, 10:00 cap (encodeWav REUSED - no second RIFF writer). Carve-out: per-stem ZIP export (REQ-COMP-42) deferred - TD-046. |
| Privacy statement on upload | SHIPPED - Phase 4 slice 2, 2026-09-23 (aside since the Phase 1 stub) | REQ-IO-70 aside ("never leaves this tab") survives verbatim in the empty state + a compact loaded-state line; REQ-IO-71 (never upload without opt-in) holds structurally: zero network calls in the pipeline (test-pinned). |

### PRD Phase 5 - Explore mode

| PRD item | Status | Notes |
|---|---|---|
| Seed-based exploration | NOT STARTED | No Explore surface today. |
| Reharmonize + substitute | PARTIAL | `coCompose.ts` reharmonizes a single bar; no full progression reharm. |
| Idea cards with rationale + concept links | NOT STARTED | Depends on Pedagogy layer (Phase 6). |

### PRD Phase 6 - Pedagogy

| PRD item | Status | Notes |
|---|---|---|
| Annotations on every artifact | SHIPPED | Phase 3 slice 3 - ETUDE portion: margin-note chips + "About this etude" + Notes toggle in `EtudeViews` (annotations on every etude artifact). Phase 4 slice 2 - COMPOSE portion: analysis annotations under the editable chart (chips open the ConceptDrawer; see `docs/COMPOSE-MODE.md`). Explore annotation host deferred (dirty files). |
| Concept registry (>= 8 concepts) | NOT STARTED | `TERMINOLOGY.md` exists as a glossary; no structured Concept type. |
| Concept drawer | SHIPPED | Phase 3 slice 3: right-slide `ConceptDrawer` on `ModalShell` (REQ-PED-5), opened from etude annotation chips (and Compose analysis chips since Phase 4 slice 2); global hosts + right-click entry deferred (D39). |
| Ear training sub-mode | NOT STARTED | Quiz module (`src/data/quizzes/`) covers quiz topics; not ear training. |
| Spaced repetition | NOT STARTED | New. |

### PRD Phase 7 - Practice deepening

| PRD item | Status | Notes |
|---|---|---|
| Metronome | SHIPPED | `src/lib/rhythm.ts` + `metronomeEnabled` state; toolbar toggle. |
| Count-in | SHIPPED | Phase 3 slice 3: visible beats-left overlay + pre-roll gate (`requestPlayState`, 0/1/2 bars, second-press/Escape cancels); e2e `e2e/count-in.spec.ts`. |
| Section looping | SHIPPED | Loop range picker exists (curated paths; etude paths = F3 USER-DECISION - the sub-range math assumes 4 steps/bar). |
| A/B compare | NOT STARTED | New. |
| Tempo ramp | NOT STARTED | New. |
| Latency calibration | NOT STARTED | New. |
| Web MIDI input (device list, permission) | SHIPPED | `src/lib/midiIn.ts` + `MidiInPicker.tsx` + `midiClock.ts` (clock sync). |
| Channel routing for MIDI input | SHIPPED | Channel-split for bass (commit 63d2ca5) - the foundation PRD REQ-IO-3 needs. |
| Played-correctly detection | NOT STARTED | New; depends on PRAC-40 latency calibration. |

### PRD Phase 8 - Extended I/O

| PRD item | Status | Notes |
|---|---|---|
| Chord-chart paste | SHIPPED early - Phase 4 slice 4, 2026-09-24 | Shipped with Compose, not Phase 8: `engine/compose/chordchart.ts` (directives/%/rests/slash rule, editable preview; grammar: `docs/CHART-FORMAT.md`). The old row ("no paste parser") predates it. |
| Piano-roll editor | NOT STARTED | New. |
| WAV export (user-facing) | SHIPPED | Buttons exist: backing-loop render (`src/lib/loopWav.ts`, Practice) + Compose full-mix WAV (Phase 4 slice 4, `src/lib/composeExport.ts`). The old row's premise was stale. |
| MusicXML export | NOT STARTED | New (Q2 / Phase 3 decision). |
| ABC export | PARTIAL | `sheetMusicExport.ts` exists. |
| Session sharing via URL | SHIPPED (Compose) - Phase 4 slice 4, 2026-09-24 | Compose session (file identity + hash, chart text, overrides, request, mixer) serializes on the single debounced writer with a 6000-char governor + honest too-large notice; Etude constraints shipped in Phase 3 slice 2; practice state predates both. The old row ("No URL serialization") was stale. Carve-out: the /play page below. |
| `/play` route for idea links | DEFERRED - TD-047 | REQ-IO-52 deliberately deferred at Phase 4 S4 (parent X10): no router exists, the app is single-route; revisit with a real routing decision. |

### PRD Phase 9 - Polish & launch

Nothing to ship here yet; this phase only makes sense once Phases 0-8
are close to done. Snapshot tests for all generators is the cheapest
unblocker and can run incrementally against any shipped generator.

### Recommended first moves (PRD-aware, fit in <= 1 day each)

These are the highest-leverage near-term items from the PRD that are
also small enough to land without restructuring:

1. **Idea type stub (REQ-IDEA-1)** - define `Idea` as a tagged union
   in `src/lib/idea.ts`. No consumers yet. ~30 lines + 5 tests.
   Unblocks Phase 1 (mode selector + Idea bar).
2. **Privacy statement on MIDI import (REQ-IO-70)** - single
   `<aside>` next to the file input in `ImportExportModal.tsx`.
   Trivial. Unblocks Phase 4.
3. **Engine modules audit (REQ-FND-7)** - grep for `Math.random`
   in `src/lib/` and replace with the existing `mulberry32` import
   from `src/magenta/noise.ts`. Already-true invariant; the audit
   just makes it grep-able. ~1 file touched.
4. **Effective key display (REQ-TRANS-4)** - render the current
   sounding key in the header next to the transposition buttons.
   Single component, ~15 lines.
5. **Per-exercise transpose stub (REQ-TRANS-2)** - add an
   `exerciseTranspose` field to `useSessionStore` and a +/- pair in
   the toolbar (disabled until Etude mode exists). No UI behavior
   change yet; just the persisted field + UI affordance.

These five items are intentionally cheap: each is one PR, no new
external dependencies, no architectural decision needed. They prime
the codebase for the Phase 0/1/2 work without committing to the
multi-week Etude / Compose / Explore builds yet.
